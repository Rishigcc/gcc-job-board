import { supabase } from "./supabase";
import { companySlug, slugify, splitSkills } from "./jobOptions";

// ===========================================================================
// Every database write the recruiter job pages make. Kept out of the
// components so the error mapping below exists exactly once.
// ===========================================================================

// ---------------------------------------------------------------------------
// Turning a database error into something a recruiter can act on.
//
// Postgres error codes we can actually receive here:
//
//   P0001  raise_exception -- OUR OWN message, from private.jobs_cap_guard()
//          or private.handle_new_recruiter(). These are written for a person,
//          so they are shown verbatim. This is the whole reason migration 004
//          exists.
//   42501  insufficient_privilege -- an RLS policy refused the row, or a
//          column grant is missing. Opaque by design; Postgres will not say
//          which policy, because saying so would leak the policy.
//   23514  check_violation -- a CHECK constraint. The form validates the same
//          rules first, so reaching this means the form and the database have
//          drifted apart. Worth saying so rather than pretending.
//   23505  unique_violation -- in practice only the companies.slug index.
//   23503  foreign_key_violation -- a company_id that no longer exists.
// ---------------------------------------------------------------------------
export function describeWriteError(error, context = "save this role") {
  if (!error) return null;

  if (error.code === "P0001") {
    // Ours. Already a sentence.
    return { message: error.message, detail: null };
  }

  if (error.code === "42501") {
    return {
      message:
        `This account is not allowed to ${context}. That usually means the ` +
        "recruiter account is suspended, or its email address was never " +
        "confirmed. Write to jobs@iworkatgcc.com and we will look.",
      detail: error.message,
    };
  }

  if (error.code === "23514") {
    return {
      message:
        "The database rejected one of these values, which means this form " +
        "let something through that it should have caught. Please send this " +
        "to jobs@iworkatgcc.com with what you typed.",
      detail: error.message,
    };
  }

  if (error.code === "23505") {
    return {
      message:
        "Another company is already registered under that name. Try the " +
        "company's full legal name.",
      detail: error.message,
    };
  }

  if (error.code === "23503") {
    return {
      message:
        "The hiring company could not be found. Pick it again and resubmit.",
      detail: error.message,
    };
  }

  return {
    message: `Could not ${context}. Please try again.`,
    detail: error.message,
  };
}

// ---------------------------------------------------------------------------
// Resolve the HIRING company to an id.
//
// This is not the recruiter's own company. A staffing agency posts roles for
// its clients, so `jobs.company_id` is who the candidate would work for, and
// the agency is named separately from `recruiter_profiles.company_name` on
// the job detail page.
//
// There are only two ways in, and the form will not submit without one of
// them (see CompanyPicker.jsx):
//
//   companyId  the recruiter clicked a company that already exists. Nothing
//              is created. This is the path we want almost every time.
//   isNew      the recruiter explicitly asked for a new company, having been
//              shown that no existing one matched.
//
// Even on the isNew path, the slug is checked first. companySlug() folds
// casing and in-word punctuation, so "H.S.B.C." lands on the existing "HSBC"
// row rather than creating a near-duplicate. That is a backstop for spelling,
// not for judgement -- it cannot know "Walmart Global Tech India" and
// "Walmart" are one employer, which is exactly why the picker makes the
// recruiter look at the list first.
//
// Recruiters have no UPDATE grant on companies, so anything created here is
// permanent until an admin changes it.
// ---------------------------------------------------------------------------
export async function resolveCompany({ companyId, name, isNew }) {
  if (companyId) {
    return { companyId, reused: true };
  }

  const trimmed = (name || "").trim();

  if (!trimmed) {
    return { error: { message: "Enter the hiring company's name." } };
  }

  if (!isNew) {
    // Should be unreachable: validateJob refuses an unconfirmed name. Kept so
    // that a future caller cannot create companies by accident.
    return {
      error: {
        message:
          "Pick the hiring company from the list, or choose to add it as a " +
          "new company.",
      },
    };
  }

  const slug = companySlug(trimmed);
  if (!slug) {
    return {
      error: {
        message: "That company name needs at least one letter or number in it.",
      },
    };
  }

  const { data: existing, error: readError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (readError) {
    return { error: describeWriteError(readError, "look up that company") };
  }
  if (existing) {
    return { companyId: existing.id, companyName: existing.name, reused: true };
  }

  const { data: created, error: insertError } = await supabase
    .from("companies")
    .insert({ name: trimmed, slug })
    .select("id, name")
    .single();

  if (!insertError) {
    return { companyId: created.id, companyName: created.name, created: true };
  }

  // Someone inserted the same slug between the read and the write.
  if (insertError.code === "23505") {
    const { data: raced } = await supabase
      .from("companies")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();

    if (raced) {
      return { companyId: raced.id, companyName: raced.name, reused: true };
    }
  }

  return { error: describeWriteError(insertError, "add that company") };
}

// ---------------------------------------------------------------------------
// Only the columns migration 001 grants on INSERT.
//
// Deliberately absent, and they must stay absent or the insert is refused
// outright with a permission error rather than ignoring the extra field:
//   status        -- not granted; the column default 'live' is what the
//                    insert policy requires
//   slug          -- granted on insert but NOT on update, so a live URL can
//                    never change
//   expires_at    -- not granted either way, so a recruiter cannot extend a
//   published_at     posting by editing it
// ---------------------------------------------------------------------------
function insertPayload(values, companyId, userId) {
  return {
    company_id: companyId,
    posted_by: userId,
    title: values.title.trim(),
    slug: slugify(values.title),
    city: values.city,
    work_mode: values.work_mode,
    job_function: values.job_function,
    employment_type: values.employment_type,
    experience_min: Number(values.experience_min),
    experience_max: Number(values.experience_max),
    description: values.description.trim(),
    apply_mode: values.apply_mode,
    external_url:
      values.apply_mode === "external" ? values.external_url.trim() : null,
    salary_min: values.salary_min === "" ? null : Number(values.salary_min),
    salary_max: values.salary_max === "" ? null : Number(values.salary_max),
    salary_currency:
      values.salary_min === "" && values.salary_max === ""
        ? null
        : values.salary_currency,
    salary_period:
      values.salary_min === "" && values.salary_max === ""
        ? null
        : values.salary_period,
    openings: values.openings === "" ? null : Number(values.openings),
    skills: splitSkills(values.skills),
  };
}

export async function createJob({ values, companyId, userId }) {
  const { data, error } = await supabase
    .from("jobs")
    .insert(insertPayload(values, companyId, userId))
    .select("id, slug")
    .single();

  if (error) return { error: describeWriteError(error, "post this role") };
  return { job: data };
}

export async function updateJob({ jobId, values, companyId }) {
  // Same payload minus the three columns that are insert-only or ungranted.
  const payload = insertPayload(values, companyId, null);
  delete payload.posted_by;
  delete payload.slug;

  const { data, error } = await supabase
    .from("jobs")
    .update(payload)
    .eq("id", jobId)
    .select("id, slug")
    .single();

  if (error) return { error: describeWriteError(error, "save these changes") };
  return { job: data };
}

// Closing early. The update policy allows status to move between 'live' and
// 'closed' only -- never to 'hidden', so a job an admin hid cannot be revived
// by its poster.
export async function setJobStatus({ jobId, status }) {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status })
    .eq("id", jobId)
    .select("id, status, expires_at")
    .single();

  if (error) {
    return {
      error: describeWriteError(
        error,
        status === "closed" ? "close this role" : "reopen this role"
      ),
    };
  }
  return { job: data };
}
