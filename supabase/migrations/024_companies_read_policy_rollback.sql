-- ===========================================================================
-- 024_companies_read_policy_rollback.sql
--
-- Puts public.companies back to readable by everyone.
--
-- RUN THIS IF A PUBLIC PAGE LOSES ITS EMPLOYER NAMES. The symptom to watch
-- for: a job card or job page showing a role with no company on it, or
-- Google's Rich Results Test reporting hiringOrganization missing. Both mean
-- the visitor policy is not matching where it should, and the open policy is
-- the safe state to return to while that is worked out.
--
-- WHAT IT GIVES UP: all 1,814 seeded company names become readable by
-- anonymous clients again.
--
-- The index is LEFT IN PLACE on purpose. It is useful regardless of the
-- policy, nothing depends on its absence, and dropping an index is the kind
-- of change that makes a rollback slower than the thing it is undoing.
-- ===========================================================================

drop policy if exists "anyone reads companies with a public role" on public.companies;
drop policy if exists "signed-in users read every company" on public.companies;

create policy "anyone reads companies"
  on public.companies
  for select
  to anon, authenticated
  using (true);

select
  case when count(*) filter (where policyname = 'anyone reads companies') = 1
            and count(*) filter (where cmd = 'SELECT') = 1
       then 'PASS' else 'FAIL — companies is not back to a single open read policy' end
    as rollback_restored_open_read,
  count(*) filter (where cmd = 'SELECT') || ' SELECT policies on public.companies' as detail
from pg_policies
where schemaname = 'public' and tablename = 'companies';
