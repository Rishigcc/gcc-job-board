-- ===========================================================================
-- 018_verification_latency_fix.sql   --   the "not measured" safeguard did not
--                                         catch the case it was built for
--
-- WHAT RISHI FOUND
--   The Reports → Recruiters view showed iworkatgcctest1 as a 5-working-day
--   BREACH of the two-working-day promise, with "Not measured" reading 0.
--
--   That recruiter was really verified by hand in SQL on 16-19 Nov, before the
--   audit log existed. The only recorded verification is a test one from
--   23 Nov. So first_verified_at() found an audit row, called it the first
--   verification, and measured the gap from signup to a re-verification seven
--   days later.
--
--   The safeguard was built to report "not measured" exactly here, and it
--   failed to, because it tested whether an audit row EXISTS rather than
--   whether the row it found is the ORIGINAL event.
--
-- THE INFERENCE THAT FIXES IT
--   An account cannot be UNVERIFIED unless it was verified first. So if a
--   'recruiter_unverified' row precedes the earliest 'recruiter_verified' row,
--   the original verification happened before the log began -- and the gap to
--   the first recorded verification is not a measurement of anything.
--
--   Confirmed against the live data before writing this: audit row id 1 for
--   that recruiter is 'recruiter_unverified'.
--
--   This is not a workaround for test data. It is the correct general rule:
--   any account verified outside the audit log and later re-verified through
--   /admin produces exactly this pattern, and its original wait is genuinely
--   unmeasurable. Saying "not measured" is the honest answer; inventing 5
--   working days is not.
--
-- WHAT IT DOES NOT AND CANNOT FIX
--   A verification done in SQL that was never re-verified through /admin
--   leaves no trace at all, so it already reads as not measured -- correctly,
--   for the weaker reason that there is nothing to find.
--
--   And from here on the question disappears: every verification goes through
--   admin_set_recruiter_verified(), so the first audit row IS the first
--   verification. This matters only for accounts that predate migration 014.
--
-- ROLLBACK: 018_verification_latency_fix_rollback.sql
-- ===========================================================================

create or replace function private.first_verified_at(p_user uuid)
  returns timestamptz
  language sql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
  select case
    -- An unverify before the first recorded verify proves the account was
    -- already verified when the log started. Nothing here is measurable.
    when exists (
      select 1
        from public.admin_audit u
       where u.action = 'recruiter_unverified'
         and u.target_type = 'recruiter'
         and u.target_id = p_user::text
         and u.created_at < coalesce(
               (select min(a.created_at)
                  from public.admin_audit a
                 where a.action = 'recruiter_verified'
                   and a.target_type = 'recruiter'
                   and a.target_id = p_user::text),
               'infinity'::timestamptz)
    ) then null
    else (
      select min(a.created_at)
        from public.admin_audit a
       where a.action = 'recruiter_verified'
         and a.target_type = 'recruiter'
         and a.target_id = p_user::text
    )
  end;
$$;

revoke all on function private.first_verified_at(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- CHECKS
--
-- Impersonation as in 017: the reports gate on is_admin(), and the SQL editor
-- has no JWT, so without this they return nothing and the checks below could
-- not pass.
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

  -- The specific regression: a recruiter whose first audit row is an unverify
  -- must now be unmeasured rather than measured against the wrong event.
  case when (select count(*) from public.recruiter_profiles r
              where private.first_verified_at(r.user_id) is not null
                and exists (
                  select 1 from public.admin_audit u
                   where u.action='recruiter_unverified' and u.target_type='recruiter'
                     and u.target_id = r.user_id::text
                     and u.created_at < private.first_verified_at(r.user_id))) = 0
       then 'PASS' else 'FAIL — a pre-log verification is still being measured' end
    as c1_pre_log_verifications_unmeasured,

  -- No recruiter should now be reported as breaching the promise, because
  -- there is not yet a single verification that happened inside the log.
  case when (select verification_breached from public.admin_report_totals()) = 0
       then 'PASS'
       else 'FAIL — ' || (select verification_breached from public.admin_report_totals())
            || ' breach(es) reported, which cannot be real yet' end
    as c2_no_false_breach,

  -- And the honest total: one verified recruiter, nothing measurable about it.
  case when (select verification_measured from public.admin_report_totals()) = 0
        and (select verification_unmeasured from public.admin_report_totals()) >= 1
       then 'PASS'
       else 'FAIL — measured ' || (select verification_measured from public.admin_report_totals())
            || ', unmeasured ' || (select verification_unmeasured from public.admin_report_totals()) end
    as c3_reads_as_not_measured,

  case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public','private') and p.prokind = 'f'
                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                                 where c like 'search_path=%')) = 0
       then 'PASS' else 'FAIL — an unpinned function exists' end
    as c4_all_search_paths_pinned;
