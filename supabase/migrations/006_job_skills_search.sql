-- ===========================================================================
-- 006_job_skills_search.sql
--
-- Make the skills list searchable.
--
-- THE PROBLEM
--   jobs.skills is text[]. PostgREST can test an array for containment
--   (skills=cs.{Snowflake}) but that is an exact, case-sensitive match on a
--   whole element. A candidate typing "snowflake" or "kubernetes" gets
--   nothing, and skill names are frequently the only place a technology is
--   named in a posting -- they appear in no description and no title.
--
-- WHY A COLUMN AND NOT A GENERATED COLUMN
--   The obvious answer is
--       add column skills_text text generated always as
--         (array_to_string(skills, ' ')) stored
--   and Postgres refuses it. A generated column's expression must be
--   IMMUTABLE, and array_to_string(anyarray, text) is marked STABLE --
--   because for an array of timestamptz the output depends on the session's
--   TimeZone and DateStyle. For text[] it is genuinely immutable, but the
--   marking is on the function, not on our use of it.
--
--   So this uses the pattern migration 001 already uses for updated_at: a
--   BEFORE trigger. Postgres checks privileges on a trigger function when
--   the trigger is CREATED, not when it fires, so nothing needs EXECUTE
--   granted and the function stays out of the API surface entirely.
--
-- CAN A RECRUITER WRITE IT?
--   No, twice over. The column is not in the INSERT or UPDATE grant lists
--   from migration 001, which name their columns explicitly -- so a new
--   column is unwritable by default. And the trigger overwrites it on every
--   insert and update regardless.
--
-- NO INDEX, DELIBERATELY. An ilike '%term%' cannot use a btree index, and a
-- trigram index needs the pg_trgm extension. At the scale this board will
-- run at for a long time a sequential scan over a few thousand short rows
-- is not measurable. Revisit if the jobs table passes ~50k rows.
--
-- WHAT IT CHANGES: adds one column, one function and one trigger. No policy,
-- no grant, no existing column altered.
--
-- ROLLBACK: 006_job_skills_search_rollback.sql
-- ===========================================================================

alter table public.jobs add column if not exists skills_text text;

create or replace function private.jobs_set_skills_text()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
begin
  new.skills_text := array_to_string(coalesce(new.skills, '{}'), ' ');
  return new;
end;
$$;

revoke all on function private.jobs_set_skills_text() from public, anon, authenticated;

drop trigger if exists jobs_set_skills_text on public.jobs;

create trigger jobs_set_skills_text
  before insert or update on public.jobs
  for each row execute function private.jobs_set_skills_text();

-- Backfill the rows that already exist. New rows are handled by the trigger.
update public.jobs
   set skills_text = array_to_string(coalesce(skills, '{}'), ' ')
 where skills_text is distinct from array_to_string(coalesce(skills, '{}'), ' ');

-- Check: expect zero rows out of step.
select count(*) as rows_out_of_step
  from public.jobs
 where skills_text is distinct from array_to_string(coalesce(skills, '{}'), ' ');
