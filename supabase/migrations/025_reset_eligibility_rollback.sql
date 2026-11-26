-- ===========================================================================
-- 025_reset_eligibility_rollback.sql
--
-- Drops public.reset_eligibility_for_email(text).
--
-- RUN THIS ONLY WITH THE MATCHING DEPLOY. With the function gone the reset
-- endpoint's RPC errors, and the endpoint is written to treat an error as
-- INELIGIBLE -- so every reset request is refused and nobody is emailed.
-- That is the safe direction (no reset link reaches an account that should
-- not have one) but it is also a dead feature: a locked-out recruiter has no
-- way back in and no explanation. Roll the reset pages back with it.
--
-- NOTHING ELSE DEPENDS ON IT. It is read by one endpoint and by nothing in
-- the database: no policy, no view, no trigger, no other function.
-- ===========================================================================

drop function if exists public.reset_eligibility_for_email(text);

select
  case when not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'reset_eligibility_for_email')
       then 'PASS' else 'FAIL — the function is still there' end
    as rollback_dropped_the_function;
