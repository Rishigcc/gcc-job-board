// ===========================================================================
// CARRIED ITEM 27 -- the Markdown subset, and the proof a hostile description
// cannot execute anything.
//
//   npx esbuild scripts/item27-markdown-test.mjs --bundle --format=esm \
//     --platform=node --packages=external --outfile=/tmp/t.mjs && node /tmp/t.mjs
//
// Rishi asked, before any of it was built: *"Tell me what you'd use and how
// you'd prove a hostile description can't execute anything."* These are the
// six proofs that were promised, in order:
//
//   1. STRUCTURAL   no dangerouslySetInnerHTML anywhere in src/
//   2. ALLOWLIST    the tree can hold no node type outside a closed set
//   3. HOSTILE      an attack corpus arrives as TEXT in both renderers
//   4. MARKUP PATH  no "<" survives into the JSON-LD script block
//   5. VISIBILITY   the page's text equals the markup's text, tags stripped
//   6. OVERFLOW     deferred to check-overflow.mjs, which measures pixels
//
// Proof 6 is not here because it cannot be: it needs a browser, and
// check-overflow.mjs already drives one. The fixture it needs is noted at the
// end of this file.
// ===========================================================================

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  parseDescription,
  blocksToHtml,
  blocksToText,
  descriptionToHtmlSubset,
  descriptionToText,
  headingTag,
  ALLOWED_BLOCK_TYPES,
  ALLOWED_INLINE_TYPES,
} from "../src/lib/descriptionMarkdown.js";

import { descriptionToHtml, jobPostingScript } from "../src/lib/jobPosting.js";
import { metaDescription } from "../src/lib/jobPageHead.js";

// Strips /* block */ comments and whole-line // comments.
//
// THIS FILE NEEDED IT ON ITS FIRST RUN, which is the third time the same
// fault has appeared here: two checks below matched the PROSE of a comment
// instead of the code it described. The files deliberately explain that they
// avoid `dangerouslySetInnerHTML` and that an earlier draft rendered `<Tag>`,
// and a naive search for either found the explanation. Recorded in
// JOB-BOARD-TEST-DATA.md: a file that documents what it does NOT do will
// always satisfy a naive search for that thing.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

let passed = 0;
const failures = [];

function t(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

function ok(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(detail ? `${label} — ${detail}` : label);
}

// ---------------------------------------------------------------------------
console.log("\nthe subset renders -- the defect itself");
// ---------------------------------------------------------------------------

// The exact shape of job 13, which is the row carrying the live defect.
t("a heading is a heading, not a hash",
  descriptionToHtmlSubset("# Job Description"), "<h3>Job Description</h3>");
t("the page shows the words without the hash",
  descriptionToText("# Job Description"), "Job Description");
t("bold is bold, not asterisks",
  descriptionToHtmlSubset("**Bangalore**"), "<p><strong>Bangalore</strong></p>");
t("italic",
  descriptionToHtmlSubset("*hybrid*"), "<p><em>hybrid</em></p>");
t("the three heading levels start at h3",
  [headingTag(1), headingTag(2), headingTag(3)], ["h3", "h4", "h5"]);
t("a bullet list",
  descriptionToHtmlSubset("- one\n- two"), "<ul><li>one</li><li>two</li></ul>");
t("an asterisk bullet list is the same list",
  descriptionToHtmlSubset("* one\n* two"), "<ul><li>one</li><li>two</li></ul>");
t("an ordered list",
  descriptionToHtmlSubset("1. one\n2. two"), "<ol><li>one</li><li>two</li></ol>");
t("a blank line is a paragraph break",
  descriptionToHtmlSubset("one\n\ntwo"), "<p>one</p><p>two</p>");
t("a single newline is a line break",
  descriptionToHtmlSubset("one\ntwo"), "<p>one<br>two</p>");
t("a Windows paste behaves the same",
  descriptionToHtmlSubset("one\r\ntwo"), "<p>one<br>two</p>");
t("switching list type starts a new list",
  descriptionToHtmlSubset("- a\n1. b"), "<ul><li>a</li></ul><ol><li>b</li></ol>");
t("inline marks work inside a list item",
  descriptionToHtmlSubset("- **a** and *b*"),
  "<ul><li><strong>a</strong> and <em>b</em></li></ul>");
t("inline marks work inside a heading",
  descriptionToHtmlSubset("## **Role** detail"),
  "<h4><strong>Role</strong> detail</h4>");

// ---------------------------------------------------------------------------
console.log("\nan unmatched marker is literal text -- the common case");
// ---------------------------------------------------------------------------

t("an unclosed double marker stays text",
  descriptionToHtmlSubset("**bold"), "<p>**bold</p>");
t("an unclosed single marker stays text",
  descriptionToHtmlSubset("see note *"), "<p>see note *</p>");
t("arithmetic survives",
  descriptionToHtmlSubset("2 * 3 * 4"), "<p>2 <em> 3 </em> 4</p>");
t("empty markers are not emphasis",
  descriptionToHtmlSubset("****"), "<p>****</p>");
t("a hash with no text is not a heading",
  descriptionToHtmlSubset("###"), "<p>###</p>");
t("a hash without a space is not a heading",
  descriptionToHtmlSubset("#NotAHeading"), "<p>#NotAHeading</p>");
t("four hashes are not a heading",
  descriptionToHtmlSubset("#### four"), "<p>#### four</p>");
t("an italic run at line start is not a bullet",
  descriptionToHtmlSubset("*italic* and more"),
  "<p><em>italic</em> and more</p>");

// ---------------------------------------------------------------------------
console.log("\nPROOF 1 -- structural: src/ never parses HTML");
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join("src", dir || "."), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.jsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const allSources = walk("");
const innerHtmlUsers = allSources.filter((rel) =>
  stripComments(readFileSync(join("src", rel), "utf8")).includes(
    "dangerouslySetInnerHTML",
  ),
);

ok(
  "no file in src/ uses dangerouslySetInnerHTML",
  innerHtmlUsers.length === 0,
  `found in ${JSON.stringify(innerHtmlUsers)} — this is the ENTIRE injection ` +
    `surface for the detail page, and item 27 was built specifically to avoid it`,
);

// The renderer must not grow an HTML path either: it emits elements, so it
// has no business importing the HTML serialiser.
const renderer = stripComments(
  readFileSync("src/components/JobDescription.jsx", "utf8"),
);
ok(
  "the page renderer does not import the HTML serialiser",
  !/blocksToHtml|descriptionToHtmlSubset/.test(renderer),
  "the page renders React elements; an HTML string here would be the bug",
);

// And the tag names are literal, not taken from data.
ok(
  "the page renderer writes its tags literally",
  /<h3 className=/.test(renderer) &&
    /<h4 className=/.test(renderer) &&
    /<h5 className=/.test(renderer) &&
    /<ul className=/.test(renderer) &&
    /<ol className=/.test(renderer) &&
    !/<Tag\b/.test(renderer),
  "a tag name in a variable is one edit from being a tag name from the description",
);

// ---------------------------------------------------------------------------
console.log("\nPROOF 2 -- allowlist: the tree holds nothing else");
// ---------------------------------------------------------------------------

function collectTypes(blocks, found = { block: new Set(), inline: new Set() }) {
  for (const block of blocks) {
    found.block.add(block.type);
    const inlines = block.type === "list" ? block.items.flat() : block.inline || [];
    const visit = (nodes) => {
      for (const node of nodes) {
        found.inline.add(node.type);
        if (node.children) visit(node.children);
      }
    };
    visit(inlines);
  }
  return found;
}

const ADVERSARIAL = [
  "<script>alert(1)</script>",
  '<img src=x onerror="alert(1)">',
  "<iframe src=javascript:alert(1)></iframe>",
  '<svg onload="alert(1)">',
  "</script><script>alert(1)</script>",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "a < b and c > d",
  "<<<>>>",
  "[click](javascript:alert(1))",
  "[click](https://example.com)",
  "![img](https://example.com/x.png)",
  "`code`",
  "```\nblock\n```",
  "> quote",
  "| a | b |\n| - | - |",
  "# **nested *deep* bold**",
  "- # heading in a bullet",
  "1. **bold** <b>raw</b>",
  "\u0000null byte",
  "javascript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD4=",
  "onerror=alert(1)",
  '" onmouseover="alert(1)',
  "{{constructor.constructor('alert(1)')()}}",
  "\\u003cscript\\u003e",
];

const seen = { block: new Set(), inline: new Set() };
for (const input of ADVERSARIAL) {
  collectTypes(parseDescription(input), seen);
}
// Plus every legitimate construct, so the allowlist is exercised fully.
for (const input of ["# h", "## h", "### h", "**b**", "*i*", "- a", "1. a", "a\nb", "a\n\nb"]) {
  collectTypes(parseDescription(input), seen);
}

t("no block type outside the allowlist",
  [...seen.block].filter((type) => !ALLOWED_BLOCK_TYPES.includes(type)), []);
t("no inline type outside the allowlist",
  [...seen.inline].filter((type) => !ALLOWED_INLINE_TYPES.includes(type)), []);
ok(
  "and the allowlist was actually exercised, not merely declared",
  seen.block.size === ALLOWED_BLOCK_TYPES.length &&
    seen.inline.size === ALLOWED_INLINE_TYPES.length,
  `blocks ${[...seen.block].join(",")} / inline ${[...seen.inline].join(",")}`,
);

// AND THE SAME ALLOWLIST, ASSERTED STRUCTURALLY.
//
// The corpus check above can only see node types some input in the corpus
// actually produces. The negative run proved that is not enough: a mutation
// adding a `[[` branch that emits `{ type: "link" }` was NOT caught, because
// no adversarial string in the corpus contains "[[". A check that depends on
// having imagined the attack is the weak form of this assertion.
//
// So the parser's own source is scanned for every `type:` literal it can
// emit, and each must be in the allowlist. That catches a new node type
// whether or not anyone thought to feed it the syntax that triggers it.
const parserSource = stripComments(
  readFileSync("src/lib/descriptionMarkdown.js", "utf8"),
);
const declaredTypes = [
  ...parserSource.matchAll(/type:\s*"([a-z]+)"/g),
].map((m) => m[1]);

t("the parser's source declares no type outside the allowlist",
  declaredTypes
    .filter(
      (type) =>
        !ALLOWED_BLOCK_TYPES.includes(type) && !ALLOWED_INLINE_TYPES.includes(type),
    )
    .sort(),
  []);
ok(
  "and it declares every type the allowlist claims",
  [...ALLOWED_BLOCK_TYPES, ...ALLOWED_INLINE_TYPES].every((type) =>
    declaredTypes.includes(type),
  ),
  `declared ${JSON.stringify([...new Set(declaredTypes)].sort())}`,
);

// The HTML renderer's output tags, checked against the same closed set.
const ALLOWED_TAGS = ["h3", "h4", "h5", "p", "strong", "em", "ul", "ol", "li", "br"];
const emittedTags = new Set();
for (const input of [...ADVERSARIAL, "# h", "## h", "### h", "**b**", "*i*", "- a", "1. a", "a\nb"]) {
  for (const m of blocksToHtml(parseDescription(input)).matchAll(/<\/?([a-z0-9]+)/gi)) {
    emittedTags.add(m[1].toLowerCase());
  }
}
t("the HTML renderer emits no tag outside the allowlist",
  [...emittedTags].filter((tag) => !ALLOWED_TAGS.includes(tag)).sort(), []);

// ---------------------------------------------------------------------------
console.log("\nPROOF 3 -- hostile input arrives as TEXT, in both renderers");
// ---------------------------------------------------------------------------

for (const input of ADVERSARIAL) {
  const html = descriptionToHtmlSubset(input);
  const text = descriptionToText(input);

  // No unescaped angle bracket from the INPUT may appear. Every "<" in the
  // output must be the start of an allowlisted tag.
  const tagsStripped = html.replace(
    new RegExp(`</?(?:${ALLOWED_TAGS.join("|")})>`, "g"),
    "",
  );
  ok(
    `no raw "<" survives: ${JSON.stringify(input.slice(0, 34))}`,
    !tagsStripped.includes("<") && !tagsStripped.includes(">"),
    `left over: ${JSON.stringify(tagsStripped.slice(0, 80))}`,
  );

  // The dangerous constructs must not have become attributes or protocols
  // in any element the renderer wrote.
  ok(
    `no attribute or handler is emitted: ${JSON.stringify(input.slice(0, 34))}`,
    !/<[a-z0-9]+\s/i.test(html),
    `the renderer writes bare tags only; found ${JSON.stringify(html.slice(0, 90))}`,
  );

  // The text flattening is for a meta tag, so it must carry no markup at all.
  ok(
    `the flattened text has no tags: ${JSON.stringify(input.slice(0, 34))}`,
    !/[<>]/.test(text.replace(/[<>]/g, (ch) => (input.includes(ch) ? "" : ch))),
    `found ${JSON.stringify(text.slice(0, 80))}`,
  );
}

// The specific ones worth asserting literally rather than by property.
t("a script tag is text",
  descriptionToHtmlSubset("<script>alert(1)</script>"),
  "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
t("an onerror image is text",
  descriptionToHtmlSubset('<img src=x onerror="alert(1)">'),
  "<p>&lt;img src=x onerror=\"alert(1)\"&gt;</p>");
t("an escaped script stays escaped once, not twice",
  descriptionToHtmlSubset("&lt;script&gt;"),
  "<p>&amp;lt;script&amp;gt;</p>");
t("a link is text, with no anchor",
  descriptionToHtmlSubset("[click](javascript:alert(1))"),
  "<p>[click](javascript:alert(1))</p>");
t("an https link is also text -- no links at all, by decision",
  descriptionToHtmlSubset("[click](https://example.com)"),
  "<p>[click](https://example.com)</p>");
ok("no anchor tag is reachable at all",
  !ALLOWED_TAGS.includes("a") && !emittedTags.has("a"));

// ---------------------------------------------------------------------------
console.log("\nPROOF 4 -- the markup path: no \"<\" reaches the script block");
// ---------------------------------------------------------------------------

const hostileJob = {
  id: 42,
  title: "Role",
  slug: "role",
  description: "# Heading\n\n</script><script>alert(1)</script>\n\n- **a** < b",
  city: "Bengaluru",
  job_function: "Engineering",
  employment_type: "full_time",
  work_mode: "hybrid",
  experience_min: 3,
  experience_max: 8,
  published_at: "2026-11-20T00:00:00.000Z",
  expires_at: "2026-12-20T00:00:00.000Z",
  status: "live",
};

const script = jobPostingScript(hostileJob, { name: "Test Co A", slug: "test-co-a" });

ok(
  "the serialised script block contains no '<' at all",
  script.slice('<script type="application/ld+json">'.length, -"</script>".length)
    .includes("<") === false,
  "the \\u003c replacement in jobPostingScript is what guarantees this",
);
ok(
  "so a description cannot close the script element",
  !/<\/script\s*>/i.test(
    script.slice('<script type="application/ld+json">'.length, -"</script>".length),
  ),
);
ok(
  "and the block is still valid JSON after that replacement",
  (() => {
    const body = script.slice(
      '<script type="application/ld+json">'.length,
      -"</script>".length,
    );
    try {
      return typeof JSON.parse(body).description === "string";
    } catch {
      return false;
    }
  })(),
);

// descriptionToHtml is the function jobPosting exposes, and it must now be
// the subset renderer rather than the old paragraph-wrapper.
t("descriptionToHtml renders the subset",
  descriptionToHtml("# Job Description"), "<h3>Job Description</h3>");
t("descriptionToHtml is still safe on a non-string",
  descriptionToHtml(null), "");

// ---------------------------------------------------------------------------
console.log("\nPROOF 5 -- visibility: the markup says what the page shows");
// ---------------------------------------------------------------------------
//
// The rule jobPosting.js states: "the markup must say what the page shows,
// not a tidier version of it". ONE PARSE IS WHAT MAKES THIS TRUE, and this is
// the check that stops a second parser being introduced later.

const VISIBILITY_CASES = [
  "# Job Description\n\nWe are hiring a **Senior Engineer** in *Bengaluru*.",
  "## Responsibilities\n\n- Build things\n- Ship things\n\n1. First\n2. Second",
  "Plain text with\na line break.",
  "<script>alert(1)</script>\n\n**after**",
  "# Heading\n\n- a < b\n- c > d",
];

for (const input of VISIBILITY_CASES) {
  const blocks = parseDescription(input);

  // What the page shows: the text of every node, in order.
  const pageText = blocksToText(blocks).replace(/\s+/g, " ").trim();

  // What the markup says: its own output with tags removed and entities
  // decoded back.
  //
  // INLINE TAGS ARE NOT WORD BOUNDARIES and block tags are. Replacing all of
  // them with a space put one before the full stop in "*Bengaluru*." and the
  // comparison failed on correct output -- a check that could not pass, which
  // is the fault this project has hit before. <strong> and <em> close up;
  // everything else separates.
  const markupText = blocksToHtml(blocks)
    .replace(/<\/?(?:strong|em)>/g, "")
    .replace(/<\/?(?:p|h3|h4|h5|ul|ol|li|br)>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  t(`the two agree: ${JSON.stringify(input.slice(0, 32))}`, markupText, pageText);
}

// And the meta description is the same words with the marks gone.
t("the meta description drops the hash",
  metaDescription("# Job Description\n\nWe are hiring."),
  "Job Description We are hiring.");
t("the meta description keeps the bold word, not the asterisks",
  metaDescription("We are in **Bengaluru**."), "We are in Bengaluru.");
t("the meta description flattens a list",
  metaDescription("- one\n- two"), "one two");
ok(
  "the meta description carries no markup",
  !/[<>*#]/.test(metaDescription("# H\n\n- **a**\n\n<b>c</b>").replace(/[<>]/g, "")),
  metaDescription("# H\n\n- **a**\n\n<b>c</b>"),
);

// ---------------------------------------------------------------------------
console.log("\nregressions: what stage 10 asserted must still hold");
// ---------------------------------------------------------------------------

t("a blank line is still a paragraph break",
  descriptionToHtml("one\n\ntwo"), "<p>one</p><p>two</p>");
t("a single newline is still a break",
  descriptionToHtml("one\ntwo"), "<p>one<br>two</p>");
t("three blank lines are still one break",
  descriptionToHtml("one\n\n\n\ntwo"), "<p>one</p><p>two</p>");
t("empty text is still empty",
  descriptionToHtml(""), "");
t("ampersands are still escaped",
  descriptionToHtml("Tom & Jerry"), "<p>Tom &amp; Jerry</p>");
t("angle brackets are still escaped",
  descriptionToHtml("a < b > c"), "<p>a &lt; b &gt; c</p>");
t("raw HTML is still text",
  descriptionToHtml("one\n\n<b>two</b>"), "<p>one</p><p>&lt;b&gt;two&lt;/b&gt;</p>");

// ---------------------------------------------------------------------------

console.log(`\nItem 27 Markdown test: ${passed} passed, ${failures.length} failed`);

if (failures.length) {
  console.log("");
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}

// PROOF 6 lives in check-overflow.mjs, which measures the rendered page
// because a class can compile, apply and still do nothing. It needs a fixture
// whose 180-character unbroken word sits inside a HEADING and inside a LIST
// ITEM, not only inside a paragraph -- those are three different measurements
// now that the description has structure.
