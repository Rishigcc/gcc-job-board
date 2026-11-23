-- ===========================================================================
-- 017_admin_reporting_rollback.sql
--
-- Drops the five reports and the two private helpers. Nothing else to undo:
-- this migration added no table, no column, no policy and no grant on any
-- table -- it only reads.
--
-- After this, /admin's Reports tab shows errors. No data is lost.
-- ===========================================================================

drop function if exists public.admin_candidate_detail(uuid);
drop function if exists public.admin_candidate_stats();
drop function if exists public.admin_recruiter_stats();
drop function if exists public.admin_role_stats();
drop function if exists public.admin_report_totals();

drop function if exists private.first_verified_at(uuid);
drop function if exists private.working_days_between(timestamptz, timestamptz);

select count(*) as report_functions_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private')
   and p.proname in ('admin_report_totals','admin_role_stats','admin_recruiter_stats',
                     'admin_candidate_stats','admin_candidate_detail',
                     'working_days_between','first_verified_at');
