// ===========================================================================
// THE NEGATIVE RUN for scripts/item27-markdown-test.mjs.
//
//   node scripts/item27-markdown-negative-run.mjs
//
// Copies src/ and scripts/ to a temp directory, applies ONE breaking
// mutation, bundles and runs the suite there, and asserts it fails AND fails
// on the right assertion.
//
// WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE. Rishi's question before this
// was built was not "what will you use" but *"how you'd prove a hostile
// description can't execute anything"*. A suite that asserts safety is worth
// nothing until its assertions have been shown to go red when safety is
// removed -- otherwise it is the fifth check on this project that could not
// fail. Six of the mutations below delete a specific safety property and
// require the specific proof that covers it to catch them.
//
// It needs its own harness rather than reusing the settings one because this
// suite IMPORTS the modules it tests, so the copy has to be bundled and run
// from inside the temp directory rather than pointed at with SRC_ROOT.
// ===========================================================================

import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// esbuild is NOT a local dependency -- HANDOVER.md's instructions use `npx`
// for exactly this reason, and the first version of this harness assumed a
// node_modules/.bin/esbuild that does not exist, so all 16 mutations reported
// "did not bundle" rather than being caught. The empty stderr was the tell.
//
// So: BUNDLE from the repo (where npx can find esbuild) with absolute paths,
// and RUN from the copy (where the suite's own readFileSync("src/...") must
// resolve to the mutated files). Bundling needs no node_modules in the copy,
// because the suite imports only project files and node: builtins.
const NPX = "npx";

// [label, file under the copy root, transform, expected text in the failure]
const MUTANTS = [
  // --- PROOF 1: structural ------------------------------------------------
  [
    "the page renderer gains dangerouslySetInnerHTML",
    "src/components/JobDescription.jsx",
    (s) =>
      s.replace(
        "    <div className=\"min-w-0\">",
        "    <div className=\"min-w-0\" dangerouslySetInnerHTML={{ __html: text }}>",
      ),
    "no file in src/ uses dangerouslySetInnerHTML",
  ],
  [
    "the renderer takes a tag name from data again",
    "src/components/JobDescription.jsx",
    (s) =>
      s.replace(
        /    if \(block\.level === 1\) \{\n      return \(\n        <h3 className=\{`\$\{BLOCK\} mt-4 text-base font-bold text-slate-900 first:mt-0`\}>/,
        "    const Tag = `h${block.level + 2}`;\n    if (block.level === 1) {\n      return (\n        <Tag className={`${BLOCK} mt-4 text-base font-bold text-slate-900 first:mt-0`}>",
      ),
    "the page renderer writes its tags literally",
  ],
  [
    "the page renderer starts building HTML strings",
    "src/components/JobDescription.jsx",
    (s) =>
      s.replace(
        'import { parseDescription } from "../lib/descriptionMarkdown";',
        'import { parseDescription, blocksToHtml } from "../lib/descriptionMarkdown";',
      ),
    "the page renderer does not import the HTML serialiser",
  ],

  // --- PROOF 2: the allowlist ---------------------------------------------
  [
    // THIS MUTATION IS WHY THE SUITE HAS A STRUCTURAL ALLOWLIST CHECK.
    // On its first run it was NOT CAUGHT: the corpus-driven check only sees
    // node types some adversarial string actually produces, and nothing in
    // the corpus contains "[[". The check depended on having imagined the
    // attack, which is the weak form of the assertion. It is now caught by
    // the scan of the parser's own source for `type:` literals, which does
    // not care whether anyone thought of the syntax.
    "the parser emits a node type nobody allowed",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        '    if (two === "**") {',
        '    if (text.slice(i, i + 2) === "[[") {\n' +
          '      flush();\n' +
          '      nodes.push({ type: "link", href: text.slice(i + 2) });\n' +
          '      break;\n' +
          '    }\n' +
          '    if (two === "**") {',
      ),
    "the parser's source declares no type outside the allowlist",
  ],
  [
    "the HTML renderer emits an anchor",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        'if (node.type === "em") return `<em>${inlineToHtml(node.children)}</em>`;',
        'if (node.type === "em") return `<a href="#">${inlineToHtml(node.children)}</a>`;',
      ),
    "the HTML renderer emits no tag outside the allowlist",
  ],

  // --- PROOF 3: hostile input --------------------------------------------
  [
    "escaping is removed from the HTML renderer",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        `export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}`,
        `export function escapeHtml(value) {
  return String(value);
}`,
      ),
    'no raw "<" survives',
  ],
  [
    "only angle brackets stop being escaped",
    "src/lib/descriptionMarkdown.js",
    (s) => s.replace('    .replace(/</g, "&lt;")\n', ""),
    'no raw "<" survives',
  ],
  [
    "the renderer starts writing an attribute",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        'return `<p>${inlineToHtml(block.inline)}</p>`;',
        'return `<p class="desc">${inlineToHtml(block.inline)}</p>`;',
      ),
    "no attribute or handler is emitted",
  ],
  [
    "links become anchors",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        "function inlineToHtml(nodes) {",
        "function inlineToHtml(nodes) {\n" +
          "  const asLink = (t) => t.replace(/\\[([^\\]]*)\\]\\(([^)]*)\\)/g, '<a href=\"$2\">$1</a>');\n",
      ).replace(
        'if (node.type === "text") return escapeHtml(node.value);',
        'if (node.type === "text") return asLink(escapeHtml(node.value));',
      ),
    "the HTML renderer emits no tag outside the allowlist",
  ],

  // --- PROOF 4: the markup path ------------------------------------------
  [
    "the \\u003c replacement is dropped from the script block",
    "src/lib/jobPosting.js",
    (s) =>
      s.replace(
        'const json = JSON.stringify(posting).replace(/</g, "\\\\u003c");',
        "const json = JSON.stringify(posting);",
      ),
    "the serialised script block contains no '<' at all",
  ],

  // --- PROOF 5: visibility ------------------------------------------------
  [
    "the text flattening silently drops list items",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        '      if (block.type === "list") {\n        return block.items.map((item) => inlineToText(item)).join(" ");\n      }',
        '      if (block.type === "list") {\n        return "";\n      }',
      ),
    "the two agree",
  ],
  [
    "a second parse is introduced for the markup",
    "src/lib/jobPosting.js",
    (s) =>
      s.replace(
        "  return descriptionToHtmlSubset(text);",
        '  return `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;',
      ),
    "descriptionToHtml renders the subset",
  ],
  [
    "the meta description goes back to the raw text",
    "src/lib/jobPageHead.js",
    (s) =>
      s.replace(
        "  const flat = descriptionToText(text).replace(/\\s+/g, \" \").trim();",
        '  const flat = text.replace(/\\s+/g, " ").trim();',
      ),
    "the meta description drops the hash",
  ],

  // --- the feature itself -------------------------------------------------
  [
    "headings stop being headings",
    "src/lib/descriptionMarkdown.js",
    (s) => s.replace("const HEADING_RE = /^(#{1,3})\\s+(.*)$/;", "const HEADING_RE = /^$^/;"),
    "a heading is a heading, not a hash",
  ],
  [
    "headings start at h1 instead of h3",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s.replace(
        'const HEADING_TAGS = ["h3", "h4", "h5"];',
        'const HEADING_TAGS = ["h1", "h2", "h3"];',
      ),
    "the three heading levels start at h3",
  ],
  [
    // The obvious mutation here -- `close === -1 || close > i + 2` -- makes
    // the loop index go backwards and hangs node, so the suite dies instead
    // of failing an assertion. This one terminates: a missing close is
    // treated as end-of-string, which is the behaviour the assertion forbids.
    "an unclosed marker swallows the rest of the line",
    "src/lib/descriptionMarkdown.js",
    (s) =>
      s
        .replace(
          '      const close = text.indexOf("**", i + 2);',
          '      const found = text.indexOf("**", i + 2);\n' +
            "      const close = found === -1 ? text.length : found;",
        )
        .replace("        i = close + 2;", "        i = close + 2;"),
    "an unclosed double marker stays text",
  ],
];

const results = [];
let caught = 0;

for (const [label, file, mutate, expected] of MUTANTS) {
  const dir = mkdtempSync(join(tmpdir(), "i27-"));

  cpSync(join(REPO, "src"), join(dir, "src"), { recursive: true });
  cpSync(join(REPO, "scripts"), join(dir, "scripts"), { recursive: true });

  const path = join(dir, file);
  const before = readFileSync(path, "utf8");
  let after;
  try {
    after = mutate(before);
  } catch (err) {
    results.push(`${label} — MUTATION FAILED: ${err.message}`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  if (after === before) {
    results.push(`${label} — MUTATION CHANGED NOTHING (its anchor moved)`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  writeFileSync(path, after);

  const bundle = join(dir, "suite.mjs");
  let output = "";
  let failed = false;

  try {
    execFileSync(
      NPX,
      [
        "esbuild",
        join(dir, "scripts/item27-markdown-test.mjs"),
        "--bundle",
        "--format=esm",
        "--platform=node",
        "--packages=external",
        `--outfile=${bundle}`,
      ],
      { cwd: REPO, encoding: "utf8", stdio: "pipe" },
    );
  } catch (err) {
    // A mutation that will not even bundle still proves the property is
    // load-bearing, but not WHICH assertion covers it, so it is reported
    // rather than counted.
    results.push(`${label} — did not bundle: ${(err.stderr || "").split("\n")[0]}`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  try {
    output = execFileSync("node", [bundle], { cwd: dir, encoding: "utf8" });
  } catch (err) {
    failed = true;
    output = (err.stdout || "") + (err.stderr || "");
  }

  rmSync(dir, { recursive: true, force: true });

  if (!failed) {
    results.push(`${label} — SUITE STILL PASSED`);
    continue;
  }

  if (!output.includes(expected)) {
    results.push(`${label} — failed, but not on "${expected}"`);
    continue;
  }

  caught += 1;
  console.log(`  caught   ${label}`);
}

console.log(`\nItem 27 negative run: ${caught}/${MUTANTS.length} mutations caught`);

if (results.length) {
  console.log("");
  for (const r of results) console.log(`  MISSED   ${r}`);
  process.exit(1);
}
