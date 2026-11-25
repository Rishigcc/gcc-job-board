// ===========================================================================
// RESERVED WORDS IN IDENTIFIER POSITIONS, across every .sql file.
//
//   node scripts/sql-reserved-words-test.mjs
//
// WHY THIS EXISTS. Twice now a Postgres reserved word has been used as an
// identifier in this project:
//
//   * migration 025's era -- `current_role` as a column alias, which does not
//     error at all. It silently returns the SESSION ROLE instead of the
//     column, which is the worse of the two failure modes.
//   * item 27's overflow fixture -- `order by check`, which failed at parse
//     time with 42601 on the file's LAST LINE, after a dry run had "verified"
//     every check in it.
//
// THE SECOND ONE IS WHY A GREP IS NOT ENOUGH ON ITS OWN, and why this file
// is a test rather than a note: roughly half the .sql files in this project
// HAVE NEVER BEEN PARSED BY ANYTHING. Every migration has a matching
// `_rollback.sql` that ships with it and is never run, and
// `post-merge/drop_question_authors.sql` runs only after the merge. A
// reserved word in one of those surfaces at the worst possible moment --
// during a rollback, which is by definition an emergency.
//
// WHAT IT CANNOT DO. It is not a SQL parser. It checks the identifier
// positions where this class of mistake actually lands, listed below. A
// reserved word somewhere else entirely would pass this and still fail
// Postgres. For a statement that CAN be sent to the server, the stronger
// check is to send it: `EXPLAIN <write statement>` parses and plans without
// performing it, so it works on the read-only connection, and the error code
// distinguishes the two cases -- 42601 is a syntax error, 42501 is permission
// denied, which means the statement parsed. Both were verified on 25 Nov 2026.
//
// THE WORD LIST comes from the live server:
//   select word from pg_get_keywords() where catcode in ('R','T');
// 101 words as of PostgreSQL 17, 25 Nov 2026. Re-run that query after a
// major-version upgrade.
// ===========================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RESERVED = new Set(
  `all analyse analyze and any array as asc asymmetric both case cast check collate
   column constraint create current_catalog current_date current_role current_time
   current_timestamp current_user default deferrable desc distinct do else end except
   false fetch for foreign from grant group having in initially intersect into lateral
   leading limit localtime localtimestamp not null offset on only or order placing
   primary references returning select session_user some symmetric system_user table
   then to trailing true union unique user using variadic when where window with
   authorization binary collation concurrently cross current_schema freeze full ilike
   inner is isnull join left like natural notnull outer overlaps right similar
   tablesample verbose`
    .split(/\s+/)
    .filter(Boolean),
);

// Comments and single-quoted literals are removed first, so prose explaining
// the trap and error messages mentioning a keyword do not produce findings.
// This file's own header would otherwise be its loudest result.
function stripNonCode(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");
}

// The positions where an identifier is expected. A reserved word here either
// fails to parse or, worse, resolves to the keyword's own meaning.
// The lookahead on the alias pattern is wider than it first was. The
// original required the alias to be followed by a comma, a bracket, a
// newline or the end of the string -- which MISSED `as current_role from
// public.user_roles`, the very incident this file was written for, because a
// keyword followed it on the same line. The self-test below caught that on
// its first run, which is the whole argument for having one.
const ALIAS_FOLLOWERS =
  "[,)\\n;]|$|\\bfrom\\b|\\bwhere\\b|\\border\\b|\\bgroup\\b|\\bunion\\b|\\blimit\\b|\\bhaving\\b|\\bon\\b|\\bfor\\b";

const POSITIONS = [
  [
    "alias after AS",
    new RegExp(`\\bas\\s+([a-z_][a-z_0-9]*)\\s*(?=${ALIAS_FOLLOWERS})`, "gi"),
  ],
  [
    "bare column reference",
    /\bselect\s+([a-z_][a-z_0-9]*)\s*(?=,|\s+from\b)/gi,
  ],
  ["ORDER BY <ident>", /\border\s+by\s+([a-z_][a-z_0-9]*)\b(?!\s+(?:when|=|'))/gi],
  ["GROUP BY <ident>", /\bgroup\s+by\s+([a-z_][a-z_0-9]*)\b/gi],
  ["RETURNING <ident>", /\breturning\s+([a-z_][a-z_0-9]*)\b/gi],
  [
    "column definition",
    /^\s{2,}([a-z_][a-z_0-9]*)\s+(?:text|uuid|bigint|integer|boolean|timestamptz|jsonb|numeric|date|serial)\b/gim,
  ],
  [
    "function argument",
    /[(,]\s*([a-z_][a-z_0-9]*)\s+(?:text|uuid|bigint|integer|boolean|timestamptz|jsonb|numeric|date)\b/gi,
  ],
];

// `order by case <x> when ... end` is a CASE EXPRESSION, not an alias.
// Migration 020 does exactly this and is applied and working; without this
// exclusion the scanner reports it, which is a check that cries wolf.
function isCaseExpression(code, at) {
  return /^case\b/i.test(code.slice(at)) && /\bwhen\b/i.test(code.slice(at, at + 200));
}

function scan(code) {
  const found = [];
  for (const [label, pattern] of POSITIONS) {
    pattern.lastIndex = 0;
    for (const m of code.matchAll(pattern)) {
      const word = m[1].toLowerCase();
      if (!RESERVED.has(word)) continue;
      if (word === "case" && isCaseExpression(code, m.index + m[0].toLowerCase().indexOf("case"))) {
        continue;
      }
      found.push({
        word,
        label,
        line: code.slice(0, m.index).split("\n").length,
        snippet: m[0].replace(/\s+/g, " ").trim().slice(0, 60),
      });
    }
  }
  return found;
}

function sqlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sqlFiles(path));
    else if (name.endsWith(".sql")) out.push(path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The scanner's own self-test, FIRST. A scanner that silently matches nothing
// reports a clean repository, which is indistinguishable from a clean
// repository -- the "check that cannot fail" fault this project has met four
// times. These are the two real incidents, as text.
// ---------------------------------------------------------------------------

const SELF_TEST = [
  ["order by check", "check", "the item 27 fixture: a parse error at 42601"],
  ["select r.role as current_role from public.user_roles r", "current_role", "the silent one: returns the session role"],
  ["select 1 as user, 2 as table", "user", "two in one line"],
  ["group by order", "order", "GROUP BY"],
  ["returning user", "user", "RETURNING"],
  ["  check text not null", "check", "a column named with a reserved word"],
];

let passed = 0;
const failures = [];

for (const [sql, word, why] of SELF_TEST) {
  const found = scan(stripNonCode(sql)).map((f) => f.word);
  if (found.includes(word)) {
    passed += 1;
  } else {
    failures.push(
      `self-test: ${JSON.stringify(sql)} should flag "${word}" (${why}) — found ${JSON.stringify(found)}`,
    );
  }
}

// And it must NOT flag the legitimate cases, or it is noise nobody reads.
const NOT_FLAGGED = [
  ["order by case k.availability when 'open' then 0 else 2 end, k.saved_at desc", "migration 020's CASE expression"],
  ["select label, result, detail from checks order by seq", "the project's own result-table convention"],
  ["  description text not null", "an ordinary column"],
  ["-- order by check would fail here", "a comment explaining the trap"],
  ["select 'order by check' as label", "a string literal mentioning it"],
];

for (const [sql, why] of NOT_FLAGGED) {
  const found = scan(stripNonCode(sql));
  if (found.length === 0) {
    passed += 1;
  } else {
    failures.push(
      `self-test: ${JSON.stringify(sql)} (${why}) should NOT be flagged — got ${JSON.stringify(found.map((f) => f.word))}`,
    );
  }
}

// ---------------------------------------------------------------------------
// The repository.
// ---------------------------------------------------------------------------

const files = sqlFiles("supabase");
let findings = 0;

for (const path of files) {
  const found = scan(stripNonCode(readFileSync(path, "utf8")));
  if (found.length === 0) {
    passed += 1;
    continue;
  }
  findings += found.length;
  for (const f of found) {
    failures.push(
      `${path}:${f.line}  [${f.label}]  reserved word "${f.word}"  ->  ${JSON.stringify(f.snippet)}`,
    );
  }
}

console.log(
  `\nSQL reserved-word test: ${passed} passed, ${failures.length} failed  ` +
    `(${files.length} .sql files, ${RESERVED.size} reserved words, ` +
    `${POSITIONS.length} identifier positions, ${findings} finding(s))`,
);

if (failures.length) {
  console.log("");
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
