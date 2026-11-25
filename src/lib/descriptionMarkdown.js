// ===========================================================================
// Carried item 27: recruiters paste Markdown, and candidates read it raw.
//
// THE ONE DEFECT A CANDIDATE ACTUALLY SEES. Job 13's description opens with
// "# Job Description" on screen and in Google's snippet, because the detail
// page printed the text verbatim and the JSON-LD wrapped it in <p> tags
// without ever looking at what was inside.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT
// ---------------------------------------------------------------------------
//
// It is a PARSER ONLY. It turns text into a plain token tree -- arrays and
// objects, no JSX, no HTML, no strings containing tags. Two renderers consume
// that tree, and they live elsewhere:
//
//   src/components/JobDescription.jsx  -> React elements, for the page
//   src/lib/jobPosting.js              -> an HTML string, for the JSON-LD
//
// ONE PARSE, TWO RENDERERS, on purpose. The rule `jobPosting.js` already
// states is that "the markup must say what the page shows, not a tidier
// version of it". Two parsers would drift; one parse cannot. A test asserts
// the page's visible text equals the markup's text with its tags stripped,
// which turns that rule from a promise into a check.
//
// IT IS NOT A MARKDOWN IMPLEMENTATION. The supported set is closed:
//
//   #  ##  ###     headings
//   **bold**       strong
//   *italic*       emphasis
//   - item         unordered list (also * item)
//   1. item        ordered list
//   blank line     paragraph break
//   single newline line break inside a paragraph
//
// Everything else is text. No links, no images, no code fences, no tables,
// no blockquotes, no footnotes, no autolinking.
//
// ---------------------------------------------------------------------------
// WHY NOT react-markdown
// ---------------------------------------------------------------------------
//
// It would work, and it ignores raw HTML unless `rehype-raw` is added. But
// "unless" is the problem: the safety of a public page a stranger's text
// flows through would rest on a configuration flag across forty-odd
// transitive packages, and Rishi -- who owns this site and is not a developer
// -- would have to take that on trust. A hundred lines he can read, with a
// suite that attacks it, is worth more here than a dependency he cannot
// audit. This project's whole shape is small pure modules with tests behind
// them.
//
// ---------------------------------------------------------------------------
// WHY RAW HTML CANNOT SURVIVE, which is the property to preserve
// ---------------------------------------------------------------------------
//
// `<` STARTS NO TOKEN IN THIS GRAMMAR. There is no branch below that reads
// it, so a recruiter's "<script>" is carried along inside a text node and is
// never anything else. It is not "escaped HTML" on the page -- it never
// becomes markup at all, because the page renderer emits React elements and
// React escapes text nodes by construction. `src/` contains no
// `dangerouslySetInnerHTML` and the suite asserts it stays that way.
//
// The HTML renderer has one more step, and the order is the one
// `descriptionToHtml` already proved on this exact data: ESCAPE THE TEXT
// FIRST, THEN ADD TAGS. Reversed, it would escape the tags it had just
// written.
//
// NO LINKS, decided 25 Nov 2026. Two reasons, and the second is the stronger:
// a `javascript:` URL is the classic hole in every hand-rolled renderer; and
// stage 4 dropped external-apply entirely because a link to someone else's
// site yields no application, no candidate and no funnel data. A clickable
// link in a description works against what the board is for. A pasted URL
// stays visible as text, which is the right amount of support.
// ===========================================================================

// Headings start at h3. The page already owns h1 (the role title) and h2
// (its section headings), so a description's "#" cannot be an h1 without
// giving a recruiter's text the same weight as the role itself.
const HEADING_TAGS = ["h3", "h4", "h5"];

// The closed set of element types either renderer may emit. The suite walks
// the tree for adversarial input and asserts nothing outside this appears.
export const ALLOWED_BLOCK_TYPES = ["heading", "paragraph", "list"];
export const ALLOWED_INLINE_TYPES = ["text", "strong", "em", "break"];

export function headingTag(level) {
  return HEADING_TAGS[Math.min(Math.max(level, 1), HEADING_TAGS.length) - 1];
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^\s{0,3}[-*]\s+(.*)$/;
const ORDERED_RE = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;

// ---------------------------------------------------------------------------
// Inline parsing: **strong**, *em*, and nothing else.
//
// AN UNMATCHED MARKER IS LITERAL TEXT. "**bold" stays "**bold", because a
// recruiter writing "terms of 2 * 3 * 4" or "see note *" must not have the
// rest of their paragraph swallowed. That is the common case, not the edge
// case -- asterisks appear in prose far more often than in markup.
//
// `**` is tried before `*`, so "**a**" is strong rather than em wrapping an
// empty string.
// ---------------------------------------------------------------------------
function parseInline(text) {
  const nodes = [];
  let plain = "";

  const flush = () => {
    if (plain) {
      nodes.push({ type: "text", value: plain });
      plain = "";
    }
  };

  let i = 0;

  while (i < text.length) {
    const two = text.slice(i, i + 2);

    if (two === "**") {
      const close = text.indexOf("**", i + 2);
      // A marker with nothing between it is not emphasis, it is four
      // asterisks somebody typed.
      if (close > i + 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    } else if (text[i] === "*") {
      const close = text.indexOf("*", i + 1);
      if (close > i + 1) {
        flush();
        nodes.push({ type: "em", children: parseInline(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }

    plain += text[i];
    i += 1;
  }

  flush();

  return nodes;
}

// A paragraph's single newlines become explicit break nodes, which is what
// the old `whitespace-pre-wrap` rendering did implicitly. Keeping it explicit
// is what lets the HTML renderer emit <br> and stay in step with the page.
function parseParagraphInline(block) {
  const nodes = [];
  const lines = block.split("\n");

  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "break" });
    nodes.push(...parseInline(line));
  });

  return nodes;
}

// ---------------------------------------------------------------------------
// Block parsing.
// ---------------------------------------------------------------------------
export function parseDescription(text) {
  if (typeof text !== "string") return [];

  // \r\n from a Windows paste would otherwise leave \r inside every line and
  // defeat every regex anchored on the end of one.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const blocks = [];
  let paragraph = [];
  let list = null;

  const closeParagraph = () => {
    const joined = paragraph.join("\n").trim();
    paragraph = [];
    if (joined) {
      blocks.push({ type: "paragraph", inline: parseParagraphInline(joined) });
    }
  };

  const closeList = () => {
    if (list && list.items.length) blocks.push(list);
    list = null;
  };

  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    const bullet = BULLET_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);

    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    if (heading) {
      closeParagraph();
      closeList();
      const content = heading[2].trim();
      // "###" alone is not a heading with no text; it is three characters.
      if (content) {
        blocks.push({
          type: "heading",
          level: heading[1].length,
          inline: parseInline(content),
        });
      } else {
        blocks.push({ type: "paragraph", inline: parseInline(line.trim()) });
      }
      continue;
    }

    // A bullet line is only a bullet when it is not the start of emphasis:
    // "*italic* and more" matches BULLET_RE's "* " only if a space follows
    // the marker, which "*italic*" does not. Checked by test rather than by
    // reading, because it is the one ambiguity in this grammar.
    if (bullet || ordered) {
      closeParagraph();
      const wantOrdered = Boolean(ordered);
      if (!list || list.ordered !== wantOrdered) {
        closeList();
        list = { type: "list", ordered: wantOrdered, items: [] };
      }
      list.items.push(parseInline((bullet ? bullet[1] : ordered[1]).trim()));
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  closeParagraph();
  closeList();

  return blocks;
}

// ---------------------------------------------------------------------------
// Renderer 1 of 2: an HTML string, for the JSON-LD.
//
// Google's JobPosting `description` must be HTML -- recorded at the top of
// jobPosting.js, which is where this is consumed. The escape-then-mark-up
// order is the one that file already uses and justifies.
// ---------------------------------------------------------------------------
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineToHtml(nodes) {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.value);
      if (node.type === "break") return "<br>";
      if (node.type === "strong") return `<strong>${inlineToHtml(node.children)}</strong>`;
      if (node.type === "em") return `<em>${inlineToHtml(node.children)}</em>`;
      // Unreachable for a tree this file produced. Returning "" rather than
      // throwing means an unknown node can only ever make the output SMALLER,
      // never introduce a tag.
      return "";
    })
    .join("");
}

export function blocksToHtml(blocks) {
  return (blocks || [])
    .map((block) => {
      if (block.type === "heading") {
        const tag = headingTag(block.level);
        return `<${tag}>${inlineToHtml(block.inline)}</${tag}>`;
      }

      if (block.type === "paragraph") {
        return `<p>${inlineToHtml(block.inline)}</p>`;
      }

      if (block.type === "list") {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items
          .map((item) => `<li>${inlineToHtml(item)}</li>`)
          .join("");
        return `<${tag}>${items}</${tag}>`;
      }

      return "";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// The plain-text flattening, for <meta name="description">.
//
// A meta description is plain text by definition, so it gets the words with
// the marks removed. Without this the rich result would be fixed while the
// grey line under the blue link still began with "#".
// ---------------------------------------------------------------------------
function inlineToText(nodes) {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "break") return " ";
      if (node.type === "strong" || node.type === "em") return inlineToText(node.children);
      return "";
    })
    .join("");
}

export function blocksToText(blocks) {
  return (blocks || [])
    .map((block) => {
      if (block.type === "list") {
        return block.items.map((item) => inlineToText(item)).join(" ");
      }
      return inlineToText(block.inline || []);
    })
    .filter(Boolean)
    .join(" ");
}

// The two conveniences the rest of the app actually calls.
export function descriptionToText(text) {
  return blocksToText(parseDescription(text));
}

export function descriptionToHtmlSubset(text) {
  return blocksToHtml(parseDescription(text));
}
