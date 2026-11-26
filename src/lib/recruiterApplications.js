import { supabase } from "./supabase";

// ===========================================================================
// Everything the recruiter side reads about applications.
//
// NONE OF IT TOUCHES public.applications DIRECTLY, AND IT CANNOT.
//   That table has no select policy for recruiters -- stage 6's design, left
//   exactly as it was tested. Every call here is an RPC to one of the four
//   SECURITY DEFINER functions in migration 011, each of which names the
//   columns it returns and checks ownership and verification itself.
//
//   So there is no client-side filtering to get wrong, and no response that
//   contains a name the caller was not entitled to. If the rules change, they
//   change in one place and in SQL.
//
// AN EMPTY LIST IS NOT THE SAME AS "NOBODY APPLIED"
//   recruiter_applications() returns zero rows to an unverified recruiter,
//   whatever is actually in the table. The page must decide which it is from
//   is_verified on the recruiter's own profile row, never by assuming an
//   empty array means an empty inbox. fetchApplications() returns `gated`
//   rather than an empty array so that distinction cannot be lost by accident.
// ===========================================================================

function describe(error, fallback) {
  if (!error) return null;

  // Ours, from migration 011 -- already a sentence written for a recruiter.
  if (error.code === "P0001") return { message: error.message, detail: null };

  if (error.code === "42501") {
    return {
      message:
        "This account is not allowed to do that. It may be suspended, or " +
        "its email address may never have been confirmed. Write to " +
        "jobs@iworkatgcc.com and we will look.",
      detail: error.message,
    };
  }

  return { message: fallback, detail: error.message };
}

// job_id -> { count, latestAt }, for every own job that has any applications.
// Allowed before verification: it is a number and a date, not a person.
export async function fetchApplicationCounts() {
  const { data, error } = await supabase.rpc("recruiter_application_counts");

  if (error) {
    return { error: describe(error, "Application counts could not be loaded.") };
  }

  const byJob = {};
  for (const row of data || []) {
    byJob[row.job_id] = { count: row.application_count, latestAt: row.latest_at };
  }

  return { byJob };
}

// `isVerified` is passed in rather than re-read, because the caller already
// has the profile row and because the honest shape of this result depends on
// it: with no verification there is nothing to return and saying so is the
// point.
export async function fetchApplications(jobId, isVerified) {
  if (!isVerified) return { gated: true, rows: [] };

  const { data, error } = await supabase.rpc("recruiter_applications", {
    p_job_id: jobId,
  });

  if (error) {
    return { error: describe(error, "The applications could not be loaded.") };
  }

  return { rows: data || [] };
}

export async function setApplicationStatus(applicationId, status) {
  const { data, error } = await supabase.rpc("recruiter_set_application_status", {
    p_application_id: applicationId,
    p_status: status,
  });

  if (error) {
    return { error: describe(error, "That application could not be updated.") };
  }

  return { status: data };
}

// ---------------------------------------------------------------------------
// The resume.
//
// A two-step exchange, and the split is the security property. The database
// decides WHETHER (public.recruiter_resume_path, which checks ownership,
// suspension and verification as the calling recruiter). The server decides
// HOW (a signed URL, which only the service key can mint, because the bucket
// has no policies at all).
//
// The URL that comes back is short-lived and is never stored.
// ---------------------------------------------------------------------------
export async function fetchResumeUrl(applicationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: { message: "Your session has expired. Sign in and try again." } };
  }

  let response;
  try {
    response = await fetch("/api/resume-url", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ applicationId }),
    });
  } catch {
    return { error: { message: "We could not reach the server. Check your connection and try again." } };
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Status alone still says something true.
  }

  if (!response.ok) {
    return { error: { message: payload.error || "That resume could not be opened." } };
  }

  return { url: payload.url };
}
