-- ===========================================================================
-- 021_delete_includes_saved_roles_rollback.sql
--
-- Restores public.anonymise_job_data_for(uuid) to its migration 013 shape:
-- two return columns, and no delete from public.job_saves.
--
-- Run this ONLY if the decision to include saved roles in "Delete my job
-- board data" is reversed. Note what it does and does not undo:
--
--   it DOES    stop future deletions from removing saved roles
--   it CANNOT  bring back saved roles already deleted -- the rows are gone,
--              which is the whole point of the feature
--
-- If this is rolled back, the privacy policy must be rolled back with it.
-- The policy is the promise; the function is only how the promise is kept.
-- ===========================================================================

drop function if exists public.anonymise_job_data_for(uuid);

create function public.anonymise_job_data_for(p_user uuid)
returns table (
  applications_anonymised integer,
  resume_path_removed     text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
  v_path  text;
begin
  if p_user is null then
    raise exception 'No user given.';
  end if;

  delete from public.candidate_resumes
   where candidate_id = p_user
   returning resume_path into v_path;

  update public.applications
     set candidate_id  = null,
         full_name     = null,
         email         = null,
         phone         = null,
         notice_period = null,
         anonymised_at = now()
   where candidate_id = p_user
     and anonymised_at is null;

  get diagnostics v_count = row_count;

  return query select v_count, v_path;
end;
$$;

revoke all on function public.anonymise_job_data_for(uuid) from public;
grant execute on function public.anonymise_job_data_for(uuid) to service_role;

select
  case when (select count(*) from pg_proc p
              where p.oid = 'public.anonymise_job_data_for(uuid)'::regprocedure
                and p.prosrc like '%job_saves%') = 0
       then 'PASS' else 'FAIL — the body still deletes from job_saves' end
    as rollback_removed_the_saved_roles_delete,
  case when array_to_string(
         (select proargnames from pg_proc p
           where p.oid = 'public.anonymise_job_data_for(uuid)'::regprocedure), ',')
       not like '%saved_roles_removed%'
       then 'PASS' else 'FAIL — the third column is still in the signature' end
    as rollback_restored_the_two_column_shape;
