/**
 * Allowlist HTML sanitizer.
 *
 * Keeps only a small set of formatting tags and strips everything else:
 *  - allowed tags: p, br, ul, ol, li, strong, em, h3, h4;
 *  - all attributes are removed (so on* handlers, style, href, srcset, etc.
 *    cannot survive);
 *  - script / style / iframe (and other embedding tags) are removed together
 *    with their contents;
 *  - comments, CDATA, doctype and processing instructions are removed.
 *
 * Disallowed tags are unwrapped (dropped while keeping their text), so visible
 * copy is preserved. Pure and dependency-free — used to clean the Listing
 * Writer's HTML description before it is stored or rendered.
 *
 * This is a conservative allowlist cleaner, not a full HTML5 parser: when in
 * doubt it removes rather than keeps.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "h3",
  "h4",
]);

/** Tags removed together with everything between their open/close tags. */
const REMOVE_WITH_CONTENT = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "head",
  "title",
];

export function sanitizeHtml(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";

  let html = input;

  // 1. Strip comments, CDATA, doctype and processing instructions.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<![\s\S]*?>/g, "");
  html = html.replace(/<\?[\s\S]*?\?>/g, "");

  // 2. Remove dangerous elements and their contents. Run twice to catch simple
  //    nesting, then drop any orphaned opening/closing tags left unbalanced.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const tag of REMOVE_WITH_CONTENT) {
      const paired = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi");
      html = html.replace(paired, "");
    }
  }
  for (const tag of REMOVE_WITH_CONTENT) {
    const orphan = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
    html = html.replace(orphan, "");
  }

  // 3. Walk every remaining tag: keep allowlisted tags as bare (attribute-free)
  //    tags, drop all others while preserving their inner text.
  html = html.replace(
    /<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
    (match, rawName: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      const isClosing = /^<\s*\//.test(match);
      return isClosing ? `</${name}>` : `<${name}>`;
    },
  );

  return html.trim();
}
