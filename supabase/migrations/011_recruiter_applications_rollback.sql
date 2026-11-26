-- ===========================================================================
-- 011_recruiter_applications_rollback.sql
--
-- Removes the four recruiter-facing functions. Nothing else to undo: this
-- migration added no table, no policy, no column and no grant on
-- public.applications, which is the whole point of it.
--
-- After this, /recruiter/jobs/:id/applications shows an error instead of a
-- list. No data is lost.
-- ===========================================================================

drop function if exists public.recruiter_set_application_status(bigint, text);
drop function if exists public.recruiter_resume_path(bigint);
drop function if exists public.recruiter_applications(bigint);
drop function if exists public.recruiter_application_counts();

select count(*) as recruiter_functions_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'recruiter_%';
