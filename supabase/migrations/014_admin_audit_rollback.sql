-- ===========================================================================
-- 014_admin_audit_rollback.sql
--
-- Drops the admin functions and the audit log, and restores
-- purge_expired_applications() to its stage 8 form, which returns a count and
-- writes no audit row.
--
-- NOTE WHAT THIS DESTROYS: the audit log itself. Every record of who verified,
-- suspended, hid or anonymised anything goes with the table. If any of it has
-- happened for real, export it first:
--
--   select * from public.admin_audit order by created_at;
-- ===========================================================================

drop function if exists public.admin_log_orphan_deleted(uuid, text);
drop function if exists public.admin_anonymise_candidate_for(uuid, uuid);
drop function if exists public.admin_orphaned_resumes();
drop function if exists public.admin_rename_company(uuid, text, text);
drop function if exists public.admin_set_job_hidden(bigint, boolean);
drop function if exists public.admin_set_recruiter_suspended(uuid, boolean);
drop function if exists public.admin_set_recruiter_verified(uuid, boolean);

-- Back to the stage 8 version: no audit row.
create or replace function public.purge_expired_applications(p_limit integer default 5000)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  with doomed as (
    select a.id
      from public.applications a
      join public.jobs j on j.id = a.job_id
     where coalesce(j.closed_at, j.expires_at) < now() - interval '12 months'
     order by a.id
     limit greatest(coalesce(p_limit, 5000), 1)
  )
  delete from public.applications
   where id in (select id from doomed);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists private.audit(uuid, text, text, text, text, jsonb, jsonb, boolean);
drop table if exists public.admin_audit;

select count(*) as admin_functions_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'admin_%';
