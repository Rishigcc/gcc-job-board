// ===========================================================================
// The fixed lists a job posting is built from.
//
// WHY FIXED AND NOT FREE TEXT
//   Free text produces "Bangalore", "Bengaluru" and "blr" for one city, and
//   then a filter that matches none of them. The existing collated jobs page
//   normalises this after the fact, with a mapping table and some guessing.
//   On data we control at the point of entry, a dropdown is simply correct.
//
// THESE ARE NOT DATABASE CONSTRAINTS
//   `jobs.city` and `jobs.job_function` are plain `text not null` columns with
//   no check constraint, deliberately. Revising either list is an edit to this
//   file and a redeploy -- never a migration. Existing rows keep whatever they
//   were posted with, so removing an entry here does not corrupt old jobs; it
//   only stops new ones using it.
//
//   WORK_MODES, EMPLOYMENT_TYPES, SALARY_CURRENCIES and SALARY_PERIODS are
//   different: those four ARE check constraints in migration 001, so the
//   values below must match the constraint exactly. Changing one of those
//   needs a migration.
// ===========================================================================

// ---------------------------------------------------------------------------
// Job functions.
//
// Built on the 15 the collated jobs page already uses, which have been proven
// against 348 real GCC postings. Keeping the same spine matters: stage 5's
// filter will eventually need to sit over both the collated jobs and the
// directly-posted ones, and two different vocabularies would make that
// impossible.
//
// Three deliberate changes from those 15:
//   * "HR" is spelled out. It reads as a label in a dropdown, not a column
//     heading.
//   * "Procurement" (1 posting) is folded into Supply Chain. One posting does
//     not earn its own filter entry.
//   * "Quality & Compliance" (1 posting) is folded into Risk & Compliance,
//     which already had 37.
//
// Two additions the scraped data could not show, because it is scraped from
// generic job boards rather than from GCCs:
//   * Clinical & Medical Affairs -- pharma GCCs are a real and growing
//     segment in Hyderabad and Bengaluru, and those roles currently have
//     nowhere sensible to go.
//   * Program & Project Management -- very common in GCCs and currently
//     invisible inside "Operations".
//
// Ordered by expected volume, not alphabetically, so the common choice is
// near the top of the list. "Other" is last.
// ---------------------------------------------------------------------------
export const JOB_FUNCTIONS = [
  "IT & Engineering",
  "Data & AI",
  "Operations",
  "Finance & Accounting",
  "Risk & Compliance",
  "Sales & Marketing",
  "Program & Project Management",
  "Cybersecurity",
  "Product",
  "Human Resources",
  "Supply Chain & Procurement",
  "Customer Support",
  "Clinical & Medical Affairs",
  "Legal",
  "Other",
];

// ---------------------------------------------------------------------------
// Cities.
//
// Grouped so the dropdown is scannable rather than a flat list of twenty.
//
// The eight tier-2 locations named in the brief are all present: Coimbatore,
// Indore, Jaipur, Visakhapatnam, Kochi, Bhubaneswar, Chandigarh, Nagpur.
//
// Suburb names are deliberately absent. The collated data contains Thane,
// Navi Mumbai, Pimpri-Chinchwad, Bidadi, Makali and others; every one of them
// is a filter entry that would split a city's results in two. A role in Thane
// is posted as Mumbai, and the description can say Thane.
//
// "Anywhere in India" exists because 46 of the 348 collated postings had no
// city at all. It is a city value, not a work mode -- a role can be
// "Anywhere in India" and onsite (a travelling role), or Bengaluru and
// remote (remote, but you must be able to reach the office). The two
// questions are genuinely separate and the form asks both.
// ---------------------------------------------------------------------------
export const CITY_GROUPS = [
  {
    label: "Major GCC hubs",
    cities: [
      "Bengaluru",
      "Hyderabad",
      "Pune",
      "Chennai",
      "Mumbai",
      "Gurugram",
      "Noida",
      "Delhi",
    ],
  },
  {
    label: "Established locations",
    cities: ["Ahmedabad", "Kolkata", "Thiruvananthapuram", "Mysuru"],
  },
  {
    label: "Emerging locations",
    cities: [
      "Coimbatore",
      "Indore",
      "Jaipur",
      "Visakhapatnam",
      "Kochi",
      "Bhubaneswar",
      "Chandigarh",
      "Nagpur",
    ],
  },
  {
    label: "No fixed location",
    cities: ["Anywhere in India"],
  },
];

// Flat list, for validating a submitted value.
export const CITIES = CITY_GROUPS.flatMap((g) => g.cities);

// ---------------------------------------------------------------------------
// The four lists below mirror CHECK constraints in migration 001. The stored
// value is on the left; the label is only ever shown to a person. Never
// display a raw stored value.
// ---------------------------------------------------------------------------
export const WORK_MODES = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

export const SALARY_CURRENCIES = [
  { value: "INR", label: "₹ INR" },
  { value: "USD", label: "$ USD" },
];

export const SALARY_PERIODS = [
  { value: "year", label: "per year" },
  { value: "month", label: "per month" },
];

// ---------------------------------------------------------------------------
// How a job's status reads to a person.
//
// `status` is one of live / pending / expired / closed / hidden, but "expired"
// is never stored -- it is derived from expires_at at read time, which is why
// no cron job is needed. jobDisplayStatus() is the single place that derives
// it, so the recruiter's table and the public page can never disagree.
//
// Never render a raw status value anywhere.
// ---------------------------------------------------------------------------
export function jobDisplayStatus(job) {
  if (!job) return { key: "unknown", label: "Unknown", tone: "muted" };

  if (job.status === "hidden") {
    return { key: "hidden", label: "Hidden by iWorkAtGCC", tone: "risk" };
  }
  if (job.status === "pending") {
    return { key: "pending", label: "Awaiting review", tone: "wait" };
  }
  if (job.status === "closed") {
    return { key: "closed", label: "Closed", tone: "muted" };
  }
  if (job.status === "live" && new Date(job.expires_at) <= new Date()) {
    return { key: "expired", label: "Expired", tone: "muted" };
  }
  if (job.status === "live") {
    return { key: "live", label: "Live", tone: "good" };
  }
  return { key: job.status, label: "Not live", tone: "muted" };
}

// Does this job count against the 10-live-roles cap? Mirrors
// private.recruiter_live_job_count: live AND not yet expired.
export function countsTowardCap(job) {
  return job.status === "live" && new Date(job.expires_at) > new Date();
}

// ---------------------------------------------------------------------------
// Slugs.
//
// Must satisfy the database's own check: ^[a-z0-9]+(-[a-z0-9]+)*$
// A job slug need not be unique -- the public URL is /gcc-jobs/<slug>-<id>,
// and the id disambiguates. A COMPANY slug must be unique; the caller handles
// that collision.
// ---------------------------------------------------------------------------
export function slugify(input) {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

// Skills are stored as text[]. A comma-separated input is what recruiters
// expect, and 20 is a cap on the stored array rather than a database rule.
export function splitSkills(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export const DAYS_LIVE = 30;
