-- ============================================================================
-- ROLLBACK for 002_job_board_grants.sql
--
-- Returns the four tables to the state 001 left them in: readable by nobody
-- through the API. Running this does not damage anything, but it does make
-- every job board screen fail to load, so it is only useful alongside the
-- 001 rollback.
-- ============================================================================

revoke select on public.jobs              from anon, authenticated;
revoke select on public.companies         from anon, authenticated;
revoke select on public.recruiter_profiles from authenticated;
revoke select on public.user_roles        from authenticated;
