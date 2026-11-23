-- ===========================================================================
-- 015_admin_guard_fix_rollback.sql
--
-- Removes both helpers. Running this returns the admin endpoints to the
-- broken state they were in: 502 for everyone, admin included. There is no
-- reason to run it except to reproduce that.
-- ===========================================================================

drop function if exists public.is_orphaned_resume(text);
drop function if exists public.is_admin_user(uuid);

select
  has_function_privilege('service_role','public.is_admin_user(uuid)','EXECUTE') as still_there;
