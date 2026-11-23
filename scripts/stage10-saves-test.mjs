// ===========================================================================
// Stage 10, round one -- what a saved role says on screen.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage10-saves-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t10.mjs && node /tmp/t10.mjs
//
// WHY THIS IS WORTH TESTING
//   A saved role has three states and only one of them is the ordinary case.
//   The other two are the ones a candidate meets weeks later, when the role
//   has closed or been taken down -- which is exactly when nobody is looking
//   at this code. Two properties have to hold:
//
//     1. A withdrawn role never shows the recruiter's words. An admin took it
//        down; a page that still prints the title has undone that.
//     2. An unrecognised availability is treated as withdrawn, not as open.
//        That is the fail-closed direction, and it is the one a future
//        jobs.status value will exercise.
//
//   The summary line is tested too, because the count on /profile counts rows
//   in job_saves: if the line and the counter can disagree, one of them is a
//   bug report waiting to be filed.
//
// WHAT IT DOES NOT PROVE
//   Nothing about authorisation. That my_saved_jobs() returns only the
//   caller's own saves is proved against the database by migration 020's c5
//   and c7, and in the browser by the stage 10 checklist.
// ===========================================================================

import {
  OPEN,
  CLOSED,
  WITHDRAWN,
  isWithheld,
  canApply,
  availabilityLabel,
  availabilityNote,
  savedJobToCard,
  savedSummary,
} from "../src/lib/savedJobsDisplay.js";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failures.push(`${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

function checkTrue(name, actual) {
  check(name, actual, true);
}

function checkFalse(name, actual) {
  check(name, actual, false);
}

// A row in the shape public.my_saved_jobs() returns.
function row(availability, overrides = {}) {
  const withheld = availability !== OPEN && availability !== CLOSED;

  return {
    job_id: 42,
    saved_at: "2026-11-20T10:00:00Z",
    availability,
    // The function itself nulls these for a withdrawn role. The fixture does
    // the same, so the test exercises what actually arrives.
    title: withheld ? null : "Senior Financial Analyst",
    slug: withheld ? null : "senior-financial-analyst",
    city: withheld ? null : "Bengaluru",
    work_mode: withheld ? null : "hybrid",
    job_function: withheld ? null : "Finance & Accounting",
    employment_type: withheld ? null : "full_time",
    experience_min: withheld ? null : 4,
    experience_max: withheld ? null : 8,
    salary_min: withheld ? null : 1800000,
    salary_max: withheld ? null : 2600000,
    salary_currency: withheld ? null : "INR",
    salary_period: withheld ? null : "year",
    skills: withheld ? null : ["SAP FICO", "IFRS"],
    published_at: withheld ? null : "2026-11-17T11:16:23Z",
    expires_at: withheld ? null : "2026-12-17T11:16:23Z",
    company_name: withheld ? null : "Test Co B",
    company_logo_url: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. The three states, and the fourth that must not exist
// ---------------------------------------------------------------------------
checkFalse("open is not withheld", isWithheld(OPEN));
checkFalse("closed is not withheld", isWithheld(CLOSED));
checkTrue("withdrawn is withheld", isWithheld(WITHDRAWN));

// The property that matters most: anything unrecognised fails closed.
for (const unknown of ["pending", "expired", "hidden", "", null, undefined, 0, "OPEN", "Open"]) {
  checkTrue(`unrecognised availability ${JSON.stringify(unknown)} is withheld`, isWithheld(unknown));
  checkFalse(`unrecognised availability ${JSON.stringify(unknown)} cannot be applied to`, canApply(unknown));
}

checkTrue("an open role can be applied to", canApply(OPEN));
checkFalse("a closed role cannot be applied to", canApply(CLOSED));
checkFalse("a withdrawn role cannot be applied to", canApply(WITHDRAWN));

// ---------------------------------------------------------------------------
// 2. Labels and notes
// ---------------------------------------------------------------------------
check("open gets no chip", availabilityLabel(OPEN), "");
check("closed chip", availabilityLabel(CLOSED), "No longer open");
check("withdrawn chip", availabilityLabel(WITHDRAWN), "No longer available");
check("unknown gets the withdrawn chip", availabilityLabel("expired"), "No longer available");

check("open gets no note", availabilityNote(OPEN), "");

// Stage 9b found raw column values on screen twice. No label or note may
// contain one, and no label or note may contain an underscore.
const RAW = ["live", "pending", "expired", "closed", "hidden", "not_selected", "shortlisted", "applied"];

for (const state of [OPEN, CLOSED, WITHDRAWN, "expired", null]) {
  const text = `${availabilityLabel(state)} ${availabilityNote(state)}`.toLowerCase();

  checkFalse(`no underscore on screen for ${JSON.stringify(state)}`, text.includes("_"));

  // "closed by the recruiter" is a sentence, not a status value; the test is
  // for the value standing alone as a word of its own.
  for (const value of RAW) {
    if (value === "closed") continue;
    checkFalse(
      `no raw value "${value}" on screen for ${JSON.stringify(state)}`,
      new RegExp(`\\b${value}\\b`).test(text)
    );
  }
}

// ---------------------------------------------------------------------------
// 3. savedJobToCard -- the mapping into the shape GccJobCard already reads
// ---------------------------------------------------------------------------
const card = savedJobToCard(row(OPEN));

check("card id comes from job_id", card.id, 42);
check("card keeps the slug, which the URL needs", card.slug, "senior-financial-analyst");
check("card title", card.title, "Senior Financial Analyst");
check("card nests the company the way the card reads it", card.companies, {
  name: "Test Co B",
  logo_url: null,
});
check("card keeps the skills array", card.skills, ["SAP FICO", "IFRS"]);
check("card keeps salary units together", [card.salary_currency, card.salary_period], ["INR", "year"]);

// Every field the card renders has to survive the mapping. A missing one
// would show as a quietly absent pill rather than as an error.
for (const field of [
  "id", "slug", "title", "city", "work_mode", "job_function", "employment_type",
  "experience_min", "experience_max", "salary_min", "salary_max",
  "salary_currency", "salary_period", "skills", "published_at", "expires_at",
]) {
  checkTrue(`card carries ${field}`, card[field] !== undefined && card[field] !== null);
}

// A closed role still maps, because its title is still shown.
checkTrue("a closed role maps to a card shape", savedJobToCard(row(CLOSED)) !== null);

// And the one that must not.
check("a withdrawn role has no card", savedJobToCard(row(WITHDRAWN)), null);
check("an unrecognised state has no card", savedJobToCard(row("expired")), null);
check("a missing row has no card", savedJobToCard(null), null);
check("an empty row has no card", savedJobToCard({}), null);

// ---------------------------------------------------------------------------
// 4. The summary line accounts for every row
// ---------------------------------------------------------------------------
check("no saves, no line", savedSummary([]), "");
check("not an array, no line", savedSummary(null), "");

check("one open role", savedSummary([row(OPEN)]), "1 saved role");
check("three open roles", savedSummary([row(OPEN), row(OPEN), row(OPEN)]), "3 saved roles");

check(
  "a mix names every group",
  savedSummary([row(OPEN), row(OPEN), row(CLOSED), row(WITHDRAWN)]),
  "4 saved roles · 2 still open · 1 no longer open · 1 no longer available"
);

check(
  "nothing open at all",
  savedSummary([row(CLOSED), row(WITHDRAWN)]),
  "2 saved roles · 0 still open · 1 no longer open · 1 no longer available"
);

check(
  "an unrecognised state is counted as unavailable, not dropped",
  savedSummary([row(OPEN), row("expired")]),
  "2 saved roles · 1 still open · 1 no longer available"
);

// The property, stated as a property rather than as examples: the first
// number is always the row count, whatever the states are. That is what keeps
// it equal to the counter on /profile.
const mixes = [
  [OPEN], [CLOSED], [WITHDRAWN], ["expired"],
  [OPEN, CLOSED], [OPEN, WITHDRAWN], [CLOSED, WITHDRAWN],
  [OPEN, OPEN, CLOSED, WITHDRAWN, "expired", null],
];

for (const mix of mixes) {
  const rows = mix.map((s) => row(s));
  const line = savedSummary(rows);
  check(`summary opens with the row count for ${JSON.stringify(mix)}`,
    line.startsWith(`${rows.length} saved role`), true);
}

// ---------------------------------------------------------------------------

console.log(`\nStage 10 saved-roles test: ${passed} passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log("\nFAILURES:\n");
  for (const f of failures) console.log(`  ${f}\n`);
  process.exit(1);
}

console.log("All good.\n");
