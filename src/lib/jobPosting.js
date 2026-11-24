// ===========================================================================
// JobPosting structured data.
//
// Pure. It imports jobOptions for labels and nothing else, so it runs in
// plain Node and is tested by enumerating cases rather than by submitting
// pages to Google -- see scripts/stage10-seo-test.mjs. That matters more here
// than anywhere else in the project, because the feedback loop on structured
// data is measured in days and the failure mode is silent.
//
// EVERYTHING HERE COMES FROM GOOGLE'S JOB POSTING SPEC, READ 23 Nov 2026.
// The rules this file is built around, in Google's own terms:
//
//   REQUIRED      datePosted, description, hiringOrganization, jobLocation,
//                 title. All five, or the page should carry no markup at all.
//
//   description   must be HTML, must be COMPLETE -- "We don't allow job
//                 postings with incomplete job descriptions" -- and must not
//                 be the same as the title.
//
//   jobLocation   a Place with a PostalAddress. Only addressCountry is stated
//                 as a must. Not required if applicantLocationRequirements is
//                 present instead.
//
//   remote        jobLocationType: TELECOMMUTE if the role is 100% remote,
//                 AND the description must clearly say so.
//                 applicantLocationRequirements is needed for a remote role.
//
//   employmentType  the values are CASE-SENSITIVE: FULL_TIME, PART_TIME,
//                 CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, PER_DIEM, OTHER.
//
//   visibility    "all information in the markup must be visible on the job
//                 page." This is the rule that decides most of what is NOT
//                 here -- see below.
//
// WHAT IS DELIBERATELY ABSENT, AND WHY
//
//   directApply   Rishi's decision, 23 Nov 2026: omitted. Our flow has a
//                 sign-in in the middle, and the spec says it is not direct
//                 apply if the user must sign in. Claiming it would be false.
//
//   identifier    Recommended by Google, and omitted anyway. Our job id is
//                 not shown anywhere on the page, and the visibility rule is
//                 unqualified. A recommended property is not worth breaking a
//                 stated requirement for.
//
//   occupationalCategory
//                 expects an O*NET-SOC code. jobs.job_function is our own
//                 vocabulary ("Finance & Accounting"), not that, so putting
//                 it there would be asserting something untrue in a field
//                 with a defined meaning.
//
//   TELECOMMUTE for work_mode = 'remote' with a named city
//                 Rishi's decision, 23 Nov 2026: TELECOMMUTE is set only for
//                 "Anywhere in India". A role tagged remote against a named
//                 city is not reliably 100% remote, and the spec couples
//                 TELECOMMUTE to the description saying so -- which stage 4
//                 does not yet ask recruiters for. That upgrade is carried
//                 item 19, to be decided separately.
// ===========================================================================

import { EMPLOYMENT_TYPES, WORK_MODES } from "./jobOptions.js";

// The city value that means "no particular city", from jobOptions.
export const ANYWHERE_IN_INDIA = "Anywhere in India";

// Google's vocabulary, not ours. The case matters and the spec says so.
const EMPLOYMENT_TYPE_MAP = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

const SALARY_UNIT = {
  year: "YEAR",
  month: "MONTH",
};

// ---------------------------------------------------------------------------
// description has to be HTML, and ours is plain text a recruiter typed.
//
// Escaping first and marking up second is the only safe order. The other way
// round would escape the <p> tags we had just added, and a description
// containing "<script>" has to come out as text either way.
// ---------------------------------------------------------------------------
export function descriptionToHtml(text) {
  if (typeof text !== "string") return "";

  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // A blank line is a paragraph break; a single newline is a line break
  // inside one. That matches how the detail page renders it with
  // whitespace-pre-wrap, which is what the visibility rule requires: the
  // markup must say what the page shows, not a tidier version of it.
  return escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Can this role be marked up at all?
//
// Returns a list of reasons it cannot. An empty list means yes.
//
// THIS EXISTS SO THE PAGE CAN EMIT NOTHING RATHER THAN SOMETHING WRONG.
// Incomplete structured data is worse than none: Google's own wording is that
// it does not allow postings with incomplete descriptions, and a site that
// submits invalid markup repeatedly is a site it learns to distrust. So a
// role that cannot produce all five required properties gets a job page with
// no script tag on it, and the page still works for a human.
// ---------------------------------------------------------------------------
export function markupBlockers(job, company) {
  const reasons = [];

  if (!job) return ["there is no role"];

  const title = typeof job.title === "string" ? job.title.trim() : "";
  const description =
    typeof job.description === "string" ? job.description.trim() : "";

  if (!title) reasons.push("title is empty");
  if (!description) reasons.push("description is empty");

  // Google states this one explicitly. It cannot happen while the form
  // enforces a minimum, which is exactly why it is worth asserting: the
  // check outlives the form.
  if (title && description && title === description) {
    reasons.push("description is the same as the title");
  }

  if (!job.published_at) reasons.push("datePosted is missing");

  if (typeof company !== "string" || !company.trim()) {
    reasons.push("hiringOrganization is missing");
  }

  // jobLocation OR applicantLocationRequirements. The second only exists for
  // a role with no particular city, so in practice this is "we know where".
  const city = typeof job.city === "string" ? job.city.trim() : "";
  if (!city) reasons.push("jobLocation is missing");

  return reasons;
}

export function isMarkupEligible(job, company) {
  return markupBlockers(job, company).length === 0;
}

// A date column to the date-only string Google asks for. Returns null rather
// than "Invalid Date" for anything unparseable, so a bad value drops the
// property instead of poisoning it.
export function isoDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The object itself.
//
// Returns null when the role is not eligible. A caller that forgets to check
// still cannot emit broken markup.
// ---------------------------------------------------------------------------
export function buildJobPosting(job, { company } = {}) {
  if (!isMarkupEligible(job, company)) return null;

  const city = job.city.trim();
  const remoteAnywhere = city === ANYWHERE_IN_INDIA;

  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title.trim(),
    description: descriptionToHtml(job.description),
    datePosted: isoDate(job.published_at),
    hiringOrganization: {
      "@type": "Organization",
      name: company.trim(),
    },
  };

  // validThrough is how a role leaves Google's index politely, before the
  // 404 does it bluntly. Both are allowed; having the date means a crawler
  // that has not come back yet already knows.
  const validThrough = isoDate(job.expires_at);
  if (validThrough) posting.validThrough = validThrough;

  if (remoteAnywhere) {
    // The spec: jobLocation is not required when applicantLocationRequirements
    // is present, and TELECOMMUTE is for a role that is 100% remote. "Anywhere
    // in India" is the only value of ours that means exactly that.
    posting.jobLocationType = "TELECOMMUTE";
    posting.applicantLocationRequirements = {
      "@type": "Country",
      name: "India",
    };
  } else {
    posting.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        addressCountry: "IN",
      },
    };
  }

  const employmentType = EMPLOYMENT_TYPE_MAP[job.employment_type];
  if (employmentType) posting.employmentType = employmentType;

  // Salary only when the recruiter disclosed it, because it is only ON THE
  // PAGE when they disclosed it. The page prints "Not disclosed" otherwise,
  // and inventing a number for the markup would break the visibility rule in
  // the most consequential field there is.
  const unit = SALARY_UNIT[job.salary_period];
  const hasSalary =
    unit &&
    job.salary_currency &&
    (Number.isFinite(job.salary_min) || Number.isFinite(job.salary_max));

  if (hasSalary) {
    const value = { "@type": "QuantitativeValue", unitText: unit };

    if (Number.isFinite(job.salary_min)) value.minValue = job.salary_min;
    if (Number.isFinite(job.salary_max)) value.maxValue = job.salary_max;

    posting.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary_currency,
      value,
    };
  }

  // Experience, in months, because that is the unit the property is defined
  // in. Only when a minimum was actually stated: experience_min of 0 is "no
  // experience required", which is information, but monthsOfExperience: 0
  // reads as a mistake rather than as a statement.
  if (Number.isFinite(job.experience_min) && job.experience_min > 0) {
    posting.experienceRequirements = {
      "@type": "OccupationalExperienceRequirements",
      monthsOfExperience: job.experience_min * 12,
    };
  }

  // Both of these are on the page, so both are allowed to be in the markup.
  if (Array.isArray(job.skills) && job.skills.length > 0) {
    posting.skills = job.skills.join(", ");
  }

  if (Number.isFinite(job.openings) && job.openings > 0) {
    posting.totalJobOpenings = job.openings;
  }

  return posting;
}

// ---------------------------------------------------------------------------
// Into a <script> tag.
//
// `<` IS ESCAPED, AND THAT IS NOT OPTIONAL. JSON goes inside a script
// element, where the HTML parser is still looking for "</script" -- so a
// recruiter whose description contains "</script>" would otherwise end the
// element early and have the rest of their text parsed as markup. Escaping
// every "<" as < is still valid JSON and cannot close anything.
// ---------------------------------------------------------------------------
export function jobPostingScript(posting) {
  if (!posting) return "";

  const json = JSON.stringify(posting).replace(/</g, "\\u003c");

  return `<script type="application/ld+json">${json}</script>`;
}

// Convenience for the renderer: role in, script tag out, "" when ineligible.
export function jobPostingScriptFor(job, options) {
  return jobPostingScript(buildJobPosting(job, options));
}

// Exported for the test, so the mapping is asserted against the real option
// list rather than against a copy of it.
export function employmentTypeCoverage() {
  return EMPLOYMENT_TYPES.map((t) => ({
    value: t.value,
    mapped: EMPLOYMENT_TYPE_MAP[t.value] || null,
  }));
}

export function workModeValues() {
  return WORK_MODES.map((m) => m.value);
}
