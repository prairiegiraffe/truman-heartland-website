import type { APIRoute } from 'astro';
import { TEMPLATES, UNIVERSAL_SECTIONS } from '../../lib/templates';
import { SECTION_KINDS } from '../../lib/sections';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        preferredSections: t.preferredSections,
        layout: t.layout,
      })),
      universalSections: UNIVERSAL_SECTIONS,
      sectionKinds: SECTION_KINDS,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};
