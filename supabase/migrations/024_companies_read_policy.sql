-- ===========================================================================
-- 024_companies_read_policy.sql
--
-- public.companies stops being readable by everyone.
--
-- RISHI'S DECISION, 24 Nov 2026: option (a). A visitor may read a company
-- that has at least one public role; a signed-in user may read any of them.
-- Run BEFORE the 1,814-row seed, so there is never a window in which the
-- whole list is public -- "no reason to have a window where all 1,814 are
-- public when the ordering is free."
--
-- WHY NOT SIMPLY RESTRICT THE TABLE TO authenticated
--   Because /gcc-jobs and every job page are public and EMBED the company
--   name. PostgREST applies the policy to an embedded table too, so a
--   blanket restriction would show a signed-out visitor every role with no
--   employer on it -- and strip hiringOrganization out of the JobPosting
--   markup, which is one of Google's five REQUIRED properties.
--   buildJobPosting() refuses to emit anything without it, so the board
--   would quietly vanish from Google's job results. The thing being
--   protected is not the names on the roles we publish -- those are public
--   already -- it is the rest of the compiled list.
--
-- *** WHAT THIS IS NOT ***
--
--   THIS IS NOT PROTECTION OF THE LIST. Rishi's words, accepting the
--   caveat: "a Google sign-in is a speed bump, not a lock. I'm accepting
--   that -- the list isn't worth building a server-side search for today.
--   Record the caveat so the next person doesn't mistake (a) for
--   protection."
--
--   So, plainly: ANY community account can read all 1,814 rows, and anyone
--   can create one in seconds with a Google sign-in. This policy stops the
--   list being handed to anonymous crawlers and scrapers. It does not stop a
--   determined person, and it is not meant to.
--
--   If the list ever needs real protection, the shape is: keep this policy,
--   and replace the picker's direct table read with a security definer
--   search function that returns matches rather than letting a client page
--   through the table. That is deliberately NOT built today.
--
-- THE INDEX IS PART OF THE POLICY, NOT A SEPARATE TIDY-UP
--   The visitor policy runs `exists (select 1 from public.jobs where
--   company_id = ...)` for every candidate row, and public.jobs had NO INDEX
--   ON company_id -- checked, 24 Nov 2026. At 25 jobs and 2 companies that
--   is free; at 1,816 companies it is a sequential scan per row evaluated,
--   on the hottest read path the site has. The index is added here because
--   this migration is what starts depending on it.
-- ===========================================================================

drop policy if exists "anyone reads companies" on public.companies;

-- A visitor sees a company only through a role they can already see.
-- private.job_is_public() is the same function the "anyone reads public jobs"
-- policy uses, so the two cannot disagree about what "public" means. It is
-- SECURITY DEFINER and STABLE (verified), which is what lets it answer for
-- anon without anon being able to read recruiter_profiles.
create policy "anyone reads companies with a public role"
  on public.companies
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.company_id = companies.id
        and private.job_is_public(j.status, j.expires_at, j.posted_by)
    )
  );

-- Signed in, see the list. Policies are OR'd, so this is what keeps the
-- posting form's company picker working -- and the picker is only ever
-- rendered behind RecruiterRoute, so there is no signed-out state to design.
create policy "signed-in users read every company"
  on public.companies
  for select
  to authenticated
  using (true);

create index if not exists jobs_company_id_idx on public.jobs (company_id);


-- ===========================================================================
-- CHECKS. One row per check, figures in `detail` whether it passed or failed.
-- ===========================================================================

create temporary table if not exists stage10_company_checks (
  seq    integer primary key,
  label  text,
  result text,
  detail text
);

delete from stage10_company_checks;


-- --- c1: exactly the policies intended, and no leftover ------------------
insert into stage10_company_checks (seq, label, result, detail)
with p as (
  select
    count(*) filter (where policyname = 'anyone reads companies') as old_one,
    count(*) filter (where policyname = 'anyone reads companies with a public role'
                       and roles::text like '%anon%') as visitor,
    count(*) filter (where policyname = 'signed-in users read every company'
                       and roles::text = '{authenticated}') as member,
    count(*) filter (where cmd = 'SELECT') as select_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'companies'
)
select 1,
  'c1  the open policy is gone and the two new ones are in',
  case when p.old_one = 0 and p.visitor = 1 and p.member = 1
            and p.select_policies = 2
       then 'PASS' else 'FAIL' end,
  'old "anyone reads companies" (must be 0): ' || p.old_one
    || '  ·  visitor policy for anon (must be 1): ' || p.visitor
    || '  ·  signed-in policy, authenticated only (must be 1): ' || p.member
    || '  ·  SELECT policies altogether (must be 2): ' || p.select_policies
from p;


-- --- c2 and c3: what anon can actually read ------------------------------
-- THE CHECKS THIS MIGRATION EXISTS FOR, AND THEY NEED `set local role anon`.
-- The SQL editor runs as postgres, which has BYPASSRLS: a plain count here
-- would read every row and prove nothing. Setting the role is what puts the
-- policy in force.
--
-- c3 needs a company with NO public role, and today every company has one --
-- so it MAKES one, tests it, and removes it. Without that this migration's
-- protective half would be unproven at the moment it is applied, and the
-- seed that follows would be the first thing to exercise it.
do $$
declare
  v_expected   integer;
  v_anon_sees  integer;
  v_fixture    uuid;
  v_sees_fix   integer;
  v_auth_sees  integer;
  v_total      integer;
  v_failed     boolean := false;
  v_msg        text := '(none)';
begin
  select count(*)::integer into v_total from public.companies;

  -- What a visitor SHOULD see, computed with the policy's own condition.
  select count(*)::integer into v_expected
  from public.companies c
  where exists (select 1 from public.jobs j
                 where j.company_id = c.id
                   and private.job_is_public(j.status, j.expires_at, j.posted_by));

  -- A company with no jobs at all. Nothing references it, so it deletes
  -- cleanly, and the slug cannot collide with the seed list.
  insert into public.companies (name, slug)
  values ('[CHECK024] company with no roles', 'check024-no-jobs')
  returning id into v_fixture;

  begin
    set local role anon;
    select count(*)::integer into v_anon_sees from public.companies;
    select count(*)::integer into v_sees_fix from public.companies where id = v_fixture;
    reset role;

    set local role authenticated;
    select count(*)::integer into v_auth_sees from public.companies;
    reset role;
  exception when others then
    v_failed := true;
    v_msg := sqlerrm;
    reset role;
  end;

  delete from public.companies where id = v_fixture;

  insert into stage10_company_checks (seq, label, result, detail)
  values (2, 'c2  a visitor still sees every company behind a public role',
          case when not v_failed and v_anon_sees = v_expected
               then 'PASS' else 'FAIL' end,
          case when v_failed then 'could not impersonate: ' || v_msg else
            'anon sees: ' || v_anon_sees
              || '  ·  companies with a public role: ' || v_expected
              || '  ·  (must match, or job cards lose their employer and the '
              || 'JobPosting markup loses hiringOrganization)'
              || '  ·  rows in companies at the time: ' || v_total
          end);

  insert into stage10_company_checks (seq, label, result, detail)
  values (3, 'c3  a visitor does NOT see a company with no public role',
          case when not v_failed and v_sees_fix = 0 and v_auth_sees >= v_total
               then 'PASS' else 'FAIL' end,
          case when v_failed then 'could not impersonate: ' || v_msg else
            'anon sees the jobless fixture (must be 0): ' || v_sees_fix
              || '  ·  authenticated sees all ' || v_total || ' + the fixture: '
              || v_auth_sees || ' (must be at least ' || v_total || ')'
              || '  ·  fixture rows left behind: '
              || (select count(*) from public.companies where slug = 'check024-no-jobs')
              || ' (must be 0)'
          end);
end $$;


-- --- c4: the index the visitor policy leans on ---------------------------
insert into stage10_company_checks (seq, label, result, detail)
with i as (
  select coalesce(string_agg(indexname, ', '), '(none)') as idx
  from pg_indexes
  where schemaname = 'public' and tablename = 'jobs'
    and indexdef ilike '%company_id%'
)
select 4,
  'c4  public.jobs has an index on company_id',
  case when i.idx like '%jobs_company_id_idx%' then 'PASS' else 'FAIL' end,
  'indexes on jobs mentioning company_id: ' || i.idx
from i;


-- --- the verdict ----------------------------------------------------------
insert into stage10_company_checks (seq, label, result, detail)
select 99,
  'ALL CHECKS',
  case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
  count(*) || ' checks ran  ·  '
    || count(*) filter (where result = 'PASS') || ' passed  ·  '
    || count(*) filter (where result <> 'PASS') || ' failed'
from stage10_company_checks
where seq < 99;


select label, result, detail
from stage10_company_checks
order by seq;
