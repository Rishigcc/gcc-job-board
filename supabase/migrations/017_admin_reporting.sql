-- ===========================================================================
-- 017_admin_reporting.sql   --   stage 9b, the numbers behind the admin queue
--
-- WHY FUNCTIONS WHEN THE POLICIES ALREADY ALLOW THE READS
--   "admin reads all applications" and "admin reads all jobs" already permit
--   every one of these reads. Nothing here is unlocked.
--
--   They exist because an aggregate returns counts, whereas a client-side
--   group-by ships every candidate's name and email to a browser in order to
--   count them. Same principle as stage 7, applied where the policy does not
--   require it.
--
-- ONE RULE THE WHOLE STAGE RESTS ON: EVERY NUMBER HAS EXACTLY ONE SOURCE.
--   If the Roles page sums per-role counts and the Overview sums its own, they
--   will eventually disagree and someone will lose an afternoon to it. That is
--   the only reason admin_report_totals() exists as its own function rather
--   than being derived in the page.
--
-- AND THE RECONCILIATION RULE, which is Rishi's W3 decision applied
-- consistently -- a number nobody can act on must not sit in a count of work
-- waiting:
--
--     totals (per role, per recruiter)   INCLUDE anonymised
--                                        they must agree with what the
--                                        recruiter sees on their own page
--     unactioned                         EXCLUDES anonymised
--     shortlisted / not selected         INCLUDE anonymised; status survives
--     the candidate list                 CANNOT show them -- no id, no name
--     anonymised                         its own figure, beside the totals
--
--   So the candidate list shows a number deliberately smaller than the total,
--   and the page has to say why. These functions supply both figures so it
--   can.
--
-- NO EMAIL IN THE CANDIDATE LIST. Rishi's decision: name and counts in the
-- list, email only when one candidate is opened. So admin_candidate_stats()
-- has no email column at all -- not hidden in the browser, absent from the
-- response -- and admin_candidate_detail() is the deliberate act.
--
-- ROLLBACK: 017_admin_reporting_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. WORKING DAYS, FOR THE TWO-WORKING-DAY PROMISE
--
-- Rishi's decision (A): weekends excluded, public holidays NOT modelled. His
-- reasoning -- "I'd rather under-report my own performance than model state
-- holidays." A holiday therefore counts as a working day, which makes every
-- figure derived from this PESSIMISTIC. It will never flatter.
--
-- Why this is needed at all, since it looks like over-engineering: a signup at
-- Friday 18:00 is due end of Tuesday -- two working days, but 4.2 calendar
-- days. Measuring calendar time would report a breach that never happened.
--
-- Counted in Asia/Kolkata, because the promise is made to people in India and
-- a day boundary in UTC is not the day they experienced. Dates strictly after
-- the signup date, up to and including the end date: so a signup on Monday
-- verified Tuesday is 1, Wednesday is 2, Thursday is 3 and a breach.
-- ---------------------------------------------------------------------------
create or replace function private.working_days_between(
    p_from timestamptz,
    p_to   timestamptz
  )
  returns integer
  language sql
  immutable
  security definer
  set search_path = public, pg_catalog
as $$
  select case
    when p_from is null or p_to is null or p_to < p_from then null
    else (
      select count(*)::integer
        from generate_series(
               ((p_from at time zone 'Asia/Kolkata')::date + 1),
               ((p_to   at time zone 'Asia/Kolkata')::date),
               interval '1 day'
             ) as d
       where extract(isodow from d) < 6   -- 1..5 = Monday..Friday
    )
  end;
$$;

revoke all on function private.working_days_between(timestamptz, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. HOW LONG VERIFICATION TOOK  --  private helper
--
-- The source is the AUDIT LOG, not recruiter_profiles.verified_at. That column
-- is overwritten on re-verification and nulled on unverify, so it is a current
-- state and not a record.
--
-- The FIRST recruiter_verified row, not the latest: a re-verification after an
-- unverify is not the original wait.
--
-- Returns null where there is no audit row -- a verification done in SQL
-- before migration 014. Null must render as "not measured" and never as zero,
-- which would drag an average into looking good.
-- ---------------------------------------------------------------------------
create or replace function private.first_verified_at(p_user uuid)
  returns timestamptz
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select min(a.created_at)
    from public.admin_audit a
   where a.action = 'recruiter_verified'
     and a.target_type = 'recruiter'
     and a.target_id = p_user::text;
$$;

revoke all on function private.first_verified_at(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE OVERVIEW  --  one row, every headline and reconciliation figure
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. PER ROLE
--
-- display_status is derived exactly as jobDisplayStatus() does on the client
-- and private.job_is_public() does in the database, so this column can never
-- disagree with either.
-- ---------------------------------------------------------------------------
create or replace function public.admin_role_stats()
  returns table (
    job_id             bigint,
    title              text,
    company_name       text,
    city               text,
    display_status     text,
    published_at       timestamptz,
    expires_at         timestamptz,
    closed_at          timestamptz,
    applications_total integer,
    unactioned         integer,
    shortlisted        integer,
    not_selected       integer,
    anonymised         integer,
    first_application_at timestamptz,
    last_application_at  timestamptz,
    hours_to_first_application numeric
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select j.id,
         j.title,
         c.name,
         j.city,
         case
           when j.status = 'hidden' then 'hidden'
           when j.status = 'closed' then 'closed'
           when j.expires_at <= now() then 'expired'
           else 'live'
         end,
         j.published_at,
         j.expires_at,
         j.closed_at,
         count(a.id)::integer,
         count(a.id) filter (where a.status = 'applied'
                               and a.anonymised_at is null)::integer,
         count(a.id) filter (where a.status = 'shortlisted')::integer,
         count(a.id) filter (where a.status = 'not_selected')::integer,
         count(a.id) filter (where a.anonymised_at is not null)::integer,
         min(a.created_at),
         max(a.created_at),
         round(extract(epoch from (min(a.created_at) - j.published_at)) / 3600.0, 1)
    from public.jobs j
    left join public.companies c    on c.id = j.company_id
    left join public.applications a on a.job_id = j.id
   where private.is_admin()
   group by j.id, j.title, c.name, j.city, j.status, j.published_at,
            j.expires_at, j.closed_at
   order by j.published_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 5. PER RECRUITER, INCLUDING VERIFICATION LATENCY
-- ---------------------------------------------------------------------------
create or replace function public.admin_recruiter_stats()
  returns table (
    user_id            uuid,
    recruiter_name     text,
    company_name       text,
    email_domain       text,
    is_verified        boolean,
    is_suspended       boolean,
    created_at         timestamptz,
    roles_posted       integer,
    roles_live         integer,
    roles_closed       integer,
    roles_expired      integer,
    roles_hidden       integer,
    last_posted_at     timestamptz,
    applications_received integer,
    unactioned         integer,
    shortlisted        integer,
    not_selected       integer,
    anonymised         integer,
    at_cap             boolean,
    first_verified_at  timestamptz,
    hours_to_verification numeric,
    working_days_to_verification integer,
    verified_within_promise boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  with jobs_by_recruiter as (
    select j.posted_by,
           count(*)::integer                                                       as posted,
           count(*) filter (where j.status='live'   and j.expires_at >  now())::integer as live,
           count(*) filter (where j.status='closed')::integer                      as closed,
           count(*) filter (where j.status='live'   and j.expires_at <= now())::integer as expired,
           count(*) filter (where j.status='hidden')::integer                      as hidden,
           max(j.published_at)                                                     as last_posted
      from public.jobs j
     group by j.posted_by
  ),
  apps_by_recruiter as (
    select j.posted_by,
           count(*)::integer                                                       as received,
           count(*) filter (where a.status='applied'
                              and a.anonymised_at is null)::integer                as unactioned,
           count(*) filter (where a.status='shortlisted')::integer                  as shortlisted,
           count(*) filter (where a.status='not_selected')::integer                 as not_selected,
           count(*) filter (where a.anonymised_at is not null)::integer             as anonymised
      from public.applications a
      join public.jobs j on j.id = a.job_id
     group by j.posted_by
  )
  select r.user_id, r.recruiter_name, r.company_name, r.email_domain,
         r.is_verified, r.is_suspended, r.created_at,
         coalesce(jb.posted, 0), coalesce(jb.live, 0), coalesce(jb.closed, 0),
         coalesce(jb.expired, 0), coalesce(jb.hidden, 0), jb.last_posted,
         coalesce(ab.received, 0), coalesce(ab.unactioned, 0),
         coalesce(ab.shortlisted, 0), coalesce(ab.not_selected, 0),
         coalesce(ab.anonymised, 0),
         (not r.is_verified and not r.is_suspended and coalesce(jb.live, 0) >= 10),
         private.first_verified_at(r.user_id),
         round(extract(epoch from (private.first_verified_at(r.user_id) - r.created_at)) / 3600.0, 1),
         private.working_days_between(r.created_at, private.first_verified_at(r.user_id)),
         -- Null, not false, when there is nothing to measure. A false here
         -- would read as a breach.
         case
           when private.first_verified_at(r.user_id) is null then null
           else private.working_days_between(r.created_at, private.first_verified_at(r.user_id)) <= 2
         end
    from public.recruiter_profiles r
    left join jobs_by_recruiter jb on jb.posted_by = r.user_id
    left join apps_by_recruiter ab on ab.posted_by = r.user_id
   where private.is_admin()
   order by r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. PER CANDIDATE  --  NO EMAIL COLUMN
--
-- full_name is per APPLICATION, not per candidate: someone who applied three
-- times may have three spellings. The name shown is the one on their most
-- recent application, which is the only defensible choice -- it is what they
-- most recently called themselves.
--
-- Anonymised applications have a null candidate_id, so they are excluded with
-- no filter needed. A candidate who deleted their data and then applied again
-- appears with a count covering only what came after; the earlier ones are
-- unlinkable by design and show up in the reconciliation figure instead.
-- ---------------------------------------------------------------------------
create or replace function public.admin_candidate_stats()
  returns table (
    candidate_id     uuid,
    full_name        text,
    roles_applied    integer,
    shortlisted      integer,
    not_selected     integer,
    first_applied_at timestamptz,
    last_applied_at  timestamptz,
    has_resume       boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select a.candidate_id,
         (select a2.full_name
            from public.applications a2
           where a2.candidate_id = a.candidate_id
           order by a2.created_at desc
           limit 1),
         count(*)::integer,
         count(*) filter (where a.status = 'shortlisted')::integer,
         count(*) filter (where a.status = 'not_selected')::integer,
         min(a.created_at),
         max(a.created_at),
         exists (select 1 from public.candidate_resumes cr
                  where cr.candidate_id = a.candidate_id)
    from public.applications a
   where a.candidate_id is not null
     and private.is_admin()
   group by a.candidate_id
   order by count(*) desc, max(a.created_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- 7. ONE CANDIDATE, WITH CONTACT DETAILS  --  the deliberate act
--
-- This is the only function in the stage that returns an email address, and it
-- needs a specific candidate id to do it. One row per application, with the
-- contact fields repeated: a single call rather than two, and the repetition
-- costs nothing at this size.
-- ---------------------------------------------------------------------------
create or replace function public.admin_candidate_detail(p_candidate_id uuid)
  returns table (
    application_id    bigint,
    job_id            bigint,
    job_title         text,
    company_name      text,
    applied_at        timestamptz,
    status            text,
    full_name         text,
    email             text,
    phone             text,
    notice_period     text,
    resume_updated_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select a.id, j.id, j.title, c.name, a.created_at, a.status,
         a.full_name, a.email, a.phone, a.notice_period, cr.updated_at
    from public.applications a
    join public.jobs j              on j.id = a.job_id
    left join public.companies c    on c.id = j.company_id
    left join public.candidate_resumes cr on cr.candidate_id = a.candidate_id
   where a.candidate_id = p_candidate_id
     and p_candidate_id is not null
     and private.is_admin()
   order by a.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 8. GRANTS -- the five reports to authenticated, each gating on is_admin()
--    itself. The two private helpers to nobody.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_report_totals()          from public;
revoke all on function public.admin_role_stats()             from public;
revoke all on function public.admin_recruiter_stats()        from public;
revoke all on function public.admin_candidate_stats()        from public;
revoke all on function public.admin_candidate_detail(uuid)   from public;

grant execute on function public.admin_report_totals()        to authenticated;
grant execute on function public.admin_role_stats()           to authenticated;
grant execute on function public.admin_recruiter_stats()      to authenticated;
grant execute on function public.admin_candidate_stats()      to authenticated;
grant execute on function public.admin_candidate_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. CHECKS -- every column must read PASS.
--
-- c5 is the reconciliation rule as arithmetic rather than as a claim: the
-- per-candidate counts plus the anonymised figure must equal the total. If
-- they ever disagree, one of the three is computing something different.
-- ---------------------------------------------------------------------------
select
  case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where p.proname in ('admin_report_totals','admin_role_stats',
                                  'admin_recruiter_stats','admin_candidate_stats',
                                  'admin_candidate_detail','working_days_between',
                                  'first_verified_at')
                and n.nspname in ('public','private')
                and p.prosecdef
                and exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                             where c = 'search_path=public, pg_catalog')) = 7
       then 'PASS' else 'FAIL — not all seven functions are definer and pinned' end
    as c1_seven_functions,

  case when has_function_privilege('authenticated','public.admin_report_totals()','EXECUTE')
        and has_function_privilege('authenticated','public.admin_candidate_detail(uuid)','EXECUTE')
        and not has_function_privilege('anon','public.admin_report_totals()','EXECUTE')
        and not has_function_privilege('anon','public.admin_candidate_detail(uuid)','EXECUTE')
       then 'PASS' else 'FAIL — the grants are wrong' end
    as c2_grants,

  case when (select count(*) from pg_proc p
              where p.proname = 'admin_candidate_stats'
                and pg_get_function_result(p.oid) not ilike '%email%') = 1
        and (select count(*) from pg_proc p
              where p.proname = 'admin_candidate_detail'
                and pg_get_function_result(p.oid) ilike '%email%') = 1
       then 'PASS' else 'FAIL — the list returns an email, or the detail does not' end
    as c3_email_only_on_the_detail,

  case when (select private.working_days_between(
               '2026-11-20 18:00+05:30'::timestamptz,   -- a Friday evening
               '2026-11-24 17:00+05:30'::timestamptz))  -- the Tuesday
            = 2
        and (select private.working_days_between(
               '2026-11-23 10:00+05:30'::timestamptz,   -- a Monday
               '2026-11-24 10:00+05:30'::timestamptz)) = 1
        and (select private.working_days_between(
               '2026-11-23 10:00+05:30'::timestamptz,
               '2026-11-23 18:00+05:30'::timestamptz)) = 0
       then 'PASS' else 'FAIL — the working-day count is wrong' end
    as c4_friday_signup_is_due_tuesday,

  case when (select coalesce(sum(roles_applied), 0) from public.admin_candidate_stats())
          + (select applications_anonymised from public.admin_report_totals())
          = (select applications_total from public.admin_report_totals())
       then 'PASS' else 'FAIL — the candidate counts and the total disagree' end
    as c5_reconciliation_adds_up,

  case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public','private') and p.prokind = 'f'
                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                                 where c like 'search_path=%')) = 0
       then 'PASS' else 'FAIL — an unpinned function exists' end
    as c6_all_search_paths_pinned;
