-- ===========================================================================
-- 020_job_saves_rollback.sql
--
-- Undoes 020_job_saves.sql. Only to be run if stage 10 round one is abandoned
-- before merge: it DROPS THE TABLE, so every saved role goes with it. There
-- is nothing in it that cannot be re-created by a candidate pressing Save
-- again, which is why there is no attempt to preserve the rows.
--
-- Nothing outside stage 10 depends on either object, so this leaves the
-- database exactly as migration 019 left it.
-- ===========================================================================

drop function if exists public.my_saved_jobs();

-- The policies and the index go with the table.
drop table if exists public.job_saves;

do $$
begin
  if exists (
    select 1 from pg_class
    where relname = 'job_saves' and relnamespace = 'public'::regnamespace
  ) then
    raise exception 'rollback FAIL: public.job_saves still exists';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_saved_jobs'
  ) then
    raise exception 'rollback FAIL: public.my_saved_jobs still exists';
  end if;

  raise notice 'rollback PASS  job_saves and my_saved_jobs are gone';
end $$;
