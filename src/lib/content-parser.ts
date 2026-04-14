import { parse, HTMLElement } from "node-html-parser";

export type Section =
  | { kind: "lead"; html: string }
  | { kind: "split"; title: string; textHtml: string; imageSrc: string; imageAlt: string; caption?: string; reverse: boolean }
  | { kind: "quote"; html: string; attribution?: string; title?: string }
  | { kind: "cards"; title: string; items: { text: string }[] }
  | { kind: "prose"; title: string; html: string; bg: "white" | "light" | "blue-light" }
  | { kind: "table"; title: string; preHtml: string; tableHtml: string; postHtml: string };

const MAX_CARD_LEN = 120;

function stripEmpty(el: HTMLElement): void {
  el.querySelectorAll("p, div").forEach((n) => {
    const text = n.text.replace(/\u00a0/g, "").trim();
    if (!text && n.querySelectorAll("img, iframe, a, input, button").length === 0) {
      n.remove();
    }
  });
}

function cleanupLegacy(el: HTMLElement): void {
  // Remove images pointing at dead legacy CDN hosts (and their wrapping <figure>)
  const deadHosts = [/d2f39dzk9sbfur\.cloudfront\.net/i];
  el.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (deadHosts.some((r) => r.test(src))) {
      const fig = img.closest("figure");
      if (fig) fig.remove();
      else img.remove();
      return;
    }
    const style = img.getAttribute("style") || "";
    if (/aspect-ratio\s*:/i.test(style)) {
      const cleaned = style.replace(/aspect-ratio\s*:[^;]*;?/gi, "").trim();
      if (cleaned) img.setAttribute("style", cleaned);
      else img.removeAttribute("style");
    }
    const cls = (img.getAttribute("class") || "")
      .split(/\s+/)
      .filter((c) => c !== "lazyload" && c !== "lazyloaded")
      .join(" ");
    if (cls) img.setAttribute("class", cls);
    else img.removeAttribute("class");
    if (!img.getAttribute("loading")) img.setAttribute("loading", "lazy");
  });

  el.querySelectorAll("p.largetext, p.smalltext").forEach((p) => {
    p.removeAttribute("class");
  });

  // Upgrade inline .button links to design system buttons
  el.querySelectorAll("a.button, a.white-btn").forEach((a) => {
    const cls = a.getAttribute("class") || "";
    const isOutline = /white-btn/.test(cls);
    a.setAttribute("class", isOutline ? "btn btn-outline" : "btn btn-primary");
  });
}

function headingText(h: HTMLElement): string {
  return h.text.replace(/\s+/g, " ").trim();
}

function blockImages(nodes: HTMLElement[]): HTMLElement[] {
  const imgs: HTMLElement[] = [];
  nodes.forEach((n) => {
    if (n.tagName === "IMG") imgs.push(n);
    n.querySelectorAll("img").forEach((i) => imgs.push(i as HTMLElement));
  });
  return imgs;
}

function firstImage(nodes: HTMLElement[]): { src: string; alt: string; caption?: string } | null {
  for (const n of nodes) {
    if (n.tagName === "FIGURE") {
      const img = n.querySelector("img");
      if (img && img.getAttribute("src")) {
        const cap = n.querySelector("figcaption");
        return { src: img.getAttribute("src")!, alt: img.getAttribute("alt") || "", caption: cap?.text.trim() || undefined };
      }
    }
    if (n.tagName === "IMG" && n.getAttribute("src")) {
      return { src: n.getAttribute("src")!, alt: n.getAttribute("alt") || "" };
    }
    const img = n.querySelector("img");
    if (img && img.getAttribute("src")) {
      return { src: img.getAttribute("src")!, alt: img.getAttribute("alt") || "" };
    }
  }
  return null;
}

function nodesToHtml(nodes: HTMLElement[]): string {
  return nodes.map((n) => n.toString()).join("\n");
}

function removeAllImages(html: string): string {
  const root = parse(`<div>${html}</div>`);
  root.querySelectorAll("figure").forEach((f) => {
    if (f.querySelector("img")) f.remove();
  });
  root.querySelectorAll("img").forEach((i) => i.remove());
  return root.firstChild?.toString().replace(/^<div>|<\/div>$/g, "") || "";
}

function isShortListSection(nodes: HTMLElement[]): HTMLElement | null {
  // Returns the <ul> if the section body is dominated by a short-item list.
  const uls = nodes.filter((n) => n.tagName === "UL" || n.tagName === "OL");
  if (uls.length !== 1) return null;
  const ul = uls[0];
  const items = ul.querySelectorAll("li");
  if (items.length < 3) return null;
  const allShort = items.every((li) => li.text.replace(/\s+/g, " ").trim().length <= MAX_CARD_LEN);
  if (!allShort) return null;
  // Check that non-list content is mostly a single intro paragraph, not extensive prose
  const otherText = nodes
    .filter((n) => n !== ul && n.tagName !== "UL" && n.tagName !== "OL")
    .map((n) => n.text.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (otherText.length > 300) return null;
  return ul;
}

function isQuoteSection(nodes: HTMLElement[]): HTMLElement | null {
  const blockquotes = nodes.filter((n) => n.tagName === "BLOCKQUOTE");
  if (blockquotes.length !== 1) return null;
  const totalText = nodes.map((n) => n.text.trim()).join(" ").replace(/\s+/g, " ").trim();
  const quoteText = blockquotes[0].text.trim();
  if (totalText.length === 0) return null;
  if (quoteText.length / totalText.length < 0.4) return null;
  return blockquotes[0];
}

function hasTable(nodes: HTMLElement[]): HTMLElement | null {
  for (const n of nodes) {
    if (n.tagName === "TABLE") return n;
    const t = n.querySelector("table");
    if (t) return t as HTMLElement;
  }
  return null;
}

export function extractLead(html: string): string | null {
  const root = parse(`<div>${html || ""}</div>`);
  const container = root.firstChild as HTMLElement;
  if (!container) return null;
  cleanupLegacy(container);
  stripEmpty(container);
  const children = container.childNodes.filter((n) => n.nodeType === 1) as HTMLElement[];
  // Lead = first <p class="largetext"> if it exists and comes before any heading;
  // otherwise the first non-empty <p> before the first heading.
  const firstHeadingIdx = children.findIndex((c) => c.tagName === "H2" || c.tagName === "H3");
  const scope = firstHeadingIdx === -1 ? children : children.slice(0, firstHeadingIdx);
  const firstP = scope.find((n) => n.tagName === "P" && n.text.replace(/\s+/g, "").length > 0);
  if (!firstP) return null;
  // Strip wrapping <strong> etc. — return inner text so the banner can style it.
  const text = firstP.text.replace(/\s+/g, " ").trim();
  return text || null;
}

export function segment(html: string): Section[] {
  const root = parse(`<div id="__root">${html}</div>`);
  const container = root.getElementById("__root") || (root.firstChild as HTMLElement);

  cleanupLegacy(container);
  stripEmpty(container);

  const sections: Section[] = [];
  const children = container.childNodes.filter((n) => n.nodeType === 1) as HTMLElement[];

  // Detect heading level: prefer H2. If no H2 exists but H3s do, segment by H3.
  const hasH2 = children.some((c) => c.tagName === "H2");
  const headingTag: "H2" | "H3" = hasH2 ? "H2" : children.some((c) => c.tagName === "H3") ? "H3" : "H2";

  // 1. Lead = the first "largetext" p OR the first paragraph(s) before any meaningful content.
  //    Pre-heading content that isn't the lead becomes an intro prose section.
  const firstHeadingIdx = children.findIndex((c) => c.tagName === headingTag);
  const preH2 = firstHeadingIdx === -1 ? [...children] : children.slice(0, firstHeadingIdx);

  let introNodes: HTMLElement[] = [];
  if (preH2.length > 0) {
    // First text-bearing node becomes the lead; everything else goes into intro
    const firstTextIdx = preH2.findIndex(
      (n) => n.tagName === "P" && n.text.replace(/\s+/g, "").length > 0
    );
    if (firstTextIdx >= 0) {
      const leadHtml = preH2[firstTextIdx].toString().trim();
      if (leadHtml) sections.push({ kind: "lead", html: leadHtml });
      introNodes = [
        ...preH2.slice(0, firstTextIdx),
        ...preH2.slice(firstTextIdx + 1),
      ];
    } else {
      introNodes = preH2;
    }
  }

  // Emit the intro as its own prose/split section if it has content
  if (introNodes.length > 0) {
    const introText = introNodes.map((n) => n.text.trim()).join("").replace(/\s+/g, "").trim();
    if (introText || blockImages(introNodes).length > 0) {
      const imgs = blockImages(introNodes);
      if (imgs.length >= 1 && imgs.length <= 2) {
        const img = firstImage(introNodes);
        if (img) {
          const textHtml = removeAllImages(nodesToHtml(introNodes)).trim();
          sections.push({
            kind: "split",
            title: "",
            textHtml,
            imageSrc: img.src,
            imageAlt: img.alt,
            caption: img.caption,
            reverse: false,
          });
        }
      } else {
        sections.push({ kind: "prose", title: "", html: nodesToHtml(introNodes), bg: "white" });
      }
    }
  }

  if (firstHeadingIdx === -1) {
    return sections;
  }

  // 2. Walk heading boundaries and classify each section
  const rest = children.slice(firstHeadingIdx);
  let i = 0;
  let proseIndex = 0; // for alternating bg

  while (i < rest.length) {
    const h = rest[i];
    if (h.tagName !== headingTag) {
      i++;
      continue;
    }
    // Merge consecutive headings at the same level (WordPress sometimes splits)
    const titleParts = [headingText(h)];
    let j = i + 1;
    while (j < rest.length && rest[j].tagName === headingTag) {
      titleParts.push(headingText(rest[j]));
      j++;
    }
    const title = titleParts.filter(Boolean).join(" ").trim();
    // Collect body until next heading
    const bodyNodes: HTMLElement[] = [];
    while (j < rest.length && rest[j].tagName !== headingTag) {
      bodyNodes.push(rest[j]);
      j++;
    }
    i = j;

    if (bodyNodes.length === 0) {
      // Empty section — skip
      continue;
    }

    // Classify
    const table = hasTable(bodyNodes);
    if (table) {
      const parts = bodyNodes.map((n) => n.toString());
      // Split by table occurrence
      const tableHtml = table.toString();
      const fullHtml = parts.join("\n");
      const tIdx = fullHtml.indexOf(tableHtml);
      const preHtml = tIdx >= 0 ? fullHtml.slice(0, tIdx) : fullHtml;
      const postHtml = tIdx >= 0 ? fullHtml.slice(tIdx + tableHtml.length) : "";
      sections.push({ kind: "table", title, preHtml, tableHtml, postHtml });
      proseIndex++;
      continue;
    }

    const quote = isQuoteSection(bodyNodes);
    if (quote) {
      const innerP = quote.querySelector("p.attribution, cite, .attribution");
      const attribution = innerP?.text.trim();
      if (innerP) innerP.remove();
      sections.push({ kind: "quote", html: quote.innerHTML, attribution, title });
      proseIndex++;
      continue;
    }

    const listEl = isShortListSection(bodyNodes);
    if (listEl) {
      const items = listEl.querySelectorAll("li").map((li) => ({ text: li.innerHTML.trim() }));
      sections.push({ kind: "cards", title, items });
      proseIndex++;
      continue;
    }

    const images = blockImages(bodyNodes);
    if (images.length >= 1 && images.length <= 2) {
      const img = firstImage(bodyNodes);
      if (img) {
        const textHtml = removeAllImages(nodesToHtml(bodyNodes)).trim();
        sections.push({
          kind: "split",
          title,
          textHtml,
          imageSrc: img.src,
          imageAlt: img.alt,
          caption: img.caption,
          reverse: proseIndex % 2 === 1,
        });
        proseIndex++;
        continue;
      }
    }

    // Fallback: prose with alternating background
    const bgCycle: ("white" | "light" | "blue-light")[] = ["white", "light", "white", "blue-light"];
    const bg = bgCycle[proseIndex % bgCycle.length];
    sections.push({ kind: "prose", title, html: nodesToHtml(bodyNodes), bg });
    proseIndex++;
  }

  return sections;
}
