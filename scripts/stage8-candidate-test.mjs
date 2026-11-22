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

import { clearResumeFolder } from "../api/_lib/resumeStorage.js";
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

// ---------------------------------------------------------------------------
// clearResumeFolder -- "deletion means the folder is empty".
//
// Worth testing with a fake client because the cases that matter are the ones
// production will not show you on demand: a second page of results, an
// orphan with no row, and a listing entry that is not a plain filename. The
// real thing only ever holds one or two files, so none of those would ever
// come up while clicking.
// ---------------------------------------------------------------------------
const UID = "ddd2be0b-f8d9-4753-8005-87424c795329";

// `pages` is what list() returns in sequence; `removed` records what the
// helper asked to delete.
const fakeAdmin = (pages, { listError = null, removeError = null } = {}) => {
  const calls = { list: [], remove: [] };
  return {
    calls,
    storage: {
      from: () => ({
        list: async (folder, opts) => {
          calls.list.push({ folder, ...opts });
          if (listError) return { data: null, error: listError };
          const index = calls.list.length - 1;
          return { data: pages[index] || [], error: null };
        },
        remove: async (paths) => {
          calls.remove.push(paths);
          return { error: removeError };
        },
      }),
    },
  };
};

const file = (name) => ({ id: name, name, metadata: { size: 1 } });

console.log("\nclearResumeFolder");

{
  const admin = fakeAdmin([[]]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("an empty folder removes nothing", r.removed, []);
  t("and does not call remove at all", admin.calls.remove.length, 0);
}

{
  const admin = fakeAdmin([[file("a.pdf")]]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("one file is prefixed with the folder", r.removed, [`${UID}/a.pdf`]);
}

{
  // The case the whole change exists for: the row names one file, three are
  // there. Deleting by row name would leave two behind.
  const admin = fakeAdmin([[file("a.pdf"), file("b.pdf"), file("c.pdf")]]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("orphans are removed too, not just the named file", r.removed.length, 3);
  t("all of them in one remove call", admin.calls.remove.length, 1);
}

{
  const admin = fakeAdmin([[{ id: null, name: "nested", metadata: null }, file("a.pdf")]]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("a prefix placeholder is skipped, a real object is not", r.removed, [`${UID}/a.pdf`]);
}

{
  const admin = fakeAdmin([[file("../escape.pdf"), file("sub/deep.pdf"), file("ok.pdf")]]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("a name containing a slash is refused, however it is spelled",
    r.removed, [`${UID}/ok.pdf`]);
}

{
  const full = Array.from({ length: 100 }, (_, i) => file(`f${i}.pdf`));
  const admin = fakeAdmin([full, [file("last.pdf")]]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("a full page is followed by another request", admin.calls.list.length, 2);
  t("and every object across both pages is removed", r.removed.length, 101);
  t("the second request is offset by one page", admin.calls.list[1].offset, 100);
}

{
  const full = Array.from({ length: 100 }, (_, i) => file(`f${i}.pdf`));
  const admin = fakeAdmin([full, full.slice(0, 99)]);
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("a short page ends the loop", admin.calls.list.length, 2);
  t("199 objects", r.removed.length, 199);
}

{
  const admin = fakeAdmin([[]], { listError: { message: "network" } });
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("a listing failure is reported, not swallowed", r.error?.message, "network");
  t("and nothing is removed", admin.calls.remove.length, 0);
}

{
  const admin = fakeAdmin([[file("a.pdf")]], { removeError: { message: "denied" } });
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("a removal failure is reported", r.error?.message, "denied");
  t("and no 'removed' list is returned", r.removed, undefined);
}

{
  // Nothing legitimate reaches this, but an endless loop against storage is
  // a worse failure than an incomplete delete that logs.
  const page = Array.from({ length: 100 }, (_, i) => file(`f${i}.pdf`));
  const admin = fakeAdmin(Array.from({ length: 200 }, () => page));
  const r = await clearResumeFolder(admin, "resumes", UID);
  t("pagination is capped rather than unbounded", admin.calls.list.length, 100);
  t("and it still returns a result", Array.isArray(r.removed), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
