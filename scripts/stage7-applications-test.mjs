// ===========================================================================
// Stage 7 -- how an application is described to a recruiter.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage7-applications-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t7.mjs && node /tmp/t7.mjs
//
// WHAT IS TESTED HERE AND WHY IT IS WORTH TESTING
//
//   Status labels. Two locked product decisions live in this one map: a raw
//   database value is never shown to a person, and the word "rejected" is
//   never used. Both are the kind of thing that survives a review and then
//   dies quietly in a later edit, so they are asserted rather than trusted --
//   including a sweep over every label for the substring "reject".
//
//   summariseStatuses. It is arithmetic over a list, and the one case worth
//   pinning is an UNKNOWN status: if the enum grows and this map does not,
//   the row still has to be counted somewhere rather than vanishing from
//   the summary while remaining in the list.
//
//   Dates. formatApplicationDate takes whatever the database returns, and
//   null is a legitimate value -- an unverified recruiter's latest_at, or a
//   candidate with no resume on file. It must not produce "Invalid Date" on
//   a page a recruiter is reading.
//
// WHAT IT DOES NOT PROVE
//   Nothing about the verification gate. That an unverified recruiter is not
//   SENT any names is proved in the browser against the live functions --
//   see the stage 7 checklist. No amount of JavaScript testing can establish
//   it, because the point is what the database does and does not return.
// ===========================================================================

import { RECRUITER_JOB_SORTS, sortRecruiterJobs } from "../src/lib/jobOptions.js";
import {
  RECRUITER_STATUSES,
  statusLabel,
  statusTone,
  formatApplicationDate,
  applicationCountLabel,
  summariseStatuses,
} from "../src/lib/applicationDisplay.js";

let pass = 0, fail = 0;

const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log("\nstatus labels -- no raw database value ever reaches a person");
t("applied",      statusLabel("applied"), "Applied");
t("shortlisted",  statusLabel("shortlisted"), "Shortlisted");
t("not_selected", statusLabel("not_selected"), "Not selected");
t("withdrawn",    statusLabel("withdrawn"), "Withdrawn");
t("an unknown value falls back rather than leaking the token",
  statusLabel("under_review"), "Applied");
t("null falls back",      statusLabel(null), "Applied");
t("undefined falls back", statusLabel(undefined), "Applied");

console.log("\nthe word 'rejected' appears nowhere -- a locked decision");
const everyLabel = [
  ...RECRUITER_STATUSES.map((s) => s.label),
  statusLabel("applied"), statusLabel("shortlisted"),
  statusLabel("not_selected"), statusLabel("withdrawn"),
].join(" ").toLowerCase();
t("no label contains 'reject'", everyLabel.includes("reject"), false);
t("no label is a raw value",    everyLabel.includes("not_selected"), false);

console.log("\nwhat a recruiter may set -- never 'withdrawn'");
t("three options", RECRUITER_STATUSES.map((s) => s.value),
  ["applied", "shortlisted", "not_selected"]);
t("withdrawn is not offered",
  RECRUITER_STATUSES.some((s) => s.value === "withdrawn"), false);

console.log("\ntones");
t("shortlisted stands out",    statusTone("shortlisted"), "good");
t("a new application stands out", statusTone("applied"), "new");
t("not selected recedes",      statusTone("not_selected"), "muted");
t("withdrawn recedes",         statusTone("withdrawn"), "muted");
t("unknown gets the new tone", statusTone("under_review"), "new");

console.log("\ndates -- null is a legitimate value, not a bug");
t("null",          formatApplicationDate(null), null);
t("undefined",     formatApplicationDate(undefined), null);
t("empty string",  formatApplicationDate(""), null);
t("nonsense never renders 'Invalid Date'",
  formatApplicationDate("not a date"), null);
t("a real timestamp",
  formatApplicationDate("2026-11-19T06:21:23.127831+00:00"), "19 November 2026");
t("a date-only value",
  formatApplicationDate("2026-01-05"), "5 January 2026");

console.log("\ncounts");
t("none", applicationCountLabel(0), "No applications yet");
t("null is none", applicationCountLabel(null), "No applications yet");
t("one is singular", applicationCountLabel(1), "1 application");
t("two", applicationCountLabel(2), "2 applications");
t("twenty five", applicationCountLabel(25), "25 applications");

console.log("\nthe summary line");
const rows = (...statuses) => statuses.map((status) => ({ status }));
t("empty list", summariseStatuses([]), "");
t("null list",  summariseStatuses(null), "");
t("all new",    summariseStatuses(rows("applied", "applied")), "2 new");
t("a mix keeps a fixed order",
  summariseStatuses(rows("not_selected", "shortlisted", "applied")),
  "1 new · 1 shortlisted · 1 not selected");
t("a zero bucket is left out entirely",
  summariseStatuses(rows("shortlisted", "shortlisted")), "2 shortlisted");
t("withdrawn comes last",
  summariseStatuses(rows("withdrawn", "applied")), "1 new · 1 withdrawn");
t("an unknown status is counted, not dropped",
  summariseStatuses(rows("under_review", "applied")), "2 new");
t("the total always matches the list length",
  summariseStatuses(rows("applied", "shortlisted", "not_selected", "withdrawn")),
  "1 new · 1 shortlisted · 1 not selected · 1 withdrawn");

// ---------------------------------------------------------------------------
// Ordering the recruiter's own roles. An ordering bug is silent -- the list
// still renders, just wrong -- so the tie-break in "most applications" is
// pinned here rather than eyeballed.
// ---------------------------------------------------------------------------
const job = (id, day) => ({ id, published_at: `2026-11-${String(day).padStart(2, "0")}T00:00:00Z` });
const ids = (rows) => rows.map((r) => r.id);

const three = [job(1, 5), job(2, 15), job(3, 10)];
const counts = { 1: { count: 9 }, 3: { count: 2 } };

console.log("\nsorting roles");
t("three options", RECRUITER_JOB_SORTS.map((s) => s.value),
  ["newest", "oldest", "applications"]);
t("newest first",  ids(sortRecruiterJobs(three, counts, "newest")), [2, 3, 1]);
t("oldest first",  ids(sortRecruiterJobs(three, counts, "oldest")), [1, 3, 2]);
t("most applications first",
  ids(sortRecruiterJobs(three, counts, "applications")), [1, 3, 2]);
t("a role with no applications never sits above one that has some",
  ids(sortRecruiterJobs([job(1, 30), job(2, 1)], { 2: { count: 4 } }, "applications")),
  [2, 1]);
t("ties fall back to newest",
  ids(sortRecruiterJobs([job(1, 5), job(2, 20)], { 1: { count: 3 }, 2: { count: 3 } }, "applications")),
  [2, 1]);
t("no counts at all is just newest",
  ids(sortRecruiterJobs(three, {}, "applications")), [2, 3, 1]);
t("an unknown sort falls back to newest",
  ids(sortRecruiterJobs(three, counts, "sideways")), [2, 3, 1]);
t("the default is newest",
  ids(sortRecruiterJobs(three, counts)), [2, 3, 1]);
t("an unusable date sorts to the bottom, not at random",
  ids(sortRecruiterJobs([{ id: 1, published_at: null }, job(2, 3)], {}, "newest")), [2, 1]);
t("empty list",  sortRecruiterJobs([], counts, "newest"), []);
t("null list",   sortRecruiterJobs(null, counts, "newest"), []);
t("the input array is not mutated", (() => {
  const original = [job(1, 5), job(2, 15)];
  sortRecruiterJobs(original, counts, "oldest");
  return ids(original);
})(), [1, 2]);
t("every role survives the sort",
  sortRecruiterJobs(three, counts, "applications").length, 3);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
