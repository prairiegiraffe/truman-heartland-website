// Admin chatbot endpoint.
//
// Request:  POST /api/chat
//   body: {
//     slug: string            // active page the editor is viewing
//     messages: ChatMessage[] // full conversation history (client holds it)
//   }
//
// Response: non-streaming JSON
//   {
//     messages: ChatMessage[]  // assistant messages to append (text + tool activity)
//     activity: ActivityEvent[] // tool call summaries for the UI activity log
//     proposals: Proposal[]    // any pending proposals the user must confirm
//     usage: { input_tokens, output_tokens }
//   }
//
// The server holds no state between requests. The client keeps the message
// history and sends it back with each turn.

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

import { getDB, getPage } from '../../lib/d1';
import { TOOLS, TOOL_DEFINITIONS, type Proposal, type ToolCtx } from '../../lib/ai/tools';
import { buildSystemPrompt } from '../../lib/ai/system-prompt';

export const prerender = false;

const MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ROUNDS = 8; // ceiling on tool-use iterations per turn

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface ClientMessage {
  role: 'user' | 'assistant';
  /**
   * Wire shape mirrors Anthropic's input_messages: either a plain string or
   * an array of content blocks. The client stores whatever the server sends
   * back verbatim and echoes it on the next turn.
   */
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: unknown }
        | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
      >;
}

interface ActivityEvent {
  label: string;
  detail?: string;
  status: 'ok' | 'proposed' | 'error';
  toolUseId: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ locals, request }) => {
  const env = locals.runtime?.env as { ANTHROPIC_API_KEY?: string } | undefined;
  if (!env?.ANTHROPIC_API_KEY) {
    return json({ error: 'admin disabled (ANTHROPIC_API_KEY not set)' }, 503);
  }

  const db = getDB(locals);
  let body: { slug?: string; messages?: ClientMessage[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json({ error: 'messages required' }, 400);

  // Pull active-page context for the system prompt.
  const page = await getPage(db, slug);
  if (!page) {
    return json({ error: `page not found: ${slug}` }, 404);
  }
  const system = buildSystemPrompt({
    slug: page.slug,
    path: page.path,
    title: page.title,
    template: page.template,
    sectionCount: (page.sections as unknown[]).length,
  });

  // The user's most recent message drives the chat_turn metadata attached to
  // any D1 writes this turn triggers. We pull it out once, up front.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userMessage = extractUserText(lastUser?.content);

  const ctx: ToolCtx = {
    db,
    activeSlug: slug,
    chatTurn: { userMessage, toolCalls: [] },
    pendingProposals: [],
  };

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Convert client messages to Anthropic input_messages.
  let conv: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content as Anthropic.MessageParam['content'],
  }));

  const activity: ActivityEvent[] = [];
  const newAssistantMessages: ClientMessage[] = [];
  const toolResultMessages: ClientMessage[] = [];
  let usage = { input_tokens: 0, output_tokens: 0 };

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system,
        tools: TOOL_DEFINITIONS,
        messages: conv,
      });

      usage.input_tokens += resp.usage?.input_tokens ?? 0;
      usage.output_tokens += resp.usage?.output_tokens ?? 0;

      // Record the assistant turn so the client can echo it next time.
      const assistantContent = resp.content as ClientMessage['content'];
      newAssistantMessages.push({ role: 'assistant', content: assistantContent });
      conv.push({ role: 'assistant', content: resp.content });

      // If the model didn't request any tools, we're done.
      const toolUses = resp.content.filter((b): b is Extract<typeof resp.content[number], { type: 'tool_use' }> => b.type === 'tool_use');
      if (toolUses.length === 0) break;

      // Run each requested tool; assemble a tool_result message for the next round.
      const toolResultBlocks: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const use of toolUses) {
        const tool = TOOLS[use.name];
        if (!tool) {
          toolResultBlocks.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify({ error: `unknown tool: ${use.name}` }), is_error: true });
          activity.push({ label: use.name, detail: 'unknown tool', status: 'error', toolUseId: use.id });
          continue;
        }
        ctx.chatTurn.toolCalls.push({ name: use.name, input: use.input });
        try {
          const { result, activity: act } = await tool.run(use.input, ctx);
          const content = JSON.stringify(result);
          toolResultBlocks.push({ type: 'tool_result', tool_use_id: use.id, content });
          if (act) activity.push({ ...act, toolUseId: use.id });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toolResultBlocks.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify({ error: msg }), is_error: true });
          activity.push({ label: use.name, detail: msg, status: 'error', toolUseId: use.id });
        }
      }

      // Push the tool results back into the conversation for the next round.
      const toolMsg: ClientMessage = { role: 'user', content: toolResultBlocks };
      toolResultMessages.push(toolMsg);
      conv.push({ role: 'user', content: toolResultBlocks });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `chat failed: ${msg}` }, 500);
  }

  return json({
    // Assistant + tool-result messages to append to the client's history, in order.
    messages: interleave(newAssistantMessages, toolResultMessages),
    activity,
    proposals: ctx.pendingProposals,
    usage,
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function extractUserText(content: ClientMessage['content'] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join(' ');
}

/**
 * Interleave assistant turns with the tool_result messages that followed
 * each one, so the client can append both in order to its history.
 * Pattern: [A0, T0, A1, T1, ..., An] where the last An is the final reply
 * (no tool calls).
 */
function interleave(assistants: ClientMessage[], tools: ClientMessage[]): ClientMessage[] {
  const out: ClientMessage[] = [];
  for (let i = 0; i < assistants.length; i++) {
    out.push(assistants[i]);
    if (tools[i]) out.push(tools[i]);
  }
  return out;
}
