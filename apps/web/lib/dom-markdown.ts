/**
 * Serialize a rendered docs subtree to markdown.
 *
 * Our docs pages are JSX, not markdown-backed, so "Copy Page" reads the
 * DOM React already rendered — one source of truth, nothing to drift.
 * The converter is deliberately small and literal: headings, paragraphs,
 * fenced code, lists, links, inline code. Anything it doesn't know about
 * is walked through rather than guessed at.
 *
 * Block structure comes from the *computed* display, not the tag name:
 * the docs use flex/grid wrappers (and block-level anchors) that carry no
 * semantic tag, and the rendered layout is the honest signal for where a
 * line break belongs.
 */

const HEADINGS: Record<string, string> = {
  H1: "# ",
  H2: "## ",
  H3: "### ",
  H4: "#### ",
  H5: "##### ",
  H6: "###### ",
};

const INLINE_DISPLAY = new Set([
  "inline",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
  "contents",
  "ruby",
]);

/** Collapse the whitespace JSX leaves behind; markdown doesn't want it. */
function clean(text: string) {
  return text.replace(/[ \t\n\r]+/g, " ").trim();
}

/** Relative hrefs become absolute so a pasted page's links still work. */
function absolutise(href: string) {
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return href;
  }
}

function displayOf(el: Element) {
  if (typeof window === "undefined" || !window.getComputedStyle) return "";
  return window.getComputedStyle(el).display;
}

function isHidden(el: Element) {
  return (
    el.getAttribute("aria-hidden") === "true" ||
    (el as HTMLElement).hidden === true ||
    displayOf(el) === "none"
  );
}

/** Inline run: text plus the marks markdown has a spelling for. */
function inlineOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  if (isHidden(node)) return "";

  const inner = Array.from(node.childNodes).map(inlineOf).join("");
  switch (node.tagName) {
    case "BR":
      return "\n";
    case "CODE":
      return inner.trim() ? `\`${clean(inner)}\`` : "";
    case "A": {
      const href = node.getAttribute("href");
      const text = clean(inner);
      if (!href || !text) return text;
      return `[${text}](${absolutise(href)})`;
    }
    case "STRONG":
    case "B":
      return inner.trim() ? `**${clean(inner)}**` : "";
    case "EM":
    case "I":
      return inner.trim() ? `*${clean(inner)}*` : "";
    default:
      return inner;
  }
}

function listOf(el: Element, ordered: boolean): string {
  const items = Array.from(el.children).filter((c) => c.tagName === "LI");
  return items
    .map((li, i) => {
      const marker = ordered ? `${i + 1}. ` : "- ";
      const body = blocksOf(li).join("\n\n");
      // Continuation lines are indented so they stay inside the item.
      return marker + body.split("\n").join("\n" + " ".repeat(marker.length));
    })
    .join("\n");
}

/** Walk an element's children into markdown blocks (document order). */
function blocksOf(root: Element): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const text = clean(run.join(""));
    if (text) out.push(text);
    run = [];
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      run.push(node.textContent ?? "");
      continue;
    }
    if (!(node instanceof Element)) continue;
    if (isHidden(node)) continue;

    const tag = node.tagName;
    if (tag in HEADINGS) {
      flush();
      const text = clean(inlineOf(node));
      if (text) out.push(HEADINGS[tag] + text);
      continue;
    }
    if (tag === "P") {
      flush();
      const text = clean(inlineOf(node));
      if (text) out.push(text);
      continue;
    }
    if (tag === "PRE") {
      flush();
      const code = (node.textContent ?? "").replace(/\s+$/, "");
      if (code) out.push("```\n" + code + "\n```");
      continue;
    }
    if (tag === "UL" || tag === "OL") {
      flush();
      const list = listOf(node, tag === "OL");
      if (list) out.push(list);
      continue;
    }
    if (INLINE_DISPLAY.has(displayOf(node))) {
      run.push(inlineOf(node));
      continue;
    }

    // A block-level container: recurse. A block-level link keeps its href
    // by wrapping the first block it produced (e.g. a showcase card whose
    // name, URL, and blurb are stacked spans).
    flush();
    const inner = blocksOf(node);
    const href = tag === "A" ? node.getAttribute("href") : null;
    if (href && inner.length > 0) inner[0] = `[${inner[0]}](${absolutise(href)})`;
    out.push(...inner);
  }

  flush();
  return out;
}

/** Markdown for a rendered docs article, blocks separated by a blank line. */
export function domToMarkdown(root: Element): string {
  return blocksOf(root).join("\n\n") + "\n";
}
