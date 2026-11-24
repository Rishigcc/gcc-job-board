// ===========================================================================
// The shape of the posting form, and the rules it enforces.
//
// Lives apart from JobForm.jsx so that file exports only a component: Vite's
// fast refresh cannot work on a module that mixes components with constants.
//
// Every rule here mirrors a CHECK constraint or a column grant from migration
// 001_job_board_foundation.sql. The database stays the enforcement; this is
// what turns a constraint name into a sentence. If a constraint changes, this
// file changes with it.
// ===========================================================================

import { CITIES, JOB_FUNCTIONS, companySlug, splitSkills } from "./jobOptions";

export const EMPTY_JOB = {
  title: "",
  // The hiring company is three fields, not one. `company_name` is what was
  // typed or chosen; `company_id` is set only by picking an existing row; and
  // `company_is_new` is set only by explicitly asking for a new one. A name
  // with neither of the other two is an unconfirmed name, and the form will
  // not submit on it -- see CompanyPicker.jsx for why that matters.
  company_name: "",
  company_id: "",
  company_is_new: false,
  city: "",
  work_mode: "",
  job_function: "",
  employment_type: "full_time",
  experience_min: "",
  experience_max: "",
  description: "",
  // Fixed. The external-apply option was removed from the form; these two
  // stay here, and in the schema, only so that bringing it back is a form
  // change rather than a migration.
  apply_mode: "in_platform",
  external_url: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "INR",
  salary_period: "year",
  openings: "",
  skills: "",
};

export const DESCRIPTION_MIN = 400;
export const DESCRIPTION_MAX = 20000;

export function validateJob(v) {
  const e = {};

  const title = (v.title || "").trim();
  if (title.length < 3) e.title = "Give the role a title of at least 3 characters.";
  else if (title.length > 200) e.title = "Keep the title to 200 characters or fewer.";

  const company = (v.company_name || "").trim();
  if (!company) {
    e.company_name = "Name the company the candidate would be working for.";
  } else if (!v.company_id && !v.company_is_new) {
    e.company_name =
      "Pick this company from the list, or choose \u201CAdd \u2026 as a new " +
      "company\u201D. Nothing is created until you do.";
  } else if (v.company_is_new && !companySlug(company)) {
    e.company_name =
      "A new company name needs at least one letter or number in it.";
  }

  if (!v.city) e.city = "Choose a location.";
  else if (!CITIES.includes(v.city)) e.city = "Choose a location from the list.";

  if (!v.work_mode) e.work_mode = "Choose on-site, hybrid or remote.";
  if (!v.job_function) e.job_function = "Choose the function this role sits in.";
  if (!JOB_FUNCTIONS.includes(v.job_function) && v.job_function) {
    e.job_function = "Choose a function from the list.";
  }
  if (!v.employment_type) e.employment_type = "Choose an employment type.";

  // experience_min / experience_max: int 0-50, max >= min
  const expMin = v.experience_min === "" ? null : Number(v.experience_min);
  const expMax = v.experience_max === "" ? null : Number(v.experience_max);

  if (expMin === null) e.experience_min = "Enter the minimum years of experience. Use 0 for a fresher role.";
  else if (!Number.isInteger(expMin) || expMin < 0 || expMin > 50)
    e.experience_min = "Minimum experience must be a whole number between 0 and 50.";

  if (expMax === null) e.experience_max = "Enter the maximum years of experience.";
  else if (!Number.isInteger(expMax) || expMax < 0 || expMax > 50)
    e.experience_max = "Maximum experience must be a whole number between 0 and 50.";

  if (expMin !== null && expMax !== null && !e.experience_min && !e.experience_max && expMax < expMin) {
    e.experience_max = "The maximum cannot be below the minimum.";
  }

  const description = (v.description || "").trim();
  if (description.length < DESCRIPTION_MIN) {
    // The message names the CONSEQUENCE, not the rule. "At least 400
    // characters" reads as an arbitrary hurdle; the reason a recruiter
    // should care is that Google will not list a thin posting, and most
    // candidates reach these roles through Google.
    e.description = `Describe the role in at least ${DESCRIPTION_MIN} characters — you have ${description.length}. A thin description stops the role appearing in Google's job results, where most candidates will find it.`;
  } else if (description.length > DESCRIPTION_MAX) {
    e.description = `Keep the description under ${DESCRIPTION_MAX.toLocaleString()} characters.`;
  }

  // No external_url rule any more: the form cannot produce apply_mode
  // 'external', so there is no link for a recruiter to get wrong. The column
  // check in migration 001 still stands behind it.

  // Salary is optional, but a number without its units is not storable.
  const salMin = v.salary_min === "" ? null : Number(v.salary_min);
  const salMax = v.salary_max === "" ? null : Number(v.salary_max);

  if (salMin !== null && (!Number.isFinite(salMin) || salMin < 0))
    e.salary_min = "Salary must be a number of 0 or more.";
  if (salMax !== null && (!Number.isFinite(salMax) || salMax < 0))
    e.salary_max = "Salary must be a number of 0 or more.";
  if (salMin !== null && salMax !== null && !e.salary_min && !e.salary_max && salMax < salMin)
    e.salary_max = "The top of the range cannot be below the bottom.";
  if ((salMin !== null || salMax !== null) && (!v.salary_currency || !v.salary_period))
    e.salary_currency = "Choose a currency and a period for the salary.";

  const openings = v.openings === "" ? null : Number(v.openings);
  if (openings !== null && (!Number.isInteger(openings) || openings < 1 || openings > 999))
    e.openings = "Openings must be a whole number between 1 and 999.";

  if (splitSkills(v.skills).length > 20) {
    e.skills = "List up to 20 skills.";
  }

  return e;
}

