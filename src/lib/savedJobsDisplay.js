// ===========================================================================
// Turning a row from public.my_saved_jobs() into what appears on screen.
//
// Pure. It imports nothing but jobOptions (through nothing at all, in fact),
// so it runs in plain Node and is tested by enumerating cases rather than by
// clicking -- see scripts/stage10-saves-test.mjs. Same reason jobDisplay.js
// is kept apart from publicJobs.js.
//
// THE THREE STATES, AND WHY AN UNKNOWN ONE IS TREATED AS THE WORST
//   my_saved_jobs() returns 'open', 'closed' or 'withdrawn'. If a fourth ever
//   appears -- a new jobs.status value, a changed function -- these helpers
//   treat it as withdrawn: no title, no link, nothing from the posting shown.
//   That is the fail-closed direction. The alternative is that a role an
//   admin took down reappears because the classification was extended and
//   this file was not.
// ===========================================================================

export const OPEN = "open";
export const CLOSED = "closed";
export const WITHDRAWN = "withdrawn";

// Is this a role we are willing to repeat the recruiter's words about?
//
// 'closed' is: it was a real posting that ran its course, and someone who
// bookmarked it is entitled to know which role it was. 'withdrawn' is not: we
// removed it, so continuing to display it would undo that.
export function isWithheld(availability) {
  return availability !== OPEN && availability !== CLOSED;
}

export function canApply(availability) {
  return availability === OPEN;
}

// The chip on the card. Open roles get none -- "Open" on every card in a list
// of mostly open roles is noise.
export function availabilityLabel(availability) {
  if (availability === OPEN) return "";
  if (availability === CLOSED) return "No longer open";
  return "No longer available";
}

// Why it is in that state, in the candidate's terms. Never names a database
// value: 'closed', 'hidden' and 'expired' are column values, and stage 9b
// found two places where one had reached the screen.
export function availabilityNote(availability) {
  if (availability === OPEN) return "";
  if (availability === CLOSED) {
    return "This role has been filled, closed by the recruiter, or has passed its closing date.";
  }
  return "This role has been taken down and is no longer on iWorkAtGCC.";
}

// A saved row in the shape GccJobCard already reads, so the card does not
// need to learn a second row format. Returns null for anything withheld --
// the caller must not be able to render a card for one by accident.
export function savedJobToCard(row) {
  if (!row || isWithheld(row.availability)) return null;

  return {
    id: row.job_id,
    slug: row.slug,
    title: row.title,
    city: row.city,
    work_mode: row.work_mode,
    job_function: row.job_function,
    employment_type: row.employment_type,
    experience_min: row.experience_min,
    experience_max: row.experience_max,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    salary_period: row.salary_period,
    skills: row.skills,
    published_at: row.published_at,
    expires_at: row.expires_at,
    companies: { name: row.company_name, logo_url: row.company_logo_url },
  };
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// The line under the heading. It accounts for every saved row, because the
// count on /profile counts rows in job_saves and the two must agree -- a page
// showing three cards under a counter reading five is a bug report.
export function savedSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return "";

  const open = list.filter((r) => r.availability === OPEN).length;
  const closed = list.filter((r) => r.availability === CLOSED).length;
  const gone = list.length - open - closed;

  const parts = [plural(list.length, "saved role", "saved roles")];

  if (open !== list.length) parts.push(`${open} still open`);
  if (closed > 0) parts.push(`${closed} no longer open`);
  if (gone > 0) parts.push(`${gone} no longer available`);

  return parts.join(" · ");
}
