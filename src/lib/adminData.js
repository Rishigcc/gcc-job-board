import { supabase } from "./supabase";
import { companySlug } from "./jobOptions";

// ===========================================================================
// Everything the admin pages read and write.
//
// READS GO STRAIGHT TO THE TABLES; WRITES GO THROUGH FUNCTIONS.
//   That split is not arbitrary. Admin SELECT policies already existed for
//   recruiter_profiles, jobs, applications and user_roles, so a read needs no
//   new surface. There was no admin WRITE path anywhere -- and migration 014
//   deliberately did not add one. Every change below is an RPC to a
//   SECURITY DEFINER function that checks private.is_admin() itself and
//   writes its own audit row, so the audit cannot be skipped by a page that
//   forgets to write it.
//
// THE ONE READ THAT NEEDS A FUNCTION is the orphan report: storage.objects is
// reachable by no policy at all.
//
// WHAT IS NOT HERE, AND CANNOT BE: a recruiter's email address. It lives in
// auth.users, which no client role can read. recruiter_profiles carries the
// name, company, email domain, website, phone and GSTIN, which is what a
// verification decision actually needs. That is a deliberate absence rather
// than a missing feature.
// ===========================================================================

function describe(error, fallback) {
  if (!error) return null;

  // Ours, from migration 014 -- already a sentence written for a person.
  if (error.code === "P0001") return { message: error.message, detail: null };

  if (error.code === "42501") {
    return { message: "That account is not an administrator.", detail: error.message };
  }

  return { message: fallback, detail: error.message };
}

// ---------------------------------------------------------------------------
// Is the signed-in user an admin? Readable because user_roles has a "read own
// role" policy. An admin row cannot be created through the API at all -- no
// insert policy exists on user_roles, which was the very first decision in
// this project.
// ---------------------------------------------------------------------------
export async function fetchIsAdmin(userId) {
  if (!userId) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("admin check failed", error);
    return false;
  }

  return Boolean(data);
}

// ---------------------------------------------------------------------------
// The two numbers. Both are counts under existing admin policies, so neither
// needs a function: one is work waiting for a person, the other says whether
// the board is alive at all.
// ---------------------------------------------------------------------------
export async function fetchAdminCounts() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [awaiting, recent] = await Promise.all([
    supabase
      .from("recruiter_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_verified", false)
      .eq("is_suspended", false),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
  ]);

  return {
    awaitingVerification: awaiting.count ?? null,
    applicationsLast7Days: recent.count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recruiters, with how many roles each has posted. The job counts come from
// one query over all jobs rather than one per recruiter: an admin page with a
// query per row is the kind of thing that works at two accounts and not at
// two hundred.
// ---------------------------------------------------------------------------
export async function fetchRecruiters() {
  const [profiles, jobs] = await Promise.all([
    supabase
      .from("recruiter_profiles")
      .select(
        "user_id, recruiter_name, company_name, email_domain, website, phone, " +
          "gstin, is_verified, verified_at, is_suspended, suspended_at, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("jobs").select("posted_by, status, expires_at"),
  ]);

  if (profiles.error) {
    return { error: describe(profiles.error, "The recruiter list could not be loaded.") };
  }

  const counts = {};
  const now = Date.now();

  for (const job of jobs.data || []) {
    const bucket = (counts[job.posted_by] ||= { total: 0, live: 0, hidden: 0 });
    bucket.total += 1;
    if (job.status === "hidden") bucket.hidden += 1;
    else if (job.status === "live" && new Date(job.expires_at).getTime() > now) bucket.live += 1;
  }

  return {
    rows: (profiles.data || []).map((r) => ({
      ...r,
      jobs: counts[r.user_id] || { total: 0, live: 0, hidden: 0 },
    })),
  };
}

export async function setRecruiterVerified(userId, verified) {
  const { data, error } = await supabase.rpc("admin_set_recruiter_verified", {
    p_user: userId,
    p_verified: verified,
  });

  if (error) return { error: describe(error, "That could not be changed.") };
  return { message: data };
}

export async function setRecruiterSuspended(userId, suspended) {
  const { data, error } = await supabase.rpc("admin_set_recruiter_suspended", {
    p_user: userId,
    p_suspended: suspended,
  });

  if (error) return { error: describe(error, "That could not be changed.") };
  return { message: data };
}

// ---------------------------------------------------------------------------
// Jobs, including hidden ones -- the "admin reads all jobs" policy is what
// makes a hidden job visible here, and nothing else can see it.
// ---------------------------------------------------------------------------
export async function fetchAdminJobs(search) {
  let query = supabase
    .from("jobs")
    .select("id, title, slug, city, status, published_at, expires_at, posted_by, companies(name)")
    .order("published_at", { ascending: false })
    .limit(200);

  const term = (search || "").replace(/[,()%*"\\]/g, " ").trim();
  if (term) query = query.ilike("title", `%${term}%`);

  const { data, error } = await query;

  if (error) return { error: describe(error, "The roles could not be loaded.") };
  return { rows: data || [] };
}

export async function setJobHidden(jobId, hidden) {
  const { data, error } = await supabase.rpc("admin_set_job_hidden", {
    p_job_id: jobId,
    p_hidden: hidden,
  });

  if (error) return { error: describe(error, "That role could not be changed.") };
  return { message: data };
}

// ---------------------------------------------------------------------------
// Companies. Readable by anyone; renameable only here.
//
// The new slug is computed with the SAME companySlug() the picker uses and
// validated by the function. Reproducing that folding in SQL would mean
// reimplementing Unicode normalisation in plpgsql and keeping two copies in
// step.
// ---------------------------------------------------------------------------
export async function fetchCompanies(search) {
  let query = supabase.from("companies").select("id, name, slug").order("name").limit(100);

  const term = (search || "").replace(/[,()%*"\\]/g, " ").trim();
  if (term) query = query.ilike("name", `%${term}%`);

  const { data, error } = await query;

  if (error) return { error: describe(error, "The companies could not be loaded.") };
  return { rows: data || [] };
}

export async function renameCompany(companyId, name) {
  const trimmed = (name || "").trim();

  const { data, error } = await supabase.rpc("admin_rename_company", {
    p_company_id: companyId,
    p_name: trimmed,
    p_slug: companySlug(trimmed),
  });

  if (error) return { error: describe(error, "That company could not be renamed.") };
  return { message: data };
}

// ---------------------------------------------------------------------------
// Orphaned resume files: objects in the bucket that no candidate_resumes row
// points at. Reports only. Stage 8 made deletion reliable for anyone who
// ASKS; this is for the files belonging to people who never ask.
// ---------------------------------------------------------------------------
export async function fetchOrphanedResumes() {
  const { data, error } = await supabase.rpc("admin_orphaned_resumes");

  if (error) return { error: describe(error, "The orphan report could not be loaded.") };
  return { rows: data || [] };
}

// ---------------------------------------------------------------------------
// Finding a candidate who has asked for their data to be deleted. They write
// in by email, so email is what there is to search. Anonymised applications
// have a null email and so cannot be found again -- which is the point of
// anonymising, not a shortcoming of this search.
// ---------------------------------------------------------------------------
export async function findCandidateByEmail(email) {
  const term = (email || "").replace(/[,()%*"\\]/g, " ").trim();

  if (term.length < 4) {
    return { error: { message: "Enter at least four characters of the email address." } };
  }

  const { data, error } = await supabase
    .from("applications")
    .select("candidate_id, full_name, email, created_at")
    .ilike("email", `%${term}%`)
    .not("candidate_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { error: describe(error, "That search could not be run.") };

  // One entry per person, not per application.
  const byCandidate = new Map();

  for (const row of data || []) {
    const found = byCandidate.get(row.candidate_id);
    if (found) found.applications += 1;
    else
      byCandidate.set(row.candidate_id, {
        candidate_id: row.candidate_id,
        full_name: row.full_name,
        email: row.email,
        applications: 1,
      });
  }

  return { rows: [...byCandidate.values()] };
}

// ---------------------------------------------------------------------------
// The audit log. Read-only by construction: an admin SELECT policy, a
// select-only grant, no insert policy and no insert grant anywhere.
//
// PAGED, AND IT HAS TO BE. The log is never pruned -- an audit log that
// expires stops being evidence, and the Final rows are exactly what would be
// needed to show a deletion request was honoured. So it only grows, and a
// single capped read would silently stop showing history the day it passed the
// cap. One row per page beyond the first is a worse bug than no paging,
// because it looks like the whole truth.
//
// THE CURSOR IS `id`, NOT `created_at`, DELIBERATELY. Two rows can share a
// timestamp, and a keyset cursor on a non-unique column skips rows at the page
// boundary -- the kind of bug that loses one entry out of a thousand and is
// never noticed. `id` is a generated identity, so its order IS insertion
// order, which for this table is chronological order.
//
// admin_audit_recent_idx on created_at is kept even though this query uses the
// primary key, because the realistic future question is "what happened last
// March", and that is the index that answers it.
// ---------------------------------------------------------------------------
export const AUDIT_PAGE_SIZE = 50;

export async function fetchAuditLog({ before = null, limit = AUDIT_PAGE_SIZE } = {}) {
  let query = supabase
    .from("admin_audit")
    .select("id, actor_id, action, target_type, target_id, summary, before, after, reversible, created_at")
    .order("id", { ascending: false })
    // One more than asked for, so "is there another page" is answered by the
    // same request rather than by a second one that might disagree with it.
    .limit(limit + 1);

  if (before !== null) query = query.lt("id", before);

  const { data, error } = await query;

  if (error) return { error: describe(error, "The audit log could not be loaded.") };

  const rows = data || [];
  const hasMore = rows.length > limit;

  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

// The total, so the page can say how much of the log it is showing. A count
// with head: true transfers no rows.
export async function fetchAuditCount() {
  const { count, error } = await supabase
    .from("admin_audit")
    .select("id", { count: "exact", head: true });

  if (error) return { error: describe(error, "The audit log size could not be read.") };
  return { count: count ?? null };
}

// ---------------------------------------------------------------------------
// The two actions that also delete a file, so they go through our own
// endpoints. Their database halves are granted to service_role only, for the
// stage 8 reason: a browser-callable half would let the row change happen
// without the file deletion, or the reverse.
// ---------------------------------------------------------------------------
async function postAsAdmin(path, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: { message: "Your session has expired. Sign in and try again." } };
  }

  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });
  } catch {
    return { error: { message: "We could not reach the server. Try again." } };
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The status still says something true.
  }

  if (!response.ok) {
    return { error: { message: payload.error || "That did not work." } };
  }

  return { data: payload };
}

export async function anonymiseCandidate(candidateId, confirmation) {
  return postAsAdmin("/api/admin-anonymise", { candidateId, confirmation });
}

export async function deleteOrphanFile(path, confirmation) {
  return postAsAdmin("/api/admin-delete-orphan", { path, confirmation });
}
