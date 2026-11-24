-- ===========================================================================
-- 022_live_job_count_rollback.sql
--
-- Drops public.live_job_count().
--
-- NOTHING ELSE IN THE DATABASE DEPENDS ON IT. It reads public.jobs and is
-- read by one place in the app: the promo card at the top of /jobs, which
-- decides whether to render at all from this number.
--
-- SO RUN THIS ONLY WITH THE MATCHING DEPLOY. With the function gone the RPC
-- returns an error, the card's state resolves to "hide", and /jobs loses the
-- card -- it does not break, because the card fails closed by design. But
-- the board then has no entrance from /jobs at all, which is the whole of
-- its findability. Roll the card back with it.
-- ===========================================================================

drop function if exists public.live_job_count();

select
  case when not exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'live_job_count')
       then 'PASS' else 'FAIL — the function is still there' end
    as rollback_dropped_the_function;
