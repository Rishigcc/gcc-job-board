// Non-component exports kept out of AdminShared.jsx: the eslint rule
// react-refresh/only-export-components is right that mixing constants and
// components in one file breaks fast refresh for every component in it.

export const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function shortDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Audit actions, as a person reads them.
//
// Here rather than in the component so the one rule that matters can be
// tested: a raw database value must never reach the page. 'job_hidden' is a
// column value; "Hid a role" is what a person reads. An unknown action means
// the CHECK constraint grew and this map did not, so it falls back rather
// than printing the token.
// ---------------------------------------------------------------------------
export const AUDIT_ACTION_LABELS = {
  recruiter_verified: "Verified a recruiter",
  recruiter_unverified: "Removed verification",
  recruiter_suspended: "Suspended a recruiter",
  recruiter_unsuspended: "Unsuspended a recruiter",
  job_hidden: "Hid a role",
  job_unhidden: "Unhid a role",
  company_renamed: "Renamed a company",
  orphan_file_deleted: "Deleted an orphaned file",
  candidate_data_anonymised: "Anonymised a candidate's data",
  retention_purge: "Retention purge",
};

export function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || "Admin action";
}
