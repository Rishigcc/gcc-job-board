// ===========================================================================
// How an application is described to a recruiter and to a candidate.
//
// Pure: no Supabase import, so it runs in plain Node and every case can be
// enumerated rather than clicked through.
//
// THE ONE RULE THAT MATTERS HERE
//   A raw database value is never shown to anyone. 'not_selected' is a column
//   value; "Not selected" is what a person reads. In particular the word
//   "rejected" appears nowhere in this file and must not be introduced: a
//   candidate may well see their own status in stage 8, and there is no
//   version of that screen where "Rejected" is the right word.
// ===========================================================================

// The three a recruiter can set. 'withdrawn' is deliberately absent -- it is
// the candidate's word about their own application, and belongs to stage 8.
export const RECRUITER_STATUSES = [
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "not_selected", label: "Not selected" },
];

const LABELS = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

export function statusLabel(value) {
  // An unknown value means the enum grew and this map did not. Showing the
  // raw value would leak a database token into the page, so it falls back to
  // the one word that is true of every application.
  return LABELS[value] || "Applied";
}

export function statusTone(value) {
  if (value === "shortlisted") return "good";
  if (value === "not_selected") return "muted";
  if (value === "withdrawn") return "muted";
  return "new";
}

// "19 November 2026". Long form, because these are read one at a time and a
// recruiter deciding whom to call should not have to parse 19/11/26.
export function formatApplicationDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// For the counts line on the jobs list: "3 applications", "1 application".
export function applicationCountLabel(count) {
  if (!count) return "No applications yet";
  return count === 1 ? "1 application" : `${count} applications`;
}

// A breakdown a recruiter can act on, in a fixed order so the line does not
// reshuffle itself as statuses change.
export function summariseStatuses(rows) {
  const counts = { applied: 0, shortlisted: 0, not_selected: 0, withdrawn: 0 };

  for (const row of rows || []) {
    if (counts[row.status] === undefined) counts.applied += 1;
    else counts[row.status] += 1;
  }

  const parts = [];
  if (counts.applied) parts.push(`${counts.applied} new`);
  if (counts.shortlisted) parts.push(`${counts.shortlisted} shortlisted`);
  if (counts.not_selected) parts.push(`${counts.not_selected} not selected`);
  if (counts.withdrawn) parts.push(`${counts.withdrawn} withdrawn`);

  return parts.join(" · ");
}
