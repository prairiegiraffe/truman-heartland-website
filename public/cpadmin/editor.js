(() => {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') ?? '';
  const slugPath = slug.split('/').map(encodeURIComponent).join('/');

  // ---------- State ---------------------------------------------------------
  let page = null;
  let templates = [];
  let universalSections = ['legacy-html', 'custom-block'];
  const chatHistory = [];

  // ---------- DOM refs ------------------------------------------------------
  const titleEl = document.getElementById('page-title');
  const pathEl = document.getElementById('page-path');
  const templateChipEl = document.getElementById('page-template-chip');
  const viewLive = document.getElementById('view-live');
  const viewLivePreview = document.getElementById('view-live-preview');

  const inputTitle = document.getElementById('input-title');
  const inputSubtitle = document.getElementById('input-subtitle');
  const inputTemplate = document.getElementById('input-template');
  const inputSections = document.getElementById('input-sections');
  const inputLegacyBody = document.getElementById('input-legacy-body');
  const templateDescription = document.getElementById('template-description');
  const sectionsHint = document.getElementById('sections-hint');
  const saveStatus = document.getElementById('save-status');

  const chatFeed = document.getElementById('chat-feed');
  const chatEmpty = document.getElementById('chat-empty');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  const previewSummary = document.getElementById('preview-summary');
  const versionsList = document.getElementById('versions-list');

  // ---------- Helpers -------------------------------------------------------
  function fmtDate(ms) {
    return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderTemplateOptions() {
    inputTemplate.innerHTML = '';
    for (const t of templates) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label;
      if (page && page.template === t.id) opt.selected = true;
      inputTemplate.appendChild(opt);
    }
  }

  function renderTemplateInfo() {
    const t = templates.find((x) => x.id === inputTemplate.value);
    if (!t) { templateDescription.textContent = ''; sectionsHint.textContent = ''; return; }
    templateDescription.textContent = t.description;
    const preferred = t.preferredSections.join(', ');
    sectionsHint.textContent = 'Preferred kinds: ' + (preferred || '—')
      + '. Always available: ' + universalSections.join(', ') + '.';
  }

  function renderPreviewSummary() {
    if (!page) { previewSummary.innerHTML = ''; return; }
    const sections = Array.isArray(page.sections) ? page.sections : [];
    if (sections.length === 0) {
      previewSummary.innerHTML = '<p class="admin-dim">No sections yet.</p>';
      return;
    }
    const frag = document.createElement('div');
    frag.style.display = 'flex';
    frag.style.flexDirection = 'column';
    frag.style.gap = '.5rem';
    sections.forEach((s, i) => {
      const card = document.createElement('div');
      card.style.border = '1px solid var(--border)';
      card.style.borderRadius = '6px';
      card.style.padding = '.6rem .8rem';
      card.style.background = 'var(--panel-2)';
      const summary = summariseSection(s);
      card.innerHTML = '<div style="display:flex;justify-content:space-between;gap:.5rem;align-items:baseline;">'
        + '<strong style="font-size:.85rem;">' + (i + 1) + '. ' + escapeHtml(s.kind || '?') + '</strong>'
        + '<span class="admin-dim" style="font-size:.75rem;">' + escapeHtml(summary.badge || '') + '</span>'
        + '</div>'
        + '<p style="margin:.3rem 0 0;font-size:.85rem;color:var(--text-dim);">' + escapeHtml(summary.label) + '</p>';
      frag.appendChild(card);
    });
    previewSummary.innerHTML = '';
    previewSummary.appendChild(frag);
  }

  function summariseSection(s) {
    const k = s.kind;
    const t = s.title || s.heading || '';
    let label = t;
    let badge = '';
    switch (k) {
      case 'legacy-html': label = 'Raw HTML · ' + (s.html?.length ?? 0) + ' chars'; break;
      case 'custom-block': label = s.label || 'Custom block'; badge = 'AI'; break;
      case 'hero-banner':
      case 'page-banner': label = s.title; if (s.subtitle) label += ' — ' + s.subtitle; break;
      case 'split':
      case 'image-split': label = (s.title || '(no title)') + (s.image?.src ? ' · w/ image' : ''); break;
      case 'stat-grid':
      case 'icon-cards':
      case 'bordered-cards':
      case 'feature-grid':
      case 'timeline':
      case 'steps-numbered':
      case 'testimonials':
      case 'pricing-tiers':
      case 'details-grid':
      case 'faq-accordion':
      case 'image-mosaic':
      case 'floating-cards':
        label = (s.title || '(no title)') + ' · ' + (s.items?.length ?? 0) + ' items';
        break;
      case 'story-spotlight':
      case 'image-quote':
        label = '"' + (s.quote || '').slice(0, 80) + (s.quote?.length > 80 ? '…' : '') + '"';
        break;
      case 'cta-band':
      case 'highlight-box':
        label = s.title; break;
      case 'dual-panels':
        label = (s.items?.length ?? 0) + ' panels'; break;
      case 'image-fade':
        label = s.title; break;
      case 'sidebar-layout':
        label = (s.sidebar?.length ?? 0) + ' sidebar cards · ' + (s.main?.length ?? 0) + ' main sections';
        badge = s.sidebarPosition || 'right';
        break;
      default:
        label = t || '(unnamed)';
    }
    return { label, badge };
  }

  function renderVersions(versions) {
    versionsList.innerHTML = '';
    if (!versions || versions.length === 0) {
      versionsList.innerHTML = '<li><span class="admin-dim">No edits yet.</span></li>';
      return;
    }
    for (const v of versions) {
      const li = document.createElement('li');
      li.innerHTML = '<div>'
        + '<strong>' + fmtDate(v.createdAt) + '</strong>'
        + '<span class="chip chip--muted" style="margin-left:.5rem;">' + (v.author || 'unknown') + '</span>'
        + '</div>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-btn admin-btn--ghost';
      btn.textContent = 'Revert to this';
      btn.onclick = () => revertTo(v.id);
      li.appendChild(btn);
      versionsList.appendChild(li);
    }
  }

  function renderEmpty() {
    if (!page) return;
    const suggestions = suggestedPrompts(page.template);
    chatEmpty.innerHTML = '';
    const hello = document.createElement('p');
    hello.className = 'chat-empty__hello';
    hello.innerHTML = 'Hi! I can edit <strong>' + escapeHtml(page.title) + '</strong> ('
      + escapeHtml(page.template) + ' template, '
      + (Array.isArray(page.sections) ? page.sections.length : 0) + ' sections) for you.';
    chatEmpty.appendChild(hello);
    const try_ = document.createElement('p');
    try_.className = 'chat-empty__try';
    try_.textContent = 'Try one of these:';
    chatEmpty.appendChild(try_);
    const wrap = document.createElement('div');
    wrap.className = 'chat-suggestions';
    for (const s of suggestions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-suggest';
      btn.textContent = s.label;
      btn.onclick = () => { chatInput.value = s.prompt; void sendMessage(s.prompt); };
      wrap.appendChild(btn);
    }
    chatEmpty.appendChild(wrap);
  }

  function suggestedPrompts(templateId) {
    const common = [
      { label: 'Rewrite the page title to be more compelling', prompt: 'Rewrite the page title to be more compelling and clear.' },
      { label: 'Add a CTA band at the bottom', prompt: 'Add a cta-band section at the end of the page with a headline that matches this page\'s topic and a button to /about/contact-us.' },
    ];
    if (templateId === 'legacy') {
      return [
        { label: 'Convert this page to the pillar template', prompt: 'This page uses the legacy template. Propose a conversion to the pillar template that preserves the key messages from the current content.' },
        ...common,
      ];
    }
    if (templateId === 'pillar') {
      return [
        { label: 'Add a stat-grid after the intro', prompt: 'Add a stat-grid section after the intro split. Use placeholder numbers (e.g. 250 scholarships, $100M assets, 40 years, 500 funds) that I\'ll edit later.' },
        { label: 'Rewrite the intro to be more emotional', prompt: 'Rewrite the first split section to lead with the human impact — why this matters to people, not just what we do.' },
        ...common,
      ];
    }
    if (templateId === 'program') {
      return [
        { label: 'Add a timeline to the main column', prompt: 'Add a timeline section inside the sidebar-layout main column. Use 5 milestones that describe a typical participant\'s year.' },
        { label: 'Add a testimonials section', prompt: 'Add a testimonials section with 2 placeholder quotes from past program participants.' },
        ...common,
      ];
    }
    if (templateId === 'landing') {
      return [
        { label: 'Add pricing tiers for sponsorships', prompt: 'Add a pricing-tiers section for sponsorship levels: Community $2,500, Leadership $5,000 (featured), Legacy $10,000, Founders $25,000.' },
        { label: 'Add an FAQ with 5 common questions', prompt: 'Add a faq-accordion section with 5 common questions a visitor might have about this event or campaign.' },
        ...common,
      ];
    }
    if (templateId === 'image-sections') {
      return [
        { label: 'Add a dual-panels section', prompt: 'Add a dual-panels section with two calls to action for different audiences.' },
        { label: 'Add an image-quote after the hero', prompt: 'Add an image-quote section after the hero with a placeholder quote about our community\'s impact.' },
        ...common,
      ];
    }
    return common;
  }

  // ---------- Data load -----------------------------------------------------
  async function load() {
    try {
      const [pageRes, templatesRes, versionsRes] = await Promise.all([
        fetch('/api/pages/' + slugPath),
        fetch('/api/templates'),
        fetch('/api/pages/' + slugPath + '/versions'),
      ]);
      if (pageRes.status === 401) { location.href = '/cpadmin/login'; return; }
      if (pageRes.status === 404) { titleEl.textContent = 'Page not found'; return; }

      const pageBody = await pageRes.json();
      page = pageBody.page;

      // /api/templates might not exist yet — fall back to a sensible hard-coded list.
      if (templatesRes.ok) {
        const body = await templatesRes.json();
        templates = body.templates;
        if (body.universalSections) universalSections = body.universalSections;
      } else {
        templates = [
          { id: 'legacy', label: 'Legacy (WordPress content)', description: 'Raw HTML from scraped content.', preferredSections: ['legacy-html'] },
          { id: 'pillar', label: 'Pillar page', description: 'Long-form content with alternating splits.', preferredSections: ['page-banner','split','stat-grid','icon-cards','story-spotlight','bordered-cards','cta-band'] },
          { id: 'program', label: 'Program page', description: 'Program page with sticky sidebar.', preferredSections: ['page-banner','sidebar-layout','highlight-box','feature-grid','timeline','testimonials','steps-numbered','cta-band'] },
          { id: 'landing', label: 'Landing page', description: 'Campaign page with hero + pricing.', preferredSections: ['hero-banner','stat-grid','split','pricing-tiers','story-spotlight','details-grid','faq-accordion','cta-band'] },
          { id: 'image-sections', label: 'Image-driven page', description: 'Image-heavy patterns.', preferredSections: ['hero-banner','image-split','image-quote','floating-cards','dual-panels','image-fade','image-mosaic','stat-grid','cta-band'] },
        ];
      }

      const versions = versionsRes.ok ? (await versionsRes.json()).versions : [];

      // Populate UI
      titleEl.textContent = page.title;
      pathEl.textContent = page.path;
      templateChipEl.textContent = page.template;
      viewLive.href = page.path;
      viewLivePreview.href = page.path;
      inputTitle.value = page.title;
      inputSubtitle.value = page.subtitle ?? '';
      renderTemplateOptions();
      renderTemplateInfo();
      inputSections.value = JSON.stringify(page.sections, null, 2);
      inputLegacyBody.value = page.legacyBody ?? '';
      renderPreviewSummary();
      renderVersions(versions);
      renderEmpty();
    } catch (err) {
      titleEl.textContent = 'Error loading page';
      console.error(err);
    }
  }

  inputTemplate.addEventListener('change', renderTemplateInfo);

  // ---------- Save ----------------------------------------------------------
  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let sections;
    try {
      sections = JSON.parse(inputSections.value);
      if (!Array.isArray(sections)) throw new Error('sections must be an array');
    } catch (err) {
      saveStatus.textContent = 'Invalid JSON: ' + err.message;
      saveStatus.style.color = 'var(--danger)';
      return;
    }
    saveStatus.textContent = 'Saving…';
    saveStatus.style.color = 'var(--text-dim)';
    const body = {
      title: inputTitle.value,
      subtitle: inputSubtitle.value || null,
      template: inputTemplate.value,
      sections,
      legacyBody: inputLegacyBody.value,
    };
    const res = await fetch('/api/pages/' + slugPath, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      saveStatus.textContent = 'Save failed: ' + (payload.error ?? res.status);
      saveStatus.style.color = 'var(--danger)';
      return;
    }
    saveStatus.textContent = 'Saved.';
    saveStatus.style.color = 'var(--success)';
    await reload();
  });

  async function reload() {
    const [pageRes, versionsRes] = await Promise.all([
      fetch('/api/pages/' + slugPath),
      fetch('/api/pages/' + slugPath + '/versions'),
    ]);
    if (pageRes.ok) {
      page = (await pageRes.json()).page;
      inputTitle.value = page.title;
      inputSubtitle.value = page.subtitle ?? '';
      renderTemplateOptions();
      renderTemplateInfo();
      inputSections.value = JSON.stringify(page.sections, null, 2);
      inputLegacyBody.value = page.legacyBody ?? '';
      titleEl.textContent = page.title;
      templateChipEl.textContent = page.template;
      renderPreviewSummary();
    }
    if (versionsRes.ok) {
      const { versions } = await versionsRes.json();
      renderVersions(versions);
    }
  }

  async function revertTo(versionId) {
    if (!confirm('Revert to version ' + versionId + '? This creates a new version entry.')) return;
    const res = await fetch('/api/pages/' + slugPath + '/revert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionId }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      alert('Revert failed: ' + (payload.error ?? res.status));
      return;
    }
    await reload();
  }

  // ---------- Chat ----------------------------------------------------------
  function appendUser(text) {
    if (chatEmpty && chatEmpty.parentNode) chatEmpty.remove();
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg--user';
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg__bubble';
    bubble.textContent = text;
    el.appendChild(bubble);
    chatFeed.appendChild(el);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function appendAssistant({ text, activity, proposals }) {
    if (chatEmpty && chatEmpty.parentNode) chatEmpty.remove();
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg chat-msg--assistant';
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg__bubble';

    const textEl = document.createElement('div');
    if (text) textEl.textContent = text;
    if (textEl.textContent) bubble.appendChild(textEl);

    if (activity && activity.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'chat-msg__activity';
      for (const a of activity) {
        const li = document.createElement('li');
        li.className = 'status-' + a.status;
        li.textContent = a.detail ? a.label + ' — ' + a.detail : a.label;
        ul.appendChild(li);
      }
      bubble.appendChild(ul);
    }

    const actions = document.createElement('div');
    actions.className = 'chat-msg__actions';
    if (proposals && proposals.length > 0) {
      for (const p of proposals) {
        const summary = document.createElement('p');
        summary.style.margin = '.5rem 0';
        summary.style.fontSize = '.85rem';
        summary.textContent = p.summary;
        bubble.appendChild(summary);
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'apply';
        apply.textContent = 'Apply';
        apply.onclick = async () => {
          apply.disabled = true;
          apply.textContent = 'Applying…';
          const res = await fetch('/api/pages/' + slugPath + '/apply-proposal', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ proposal: p }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            apply.disabled = false;
            apply.textContent = 'Apply';
            alert('Apply failed: ' + (payload.error ?? res.status));
            return;
          }
          apply.remove();
          cancel.textContent = 'Undo';
          cancel.className = 'danger';
          summary.textContent += '  · applied.';
          await reload();
        };
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.onclick = () => { apply.remove(); cancel.remove(); summary.textContent += '  · cancelled.'; };
        actions.append(apply, cancel);
      }
    }
    const hasCommittedWrite = (activity || []).some((a) =>
      a.status === 'ok' && !['get_page', 'list_pages', 'list_templates'].includes(a.label)
    );
    if (hasCommittedWrite) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'danger';
      undo.textContent = 'Undo this';
      undo.onclick = async () => {
        undo.disabled = true;
        undo.textContent = 'Undoing…';
        const vres = await fetch('/api/pages/' + slugPath + '/versions');
        const { versions } = await vres.json();
        if (!versions || versions.length === 0) { undo.textContent = 'Nothing to undo'; return; }
        const rres = await fetch('/api/pages/' + slugPath + '/revert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ versionId: versions[0].id }),
        });
        if (!rres.ok) {
          undo.textContent = 'Undo this';
          undo.disabled = false;
          alert('Undo failed');
          return;
        }
        undo.textContent = 'Undone';
        await reload();
      };
      actions.appendChild(undo);
    }
    if (actions.childElementCount > 0) bubble.appendChild(actions);

    wrap.appendChild(bubble);
    chatFeed.appendChild(wrap);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  async function sendMessage(text) {
    appendUser(text);
    chatHistory.push({ role: 'user', content: text });
    chatSend.disabled = true;
    chatInput.disabled = true;
    chatSend.textContent = 'Thinking…';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, messages: chatHistory }),
      });
      const payload = await res.json();
      if (!res.ok) {
        appendAssistant({ text: 'Error: ' + (payload.error ?? res.status), activity: [], proposals: [] });
        return;
      }
      for (const m of payload.messages) chatHistory.push(m);
      const finalAssistant = [...payload.messages].reverse().find((m) => m.role === 'assistant');
      const finalText = finalAssistant && Array.isArray(finalAssistant.content)
        ? finalAssistant.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        : '';
      appendAssistant({ text: finalText, activity: payload.activity, proposals: payload.proposals });
      if ((payload.activity || []).some((a) => a.status === 'ok' && !['get_page','list_pages','list_templates'].includes(a.label))) {
        await reload();
      }
    } catch (err) {
      appendAssistant({ text: 'Network error: ' + (err.message || err), activity: [], proposals: [] });
    } finally {
      chatSend.disabled = false;
      chatInput.disabled = false;
      chatSend.textContent = 'Send';
      chatInput.value = '';
      chatInput.focus();
    }
  }

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    void sendMessage(text);
  });
  chatInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  void load();
})();
