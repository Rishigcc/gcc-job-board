-- ===========================================================================
-- 005_public_job_detail.sql
--
-- Stage 5 needs ONE thing the schema does not already provide: the posting
-- agency on the public job detail page.
--
-- WHY IT IS NOT JUST A JOIN
--   The agency name lives in public.recruiter_profiles.company_name. That
--   table is granted to `authenticated` only, and its read policy narrows it
--   further to the recruiter's own row plus admins -- deliberately, because
--   the same row carries the recruiter's phone number and email domain. So
--   neither a signed-out visitor nor a signed-in candidate can read it, and
--   neither should be able to.
--
-- WHY A FUNCTION RATHER THAN A VIEW OR A NEW COLUMN
--   A view that bypasses RLS is flagged by Supabase's own security advisor
--   and is easy to widen by accident later. A denormalised posting_agency
--   column on jobs would go stale: a recruiter may edit their company name,
--   and every job already posted would keep the old spelling.
--
--   This returns one text value for one job id, and only when that job is
--   already visible to the caller. There is nothing else on the row to leak.
--
-- WHAT IT CHANGES: adds one function. No table, column, policy, grant on a
-- table, or trigger is touched.
--
-- ROLLBACK: 005_public_job_detail_rollback.sql
-- ===========================================================================

create or replace function public.job_posting_agency(p_job_id bigint)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select r.company_name
    from public.jobs j
    join public.recruiter_profiles r on r.user_id = j.posted_by
   where j.id = p_job_id
     and (
       -- Exactly the three ways a job is readable today, kept in the same
       -- order as the SELECT policies on public.jobs so the two can be read
       -- side by side. If a policy there changes, change this with it.
       private.job_is_public(j.status, j.expires_at, j.posted_by)
       or j.posted_by = auth.uid()
       or private.is_admin()
     );
$$;

-- CREATE OR REPLACE resets privileges, so these must follow the body, not
-- precede it.
revoke all on function public.job_posting_agency(bigint) from public;
grant execute on function public.job_posting_agency(bigint) to anon, authenticated;

comment on function public.job_posting_agency(bigint) is
  'Posting agency for a job the caller can already see. Returns null otherwise.';
