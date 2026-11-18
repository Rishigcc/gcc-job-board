// ===========================================================================
// Turning a job row into the words on screen, and into its URL.
//
// Pure. It imports nothing but jobOptions, which means it runs in plain Node
// and can be tested by enumerating cases rather than by clicking through a
// browser -- see scripts/stage5-display-test.mjs. Keeping it apart from
// publicJobs.js is what makes that possible: that file imports the Supabase
// client, which needs a browser environment to exist at all.
// ===========================================================================

import { slugify } from "./jobOptions";

// ---------------------------------------------------------------------------
// URLs. /gcc-jobs/<slug>-<id>
//
// The id is what resolves the job; the slug is decoration that makes the link
// readable and keeps two roles of the same name apart. jobs.slug is frozen at
// insert (no update grant), so a link shared today still works after the
// title is edited -- but if someone edits the title, the slug in an OLD link
// no longer matches, which is why the detail page redirects to the canonical
// path rather than trusting the slug it was given.
// ---------------------------------------------------------------------------
export function jobPath(job) {
  return `/gcc-jobs/${job.slug || slugify(job.title)}-${job.id}`;
}

export function parseJobParam(param) {
  const match = /^(.*)-(\d+)$/.exec(param || "");
  if (!match) return { id: null, slug: "" };
  return { id: Number(match[2]), slug: match[1] };
}

// ---------------------------------------------------------------------------
// Formatting. All of it pure, so it can be tested without a browser.
// ---------------------------------------------------------------------------

export function formatExperience(min, max) {
  if (min === null || max === null) return null;
  if (min === 0 && max === 0) return "Fresher";
  if (min === max) return `${min} year${min === 1 ? "" : "s"}`;
  return `${min}–${max} years`;
}

export function formatSalary(job) {
  const { salary_min: min, salary_max: max, salary_currency: cur, salary_period: per } = job;

  if (min === null && max === null) return null;
  if (!cur || !per) return null;

  // Indian digit grouping for rupees (18,00,000), Western for dollars.
  const fmt = new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  });

  const period = per === "year" ? "a year" : "a month";

  if (min !== null && max !== null) {
    return min === max
      ? `${fmt.format(min)} ${period}`
      : `${fmt.format(min)} – ${fmt.format(max)} ${period}`;
  }
  if (min !== null) return `From ${fmt.format(min)} ${period}`;
  return `Up to ${fmt.format(max)} ${period}`;
}

export function formatPosted(publishedAt) {
  if (!publishedAt) return "";

  const then = new Date(publishedAt);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);

  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;

  return `Posted ${then.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function formatCloses(expiresAt) {
  if (!expiresAt) return "";

  const end = new Date(expiresAt);
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000);

  if (days < 0) return "This role has closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

// PostgREST puts filter values straight into the query string, where a comma
// or a bracket reads as syntax and * and % are wildcards. None of them mean
// anything in a job search.
export function sanitise(term) {
  return (term || "").replace(/[,()%*"\\]/g, " ").replace(/\s+/g, " ").trim();
}


// ---------------------------------------------------------------------------
// Experience bands.
//
// A band matches a job when the two RANGES OVERLAP, not when the job sits
// inside the band. A role advertised at 3-8 years appears under both "3-5"
// and "6-10", because it is genuinely open to both people. Rishi accepted
// that overlap explicitly: the alternative, matching only on the minimum,
// hides a 3-8 year role from someone with seven years' experience, which is
// the opposite of what a filter is for.
//
// Overlap is `job.min <= band.max AND job.max >= band.min`, which is two
// plain comparisons in the query -- no OR string to escape, and both columns
// are plain ints.
//
// The top band runs to 50 because that is the CHECK constraint's ceiling on
// experience_max in migration 001.
// ---------------------------------------------------------------------------
export const EXPERIENCE_BANDS = [
  { value: "0-2", label: "0–2 years", min: 0, max: 2 },
  { value: "3-5", label: "3–5 years", min: 3, max: 5 },
  { value: "6-10", label: "6–10 years", min: 6, max: 10 },
  { value: "10+", label: "10+ years", min: 10, max: 50 },
];

export function findBand(value) {
  return EXPERIENCE_BANDS.find((b) => b.value === value) || null;
}

export function jobMatchesBand(job, band) {
  if (!band) return true;
  if (job.experience_min === null || job.experience_max === null) return false;
  return job.experience_min <= band.max && job.experience_max >= band.min;
}
