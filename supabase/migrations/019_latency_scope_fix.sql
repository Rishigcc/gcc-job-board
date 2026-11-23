-- ===========================================================================
-- 019_latency_scope_fix.sql   --   the Overview counted currently-verified
--                                  recruiters, not ever-verified ones
--
-- WHAT RISHI FOUND, AND IT WAS NOT WHAT THE CHECKLIST STEP CLAIMED
--   R7 said unverifying a recruiter should not wipe their measurement, since
--   the rule in 018 keys off an unverify PRECEDING the first verify. It did
--   wipe it, and the rule was not the cause.
--
--   admin_report_totals() computed latency from
--
--     from public.recruiter_profiles r where r.is_verified
--
--   so unverifying someone removed them from the statistic altogether.
--
-- THE REAL FAULT IS A MOVING DENOMINATOR
--   "Currently verified" and "has ever been verified" are different
--   populations, and the promise is about the second. A recruiter who waited
--   five working days waited five working days; unverifying them later does not
--   unmake it. Under the old filter a published-promise statistic changed
--   retroactively based on a current state with no bearing on the historical
--   wait -- and it changed in the flattering direction, because the breach
--   simply left the sample.
--
--   Rishi also observed that "Not measured" should then arguably have read 2
--   rather than 1. Neither was right: the recruiter was not unmeasured, it was
--   EXCLUDED. That is the tell for a moving denominator.
--
-- AND IT BROKE A RULE THIS STAGE WAS BUILT ON, IN A WAY THE RULE DID NOT COVER
--   017 says every number has exactly one source, so the Overview must not add
--   up what the Roles table returned. It does not. But the Overview and
--   admin_recruiter_stats() defined their POPULATION differently -- the latter
--   has no is_verified filter and was right all along -- so the two views
--   disagreed about the same recruiter: Recruiters showed "over 2 working
--   days" while the Overview showed 0 breaches.
--
--   Same bug class, different axis. "One source per number" was not enough;
--   it needed to be "one source per number AND one population per question".
--   Check c3 below asserts the two agree, which is the check that would have
--   caught this.
--
-- ROLLBACK: 019_latency_scope_fix_rollback.sql
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
  -- EVER verified, not CURRENTLY verified. In scope when there is any
  -- evidence they were verified at some point: they are verified now, or the
  -- audit log holds a verify or an unverify for them. An unverify is evidence
  -- too -- it cannot happen to an account that was never verified.
  --
  -- This is the same population admin_recruiter_stats() reports on, which is
  -- what makes the two views agree. Check c3 asserts it.
  lat as (
    select private.working_days_between(r.created_at, private.first_verified_at(r.user_id)) as wd
      from public.recruiter_profiles r
     where r.is_verified
        or exists (
          select 1 from public.admin_audit x
           where x.target_type = 'recruiter'
             and x.target_id = r.user_id::text
             and x.action in ('recruiter_verified', 'recruiter_unverified')
        )
  ),
  latsum as (
    select count(*) filter (where wd is not null)::integer            as measured,
           count(*) filter (where wd is null)::integer                as unmeasured,
           count(*) filter (where wd is not null and wd <= 2)::integer as within,
           count(*) filter (where wd is not null and wd >  2)::integer as breached,
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

-- ---------------------------------------------------------------------------
-- CHECKS
-- ---------------------------------------------------------------------------
select set_config(
         'request.jwt.claims',
         json_build_object('sub', (select user_id from public.user_roles
                                    where role = 'admin' limit 1))::text,
         true
       ) as impersonating_admin_for_this_transaction;

select
  case when auth.uid() is not null then 'PASS' else 'FAIL — impersonation did not carry' end
    as c0_session_took_effect,

  -- The regression: a recruiter with a measured wait must stay counted whether
  -- or not they are verified right now.
  case when (select verification_measured from public.admin_report_totals())
          = (select count(*)::integer from public.admin_recruiter_stats()
              where working_days_to_verification is not null)
       then 'PASS'
       else 'FAIL — Overview measured ' || (select verification_measured from public.admin_report_totals())
            || ', Recruiters view has ' || (select count(*) from public.admin_recruiter_stats()
                 where working_days_to_verification is not null) end
    as c1_measured_counts_agree,

  case when (select verification_breached from public.admin_report_totals())
          = (select count(*)::integer from public.admin_recruiter_stats()
              where verified_within_promise is false)
       then 'PASS'
       else 'FAIL — Overview breached ' || (select verification_breached from public.admin_report_totals())
            || ', Recruiters view has ' || (select count(*) from public.admin_recruiter_stats()
                 where verified_within_promise is false) end
    as c2_breach_counts_agree,

  -- One population per question, stated as arithmetic: measured plus
  -- unmeasured must equal everyone who has ever been verified. If it does not,
  -- somebody is being silently excluded -- which is exactly what happened.
  case when (select verification_measured + verification_unmeasured
               from public.admin_report_totals())
          = (select count(*)::integer from public.recruiter_profiles r
              where r.is_verified
                 or exists (select 1 from public.admin_audit x
                             where x.target_type='recruiter' and x.target_id = r.user_id::text
                               and x.action in ('recruiter_verified','recruiter_unverified')))
       then 'PASS' else 'FAIL — the denominator excludes someone' end
    as c3_nobody_silently_excluded,

  case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public','private') and p.prokind = 'f'
                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                                 where c like 'search_path=%')) = 0
       then 'PASS' else 'FAIL — an unpinned function exists' end
    as c4_all_search_paths_pinned;
