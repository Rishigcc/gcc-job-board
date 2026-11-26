-- ===========================================================================
-- 019_latency_scope_fix_rollback.sql
--
-- Returns admin_report_totals() to counting only CURRENTLY verified
-- recruiters in the latency figures. Running this reintroduces a moving
-- denominator: unverifying a recruiter removes their recorded wait from the
-- statistic, in the flattering direction, and makes the Overview disagree with
-- the Recruiters view about the same person.
-- ===========================================================================

create or replace function public.admin_report_totals()
  returns table (
    applications_total        integer,
    applications_unactioned   integer,
    applications_shortlisted  integer,
    applications_not_selected integer,
    applications_anonymised   integer,
    candidates_identifiable   integer,
    candidates_without_resume integer,
    roles_total               integer,
    roles_live                integer,
    roles_closed              integer,
    roles_expired             integer,
    roles_hidden              integer,
    roles_zero_applications   integer,
    recruiters_total          integer,
    recruiters_verified       integer,
    recruiters_awaiting       integer,
    recruiters_suspended      integer,
    recruiters_at_cap         integer,
    orphaned_files            integer,
    verification_measured     integer,
    verification_unmeasured   integer,
    verification_within_promise integer,
    verification_breached     integer,
    verification_median_working_days numeric
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  with guard as (select private.is_admin() as ok),
  app as (
    select count(*)::integer                                                        as total,
           count(*) filter (where a.status = 'applied'
                              and a.anonymised_at is null)::integer                 as unactioned,
           count(*) filter (where a.status = 'shortlisted')::integer                as shortlisted,
           count(*) filter (where a.status = 'not_selected')::integer               as not_selected,
           count(*) filter (where a.anonymised_at is not null)::integer             as anonymised,
           count(distinct a.candidate_id)::integer                                  as identifiable
      from public.applications a
  ),
  no_resume as (
    select count(*)::integer as n
      from (select distinct a.candidate_id
              from public.applications a
             where a.candidate_id is not null) c
     where not exists (
       select 1 from public.candidate_resumes cr where cr.candidate_id = c.candidate_id
     )
  ),
  job as (
    select count(*)::integer                                                        as total,
           count(*) filter (where j.status='live'   and j.expires_at >  now())::integer as live,
           count(*) filter (where j.status='closed')::integer                       as closed,
           count(*) filter (where j.status='live'   and j.expires_at <= now())::integer as expired,
           count(*) filter (where j.status='hidden')::integer                       as hidden,
           count(*) filter (where not exists (
             select 1 from public.applications a where a.job_id = j.id
           ))::integer                                                              as zero_apps
      from public.jobs j
  ),
  rec as (
    select count(*)::integer                                                        as total,
           count(*) filter (where r.is_verified)::integer                           as verified,
           count(*) filter (where not r.is_verified and not r.is_suspended)::integer as awaiting,
           count(*) filter (where r.is_suspended)::integer                          as suspended,
           count(*) filter (where not r.is_verified and not r.is_suspended
                              and private.recruiter_live_job_count(r.user_id) >= 10)::integer as at_cap
      from public.recruiter_profiles r
  ),
  orph as (
    select count(*)::integer as n
      from storage.objects o
     where o.bucket_id = 'resumes'
       and not exists (
         select 1 from public.candidate_resumes cr where cr.resume_path = o.name
       )
  ),
  lat as (
    select private.working_days_between(r.created_at, private.first_verified_at(r.user_id)) as wd
      from public.recruiter_profiles r
     where r.is_verified
  ),
  latsum as (
    select count(*) filter (where wd is not null)::integer            as measured,
           count(*) filter (where wd is null)::integer                as unmeasured,
           count(*) filter (where wd is not null and wd <= 2)::integer as within,
           count(*) filter (where wd is not null and wd >  2)::integer as breached,
           -- ::numeric because percentile_cont returns double precision and
           -- round(double precision, integer) does not exist in Postgres.
           -- Caught by dry-running this before it shipped; it would have
           -- failed the migration outright.
           (percentile_cont(0.5) within group (order by wd)
             filter (where wd is not null))::numeric                   as median
      from lat
  )
  select app.total, app.unactioned, app.shortlisted, app.not_selected,
         app.anonymised, app.identifiable, no_resume.n,
         job.total, job.live, job.closed, job.expired, job.hidden, job.zero_apps,
         rec.total, rec.verified, rec.awaiting, rec.suspended, rec.at_cap,
         orph.n,
         latsum.measured, latsum.unmeasured, latsum.within, latsum.breached,
         round(latsum.median, 1)
    from guard, app, no_resume, job, rec, orph, latsum
   where guard.ok;
$$;

revoke all on function public.admin_report_totals() from public;
grant execute on function public.admin_report_totals() to authenticated;

select 'reverted' as state;
