import { supabase } from "./supabase";
import { EXPERIENCE_BANDS, findBand, jobMatchesBand, sanitise } from "./jobDisplay";

// ===========================================================================
// Reading directly-posted jobs as a candidate sees them.
//
// There is no "only show live jobs" clause anywhere below, on purpose. The
// policy "anyone reads public jobs" already applies private.job_is_public(),
// which checks status, expiry AND recruiter suspension in the database. A
// filter here would duplicate a rule that is already enforced, and would then
// be the thing that drifts.
//
// The one visible consequence: a recruiter browsing /gcc-jobs sees their own
// closed or expired roles, because "recruiter reads own jobs" also matches.
// That is a preview, not a leak -- no other account can see them.
// ===========================================================================

export const JOBS_PER_PAGE = 20;

// Columns a candidate is allowed to care about. posted_by is deliberately
// absent: nothing on the public side needs the recruiter's user id.
const CARD_COLUMNS =
  "id, title, slug, city, work_mode, job_function, employment_type, " +
  "experience_min, experience_max, salary_min, salary_max, salary_currency, " +
  "salary_period, openings, skills, published_at, expires_at, status, " +
  "companies(name, logo_url)";

// posted_by only on the detail page, and only so the apply panel can tell a
// recruiter they are looking at their own posting. It is a bare uuid that
// joins to nothing a client can read: public.profiles has no grant to anon
// at all, and its policy for signed-in users is auth.uid() = id.
const DETAIL_COLUMNS = CARD_COLUMNS + ", description, posted_by";

// ---------------------------------------------------------------------------
// The dropdown options are built from the jobs that actually exist, not from
// the 21 cities and 15 functions the posting form offers. Offering a filter
// that can only ever return nothing is worse than offering no filter.
// ---------------------------------------------------------------------------
export async function fetchFacets() {
  const { data, error } = await supabase
    .from("jobs")
    .select("city, job_function, experience_min, experience_max")
    .limit(1000);

  if (error) return { cities: [], functions: [], bands: [], error };

  const rows = data || [];
  const uniq = (key) =>
    [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();

  return {
    cities: uniq("city"),
    functions: uniq("job_function"),
    // Same rule as the other two: only offer a band some role falls into.
    bands: EXPERIENCE_BANDS.filter((band) =>
      rows.some((row) => jobMatchesBand(row, band))
    ),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// One page of results.
//
// Keyword search covers the title, the description, the SKILLS and the
// hiring company's name.
//
// Skills needed migration 006 to be searchable at all. The column is text[],
// and PostgREST can only test an array for containment -- an exact,
// case-sensitive match on a whole element -- so "snowflake" matched nothing
// while "Snowflake" sat in the skills list. jobs.skills_text is a flattened
// copy maintained by a trigger, and that is what is searched here.
//
// The company is a separate table, and an `or` filter cannot reach across an
// embedded resource, so matching company ids are looked up first and folded
// into the same `or` as an id list. Two small round trips rather than one
// clever query.
// ---------------------------------------------------------------------------
export async function fetchJobs({ search, city, jobFunction, band, page }) {
  const term = sanitise(search);

  let companyIds = [];

  if (term) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", `%${term}%`)
      .limit(50);

    companyIds = (companies || []).map((c) => c.id);
  }

  let query = supabase
    .from("jobs")
    .select(CARD_COLUMNS, { count: "exact" })
    .order("published_at", { ascending: false });

  if (city) query = query.eq("city", city);
  if (jobFunction) query = query.eq("job_function", jobFunction);

  // Range overlap, so a 3-8 year role is found under both 3-5 and 6-10.
  const range = findBand(band);
  if (range) {
    query = query.lte("experience_min", range.max).gte("experience_max", range.min);
  }

  if (term) {
    const clauses = [
      `title.ilike.*${term}*`,
      `description.ilike.*${term}*`,
      `skills_text.ilike.*${term}*`,
    ];
    if (companyIds.length) clauses.push(`company_id.in.(${companyIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const from = (page - 1) * JOBS_PER_PAGE;

  const { data, error, count } = await query.range(from, from + JOBS_PER_PAGE - 1);

  return { jobs: data || [], total: count || 0, error };
}

// ---------------------------------------------------------------------------
// One job, plus the posting agency.
//
// The agency comes from an RPC because public.recruiter_profiles is not
// readable by candidates -- it carries the recruiter's phone number and email
// domain. public.job_posting_agency() (migration 005) returns the one field
// that is public, and only for a job the caller can already see.
// ---------------------------------------------------------------------------
export async function fetchJob(id) {
  const [{ data: job, error }, { data: agency }] = await Promise.all([
    supabase.from("jobs").select(DETAIL_COLUMNS).eq("id", id).maybeSingle(),
    supabase.rpc("job_posting_agency", { p_job_id: id }),
  ]);

  if (error) return { job: null, agency: null, error };
  return { job, agency: agency || null, error: null };
}
