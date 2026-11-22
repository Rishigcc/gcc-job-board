// ===========================================================================
// Stage 8 -- what the candidate is told about their own applications.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage8-candidate-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t8.mjs && node /tmp/t8.mjs
//
// WHY THIS IS WORTH TESTING
//
//   PRECEDENCE. A recruiter can shortlist someone and the role can then
//   expire. Both facts are true and only one can be a chip. Showing "Closed"
//   over a shortlist would read as a rejection, which is the crueller of the
//   two possible mistakes and the one no amount of clicking around would
//   reveal -- you would need a shortlisted application on an expired role to
//   see it, which is exactly the state nobody sets up by hand.
//
//   THE VOCABULARY. Applied / Shortlisted / Not selected / Closed is a locked
//   decision, "Closed" is the only one not stored in a column, and the word
//   "rejected" must never appear. All three are asserted rather than trusted.
//
// WHAT IT DOES NOT PROVE
//   Nothing about deletion. That an anonymised application is actually erased
//   rather than hidden is proved against the live database -- see the stage 8
//   checklist. A test over pure functions cannot establish what a column
//   holds.
// ===========================================================================

import {
  candidateStatusLabel,
  candidateStatusTone,
  candidateStatusHint,
} from "../src/lib/applicationDisplay.js";

let pass = 0, fail = 0;

const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const row = (status, ended) => ({ status, job_has_ended: ended });

console.log("\nthe four labels, on a role that is still open");
t("applied",      candidateStatusLabel(row("applied", false)), "Applied");
t("shortlisted",  candidateStatusLabel(row("shortlisted", false)), "Shortlisted");
t("not_selected", candidateStatusLabel(row("not_selected", false)), "Not selected");
t("withdrawn",    candidateStatusLabel(row("withdrawn", false)), "Withdrawn");

console.log("\n'Closed' is derived from the role, not stored");
t("applied + ended = Closed", candidateStatusLabel(row("applied", true)), "Closed");
t("applied + open  = Applied", candidateStatusLabel(row("applied", false)), "Applied");

console.log("\nPRECEDENCE -- a recruiter's decision outranks the calendar");
t("shortlisted on an ended role still reads Shortlisted, not Closed",
  candidateStatusLabel(row("shortlisted", true)), "Shortlisted");
t("not selected on an ended role still reads Not selected",
  candidateStatusLabel(row("not_selected", true)), "Not selected");
t("withdrawn outranks Closed too",
  candidateStatusLabel(row("withdrawn", true)), "Withdrawn");

console.log("\nunknown and missing values never leak a raw token");
t("an unknown status on an open role",   candidateStatusLabel(row("under_review", false)), "Applied");
t("an unknown status on an ended role",  candidateStatusLabel(row("under_review", true)), "Closed");
t("no status at all",                    candidateStatusLabel({ job_has_ended: false }), "Applied");
t("null row",                            candidateStatusLabel(null), "Applied");
t("undefined row",                       candidateStatusLabel(undefined), "Applied");

console.log("\nthe word 'rejected' appears nowhere, and nor does a column value");
const everything = [
  ...["applied", "shortlisted", "not_selected", "withdrawn", "under_review", null].flatMap((s) =>
    [true, false].flatMap((e) => [candidateStatusLabel(row(s, e)), candidateStatusHint(row(s, e))])
  ),
].join(" ").toLowerCase();
t("no 'reject'",       everything.includes("reject"), false);
t("no 'not_selected'", everything.includes("not_selected"), false);
t("no 'withdrawn' as a raw token with an underscore", everything.includes("_"), false);

console.log("\ntones");
t("shortlisted stands out",        candidateStatusTone(row("shortlisted", false)), "good");
t("a live application is 'new'",   candidateStatusTone(row("applied", false)), "new");
t("closed recedes",                candidateStatusTone(row("applied", true)), "muted");
t("not selected recedes",          candidateStatusTone(row("not_selected", false)), "muted");
t("shortlisted on an ended role keeps the good tone",
  candidateStatusTone(row("shortlisted", true)), "good");

console.log("\nevery state has a hint, and they differ");
const hints = [
  candidateStatusHint(row("applied", false)),
  candidateStatusHint(row("applied", true)),
  candidateStatusHint(row("shortlisted", false)),
  candidateStatusHint(row("not_selected", false)),
  candidateStatusHint(row("withdrawn", false)),
];
t("none is empty",        hints.filter((h) => !h || !h.trim()).length, 0);
t("all five are distinct", new Set(hints).size, 5);
t("the Closed hint says the recruiter did not decide, rather than implying one",
  candidateStatusHint(row("applied", true)).includes("did not mark your application either way"), true);
t("the Applied hint does not promise we will email them",
  /email|notify|inform you/i.test(candidateStatusHint(row("applied", false))), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
