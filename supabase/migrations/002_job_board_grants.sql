-- ============================================================================
-- 002_job_board_grants.sql
--
-- Fixes the gap in 001: the four new tables were created with no SELECT
-- privilege for `anon` or `authenticated`, so every read was refused at the
-- privilege layer before row-level security was ever consulted.
--
-- WHY 001 MISSED IT
-- A stock Supabase project grants ALL on new public tables to anon and
-- authenticated by default, so a migration only has to take privileges away.
-- This project does not: its default privileges for new tables in `public`
-- were hardened to grant anon and authenticated only TRUNCATE, REFERENCES,
-- TRIGGER and MAINTAIN -- no SELECT, INSERT, UPDATE or DELETE. 001 assumed
-- the stock behaviour, so its REVOKE statements were no-ops and the only
-- privileges that ever existed were the per-column INSERT/UPDATE grants it
-- named explicitly. SELECT was never granted to anyone.
--
-- The failure was closed, not open: access was denied, never widened.
--
-- ADDITIVE ONLY. Four GRANT statements. No table, column, policy, function
-- or trigger is created, altered or dropped.
--
-- Rollback is in 002_job_board_grants_rollback.sql.
-- ============================================================================

-- Roles: SELECT only, and only for signed-in users. Never anon, and never
-- INSERT, UPDATE or DELETE for anybody. The "read own role" policy then
-- narrows this to the caller's own row.
--
-- user_roles is protected by two independent locks, and this grant removes
-- neither of them:
--   1. privilege  -- no INSERT/UPDATE/DELETE is granted here or in 001
--   2. policy     -- no INSERT/UPDATE/DELETE policy exists on the table
grant select on public.user_roles to authenticated;

-- Recruiter profiles: signed-in only. A recruiter sees their own row; an
-- admin sees all. Signed-out visitors get nothing, so company phone numbers
-- and email domains are never exposed to the public API.
grant select on public.recruiter_profiles to authenticated;

-- Companies and jobs are public reading surfaces. The job rows a signed-out
-- visitor can actually see are still narrowed by job_is_public(), which
-- enforces status, expiry and recruiter suspension.
grant select on public.companies to anon, authenticated;
grant select on public.jobs      to anon, authenticated;
