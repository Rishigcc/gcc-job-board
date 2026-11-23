// ===========================================================================
// Stage 9 -- how an admin action is described.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage9-admin-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t9.mjs && node /tmp/t9.mjs
//
// WHY THIS IS WORTH TESTING
//   The audit log is read at the worst possible moment -- straight after a
//   mistake. A raw column value in it ('job_hidden', 'candidate_data_
//   anonymised') is exactly the kind of thing that is fine while you still
//   remember writing it and useless six months later.
//
//   Every action in the database's CHECK constraint must have a label. A
//   missing one is silent: the row still renders, just with a fallback, and
//   nobody notices until they are looking for the entry that explains what
//   happened. So the list is asserted against the constraint rather than
//   eyeballed.
//
// WHAT IT DOES NOT PROVE
//   Nothing about authorisation. That a non-admin cannot call these functions
//   is proved against the live database -- see the stage 9 checklist.
// ===========================================================================

import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  shortDate,
} from "../src/lib/adminFormat.js";

let pass = 0, fail = 0;

const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// Copied from the CHECK constraint in migration 014. If the two ever diverge,
// the first test below fails rather than a row rendering as "Admin action"
// and nobody noticing.
const ACTIONS_IN_THE_CONSTRAINT = [
  "recruiter_verified", "recruiter_unverified",
  "recruiter_suspended", "recruiter_unsuspended",
  "job_hidden", "job_unhidden",
  "company_renamed",
  "orphan_file_deleted",
  "candidate_data_anonymised",
  "retention_purge",
];

console.log("\nevery action the database allows has a label");
t("the label map covers the constraint exactly",
  Object.keys(AUDIT_ACTION_LABELS).sort(), [...ACTIONS_IN_THE_CONSTRAINT].sort());

for (const action of ACTIONS_IN_THE_CONSTRAINT) {
  t(`${action} has a real label`,
    auditActionLabel(action) !== "Admin action" && auditActionLabel(action).length > 3, true);
}

console.log("\nno raw database value reaches the page");
const everyLabel = Object.values(AUDIT_ACTION_LABELS).join(" ");
t("no label contains an underscore", everyLabel.includes("_"), false);
t("no label is just the action name",
  ACTIONS_IN_THE_CONSTRAINT.some((a) => everyLabel.includes(a)), false);
t("the word 'rejected' appears nowhere", /reject/i.test(everyLabel), false);

console.log("\nunknown and missing actions fall back rather than leaking");
t("an action added to the constraint but not the map",
  auditActionLabel("recruiter_deleted"), "Admin action");
t("null",      auditActionLabel(null), "Admin action");
t("undefined", auditActionLabel(undefined), "Admin action");
t("empty",     auditActionLabel(""), "Admin action");

console.log("\nthe two actions a person most needs to tell apart read differently");
t("verified and unverified are not the same sentence",
  auditActionLabel("recruiter_verified") === auditActionLabel("recruiter_unverified"), false);
t("suspended and unsuspended are not the same sentence",
  auditActionLabel("recruiter_suspended") === auditActionLabel("recruiter_unsuspended"), false);
t("hidden and unhidden are not the same sentence",
  auditActionLabel("job_hidden") === auditActionLabel("job_unhidden"), false);
t("all ten labels are distinct",
  new Set(Object.values(AUDIT_ACTION_LABELS)).size, 10);

console.log("\ndates -- an audit row with a broken timestamp must still render");
t("null",            shortDate(null), "—");
t("undefined",       shortDate(undefined), "—");
t("empty string",    shortDate(""), "—");
t("nonsense never renders 'Invalid Date'", shortDate("not a date"), "—");
t("a real timestamp renders",
  shortDate("2026-11-23T06:09:30Z").includes("Nov"), true);
t("and carries a time, because two actions a minute apart are different events",
  /\d{1,2}:\d{2}/.test(shortDate("2026-11-23T06:09:30Z")), true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
