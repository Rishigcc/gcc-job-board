// ===========================================================================
// Stage 10, round two -- the JobPosting markup.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage10-seo-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t10b.mjs && node /tmp/t10b.mjs
//
// WHY THIS IS THE MOST WORTH TESTING OF ANYTHING IN THE PROJECT
//   Every other mistake in this codebase announces itself. A recruiter sees a
//   502, a candidate sees the wrong count, a check raises. Structured data
//   does none of that: wrong markup renders a perfectly normal-looking page,
//   and the only symptom is that roles quietly do not appear in Google's job
//   results. The feedback loop is days long and arrives as an absence.
//
//   So the rules are asserted here, against Google's spec as read on
//   23 Nov 2026, rather than trusted to review.
//
// THE PROPERTIES IT HOLDS TO
//   1. All five required properties are present, or NOTHING is emitted.
//      Incomplete markup is worse than none.
//   2. Nothing appears in the markup that is not visible on the page --
//      so no invented salary, no job id, no job_function in a field that
//      means something else.
//   3. employmentType uses Google's case-sensitive vocabulary, and every
//      value our own form can produce is mapped.
//   4. TELECOMMUTE appears for "Anywhere in India" and for nothing else,
//      which is Rishi's decision of 23 Nov 2026.
//   5. A description cannot break out of the script element. This is the one
//      that is a security property and not just a correctness one.
//
// WHAT IT DOES NOT PROVE
//   That Google accepts it. Only the Rich Results Test can say that, and it
//   needs a public URL -- which is why it sits in the launch checklist as a
//   post-merge item and not in this file.
// ===========================================================================

import {
  ANYWHERE_IN_INDIA,
  buildJobPosting,
  descriptionToHtml,
  employmentTypeCoverage,
  isMarkupEligible,
  isoDate,
  jobPostingScript,
  jobPostingScriptFor,
  markupBlockers,
  workModeValues,
} from "../src/lib/jobPosting.js";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else
    failures.push(
      `${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
}

const T = (name, actual) => check(name, actual, true);
const F = (name, actual) => check(name, actual, false);

const DESCRIPTION =
  "You will own the monthly close for two European entities, working with " +
  "the controllership team in Bengaluru.\n\nWe are looking for a qualified " +
  "accountant with four or more years in a shared services or GCC " +
  "environment, strong SAP FICO, and the confidence to challenge a number " +
  "that looks wrong.\n\nThe team is eleven people and reports to the " +
  "Finance Director in Amsterdam.";

function job(overrides = {}) {
  return {
    id: 15,
    title: "Senior Financial Analyst",
    slug: "senior-financial-analyst",
    description: DESCRIPTION,
    city: "Bengaluru",
    work_mode: "hybrid",
    job_function: "Finance & Accounting",
    employment_type: "full_time",
    experience_min: 4,
    experience_max: 8,
    salary_min: 1800000,
    salary_max: 2600000,
    salary_currency: "INR",
    salary_period: "year",
    skills: ["SAP FICO", "IFRS", "Power BI"],
    openings: 2,
    published_at: "2026-11-17T11:16:23Z",
    expires_at: "2026-12-17T11:16:23Z",
    ...overrides,
  };
}

const COMPANY = "Northwind GCC India";
const opts = { company: COMPANY };

// ---------------------------------------------------------------------------
// 1. The five required properties, and refusing to emit without them
// ---------------------------------------------------------------------------
check("a complete role has no blockers", markupBlockers(job(), COMPANY), []);
T("a complete role is eligible", isMarkupEligible(job(), COMPANY));

const full = buildJobPosting(job(), opts);

for (const required of [
  "title",
  "description",
  "datePosted",
  "hiringOrganization",
  "jobLocation",
]) {
  T(`required property ${required} is present`, full[required] !== undefined);
}

check("@type is JobPosting", full["@type"], "JobPosting");
check("@context is schema.org", full["@context"], "https://schema.org");

// Each required property missing in turn must block, and must produce NOTHING.
const blockingCases = [
  ["title", { title: "" }, "title is empty"],
  ["title whitespace only", { title: "   " }, "title is empty"],
  ["description", { description: "" }, "description is empty"],
  ["datePosted", { published_at: null }, "datePosted is missing"],
  ["jobLocation", { city: "" }, "jobLocation is missing"],
];

for (const [label, override, reason] of blockingCases) {
  const bad = job(override);
  T(`${label} missing is a blocker`, markupBlockers(bad, COMPANY).includes(reason));
  F(`${label} missing is not eligible`, isMarkupEligible(bad, COMPANY));
  check(`${label} missing emits no object`, buildJobPosting(bad, opts), null);
  check(`${label} missing emits no script`, jobPostingScriptFor(bad, opts), "");
}

// hiringOrganization comes from outside the row, so it is tested separately.
for (const bad of ["", "   ", null, undefined, 42]) {
  T(
    `hiringOrganization ${JSON.stringify(bad)} is a blocker`,
    markupBlockers(job(), bad).includes("hiringOrganization is missing")
  );
  check(
    `hiringOrganization ${JSON.stringify(bad)} emits nothing`,
    buildJobPosting(job(), { company: bad }),
    null
  );
}

// Google states this one in so many words.
const echo = job({ title: "Analyst", description: "Analyst" });
T(
  "description equal to title is a blocker",
  markupBlockers(echo, COMPANY).includes("description is the same as the title")
);
check("description equal to title emits nothing", buildJobPosting(echo, opts), null);

check("no role at all is a blocker", markupBlockers(null, COMPANY), ["there is no role"]);
check("no role emits nothing", buildJobPosting(null, opts), null);

// ---------------------------------------------------------------------------
// 2. Nothing in the markup that is not on the page
// ---------------------------------------------------------------------------
const undisclosed = buildJobPosting(
  job({ salary_min: null, salary_max: null, salary_currency: null, salary_period: null }),
  opts
);

check("no salary disclosed means no baseSalary", undisclosed.baseSalary, undefined);

// Half a salary is still a salary, and the page prints it.
const minOnly = buildJobPosting(job({ salary_max: null }), opts);
check("a minimum alone is published", minOnly.baseSalary.value, {
  "@type": "QuantitativeValue",
  unitText: "YEAR",
  minValue: 1800000,
});

// Units without a currency cannot be published: the figure would be meaningless.
check(
  "a figure with no currency is not published",
  buildJobPosting(job({ salary_currency: null }), opts).baseSalary,
  undefined
);
check(
  "a figure with no period is not published",
  buildJobPosting(job({ salary_period: null }), opts).baseSalary,
  undefined
);

check("monthly salaries use MONTH", buildJobPosting(job({ salary_period: "month" }), opts).baseSalary.value.unitText, "MONTH");

// The three things deliberately absent.
check("no directApply claim", full.directApply, undefined);
check("no identifier, which is not on the page", full.identifier, undefined);
check("no occupationalCategory from our own vocabulary", full.occupationalCategory, undefined);

// The job_function value must not appear anywhere in the object at all.
F(
  "job_function is nowhere in the markup",
  JSON.stringify(full).includes("Finance & Accounting")
);

// Experience: years in, months out, and nothing at all for zero.
check("experience is published in months", full.experienceRequirements, {
  "@type": "OccupationalExperienceRequirements",
  monthsOfExperience: 48,
});
check(
  "no experience required publishes nothing",
  buildJobPosting(job({ experience_min: 0 }), opts).experienceRequirements,
  undefined
);

check("skills are published as text", full.skills, "SAP FICO, IFRS, Power BI");
check(
  "no skills publishes nothing",
  buildJobPosting(job({ skills: [] }), opts).skills,
  undefined
);

check("openings are published", full.totalJobOpenings, 2);
check(
  "no openings publishes nothing",
  buildJobPosting(job({ openings: null }), opts).totalJobOpenings,
  undefined
);

// ---------------------------------------------------------------------------
// 3. employmentType -- Google's vocabulary, and full coverage of ours
// ---------------------------------------------------------------------------
const GOOGLE_TYPES = [
  "FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY",
  "INTERN", "VOLUNTEER", "PER_DIEM", "OTHER",
];

// Asserted against the real option list, so adding a type to the posting form
// without mapping it here FAILS rather than silently dropping the property.
for (const { value, mapped } of employmentTypeCoverage()) {
  T(`employment type ${value} is mapped`, mapped !== null);
  T(`${value} maps into Google's vocabulary`, GOOGLE_TYPES.includes(mapped));

  const built = buildJobPosting(job({ employment_type: value }), opts);
  check(`${value} is published as ${mapped}`, built.employmentType, mapped);
}

check("full_time is FULL_TIME, in that exact case", full.employmentType, "FULL_TIME");
check(
  "contract is CONTRACTOR, not CONTRACT",
  buildJobPosting(job({ employment_type: "contract" }), opts).employmentType,
  "CONTRACTOR"
);
check(
  "internship is INTERN, not INTERNSHIP",
  buildJobPosting(job({ employment_type: "internship" }), opts).employmentType,
  "INTERN"
);

// An unmapped value drops the property rather than inventing one.
check(
  "an unknown employment type publishes no employmentType",
  buildJobPosting(job({ employment_type: "freelance" }), opts).employmentType,
  undefined
);

// ---------------------------------------------------------------------------
// 4. Location, and TELECOMMUTE only where it is true
// ---------------------------------------------------------------------------
check("a city becomes a Place with a PostalAddress", full.jobLocation, {
  "@type": "Place",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Bengaluru",
    addressCountry: "IN",
  },
});

check("addressCountry is always IN", full.jobLocation.address.addressCountry, "IN");
check("a located role is not TELECOMMUTE", full.jobLocationType, undefined);
check(
  "a located role states no applicantLocationRequirements",
  full.applicantLocationRequirements,
  undefined
);

// Rishi's decision: every work mode against a named city stays located.
for (const mode of workModeValues()) {
  const built = buildJobPosting(job({ work_mode: mode }), opts);
  check(`work mode ${mode} with a named city is not TELECOMMUTE`, built.jobLocationType, undefined);
  T(`work mode ${mode} with a named city has a jobLocation`, Boolean(built.jobLocation));
}

// Including remote, which is the one that would be tempting to treat as
// TELECOMMUTE and which the spec couples to the description saying so.
check(
  "remote against a named city is still located",
  buildJobPosting(job({ work_mode: "remote" }), opts).jobLocationType,
  undefined
);

const anywhere = buildJobPosting(
  job({ city: ANYWHERE_IN_INDIA, work_mode: "remote" }),
  opts
);

check("Anywhere in India is TELECOMMUTE", anywhere.jobLocationType, "TELECOMMUTE");
check("Anywhere in India states the country instead", anywhere.applicantLocationRequirements, {
  "@type": "Country",
  name: "India",
});
check(
  "Anywhere in India omits jobLocation, which the spec allows",
  anywhere.jobLocation,
  undefined
);

// And it must still be eligible -- the blocker list treats the city as the
// location, so this is the case where that reasoning has to hold up.
T("Anywhere in India is eligible", isMarkupEligible(job({ city: ANYWHERE_IN_INDIA }), COMPANY));

// Even for an onsite role, which is a contradiction a recruiter could enter.
// The city is what we publish on, so the city is what decides.
check(
  "Anywhere in India is TELECOMMUTE whatever the work mode says",
  buildJobPosting(job({ city: ANYWHERE_IN_INDIA, work_mode: "onsite" }), opts).jobLocationType,
  "TELECOMMUTE"
);

// ---------------------------------------------------------------------------
// 5. Dates
// ---------------------------------------------------------------------------
check("datePosted is date-only", full.datePosted, "2026-11-17");
check("validThrough is date-only", full.validThrough, "2026-12-17");
check("isoDate on a bad value is null", isoDate("not a date"), null);
check("isoDate on null is null", isoDate(null), null);
check(
  "an unparseable expiry drops validThrough rather than poisoning it",
  buildJobPosting(job({ expires_at: "soon" }), opts).validThrough,
  undefined
);

// ---------------------------------------------------------------------------
// 6. description -> HTML, and the script element it has to survive
// ---------------------------------------------------------------------------
check("a blank line becomes a paragraph", descriptionToHtml("one\n\ntwo"), "<p>one</p><p>two</p>");
check("a single newline becomes a break", descriptionToHtml("one\ntwo"), "<p>one<br>two</p>");
check("three blank lines are still one break", descriptionToHtml("one\n\n\n\ntwo"), "<p>one</p><p>two</p>");
check("empty text is empty", descriptionToHtml(""), "");
check("a non-string is empty", descriptionToHtml(null), "");

check("ampersands are escaped", descriptionToHtml("Tom & Jerry"), "<p>Tom &amp; Jerry</p>");
check("angle brackets are escaped", descriptionToHtml("a < b > c"), "<p>a &lt; b &gt; c</p>");

// Escaping has to happen BEFORE the markup is added, or the <p> and <br>
// tags we just wrote would be escaped too.
check(
  "our own tags survive escaping",
  descriptionToHtml("one\n\n<b>two</b>"),
  "<p>one</p><p>&lt;b&gt;two&lt;/b&gt;</p>"
);

// THE SECURITY PROPERTY. A description containing a closing script tag must
// not be able to end the element. The HTML parser looks for the literal
// "</script" inside a script element, so the JSON must not contain one.
const hostile = job({
  description:
    "Great role.\n\n</script><img src=x onerror=alert(1)>\n\nApply now, and " +
    "bring four years of relevant experience with you to the interview.",
});

const hostileScript = jobPostingScriptFor(hostile, opts);

F("a closing script tag cannot appear in the output", hostileScript.toLowerCase().includes("</script><img"));
check("there is exactly one closing script tag", hostileScript.split("</script>").length - 1, 1);
T("the output still ends with the closing tag", hostileScript.endsWith("</script>"));
F("no raw < survives inside the JSON", hostileScript.slice(0, -"</script>".length).includes("<img"));
T("the < is escaped as \\u003c", hostileScript.includes("\\u003c"));

// It must still be valid JSON, and still say what it was supposed to say.
const inner = hostileScript
  .replace(/^<script type="application\/ld\+json">/, "")
  .replace(/<\/script>$/, "");

let reparsed = null;
try {
  reparsed = JSON.parse(inner);
} catch {
  reparsed = null;
}

T("the escaped output is still valid JSON", reparsed !== null);
check("and still carries the title", reparsed?.title, "Senior Financial Analyst");
T("and the hostile text is present as text", reparsed?.description.includes("&lt;img"));

// A single quote and a non-Latin character, because a description is typed by
// a person and India is not an ASCII country.
const unicode = job({ description: "It's a ₹25L role.\n\n" + DESCRIPTION });
const unicodeScript = jobPostingScriptFor(unicode, opts);
T("a rupee sign survives", unicodeScript.includes("₹25L"));
T("an apostrophe survives", unicodeScript.includes("It's"));

// ---------------------------------------------------------------------------
// 7. The script wrapper
// ---------------------------------------------------------------------------
check("a null posting is an empty string, not an empty tag", jobPostingScript(null), "");
T("the tag declares the right type", jobPostingScriptFor(job(), opts).startsWith('<script type="application/ld+json">'));

// Exactly one posting per script, because the spec is one job per page.
check("one @type in the output", (jobPostingScriptFor(job(), opts).match(/"@type":"JobPosting"/g) || []).length, 1);

// ---------------------------------------------------------------------------

console.log(`\nStage 10 SEO test: ${passed} passed, ${failures.length} failed`);

if (failures.length > 0) {
  console.log("\nFAILURES:\n");
  for (const f of failures) console.log(`  ${f}\n`);
  process.exit(1);
}

console.log("All good.\n");
