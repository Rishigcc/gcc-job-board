-- ===========================================================================
-- 009_service_role_grants_rollback.sql
--
-- Puts public.candidate_resumes back to where migration 008 left it, which
-- is a state where replacing a resume returns 502. Only useful if migration
-- 008 itself is being rolled back -- and 008's rollback drops the table, so
-- this is really only here for completeness.
-- ===========================================================================

revoke select, insert, update on public.candidate_resumes from service_role;

select
  has_table_privilege('service_role','public.candidate_resumes','SELECT') as sr_select,
  has_table_privilege('service_role','public.candidate_resumes','INSERT') as sr_insert,
  has_table_privilege('service_role','public.candidate_resumes','UPDATE') as sr_update;
