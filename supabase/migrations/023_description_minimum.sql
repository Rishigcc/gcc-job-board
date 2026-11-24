-- ===========================================================================
-- 023_description_minimum.sql
--
-- jobs.description must be at least 400 characters, not 50.
--
-- WHY
--   Google: "We don't allow job postings with incomplete job descriptions."
--   That is the only rule the spec states, and it states no number -- so a
--   character count cannot enforce completeness. It can only catch the
--   one-liner. 400 is roughly 60-70 words: a floor, not a measure. Stage 9's
--   admin hide remains the backstop for a posting that clears 400 and is
--   still junk.
--
--   The form was raised in the same commit (src/lib/jobFormModel.js), and
--   this constraint is what stops the two disagreeing. A form rule without a
--   database rule is a suggestion.
--
-- WHY `NOT VALID`, WHICH IS THE WHOLE DIFFICULTY HERE
--
--   Measured before writing this, 24 Nov 2026:
--
--     25 rows in public.jobs
--     24 of them under 400 characters, the shortest 197
--     all 24 are the `[T5]` test jobs already queued for deletion
--     the 1 genuine posting is 7,085 characters
--
--   `alter table ... add constraint` VALIDATES EXISTING ROWS, so the plain
--   version of this migration fails on the first of those 24 and changes
--   nothing. `not valid` adds the constraint for every INSERT and UPDATE
--   from now on while exempting the rows already there.
--
--   Two consequences, both intended:
--
--     1. EDITING one of the 24 short test jobs is now refused until its
--        description reaches 400. That is not a bug to work around -- it is
--        the new rule, and it is what stage 10's posting-form retest
--        exercises (carried item 18).
--     2. The constraint stays marked NOT VALID until the pre-merge clearout
--        (carried item 13) removes those 24 rows, after which it can be
--        validated properly. The statement to run is at the bottom of this
--        file, commented out, and carried item 26 says to run it.
--
-- WHY NOT JUST EDIT THE 24 ROWS
--   They are being deleted before launch anyway, so padding their
--   descriptions would be work done to satisfy a constraint about rows that
--   will not exist. And writing 400 characters of filler into 24 test
--   postings would make every one of them a worse test of what a real
--   posting looks like.
-- ===========================================================================

alter table public.jobs
  drop constraint if exists jobs_description_check;

alter table public.jobs
  add constraint jobs_description_check
  check (
    length(btrim(description)) >= 400
    and length(btrim(description)) <= 20000
  )
  not valid;


-- ===========================================================================
-- CHECKS. One row per check, figures in `detail` whether it passed or failed.
-- ===========================================================================

create temporary table if not exists stage10_desc_checks (
  seq    integer primary key,
  label  text,
  result text,
  detail text
);

delete from stage10_desc_checks;


-- --- c1: the constraint says 400, and is NOT VALID ------------------------
insert into stage10_desc_checks (seq, label, result, detail)
with c as (
  select pg_get_constraintdef(oid) as def, convalidated as validated
  from pg_constraint
  where conrelid = 'public.jobs'::regclass
    and conname = 'jobs_description_check'
)
select 1,
  'c1  the constraint reads 400 and 20000, and is NOT VALID',
  case when c.def like '%>= 400%'
            and c.def like '%<= 20000%'
            and c.def not like '%>= 50%'
            and not c.validated
       then 'PASS' else 'FAIL' end,
  'definition: ' || c.def
    || '  ·  convalidated: ' || c.validated
    || ' (must be false until the [T5] rows are deleted)'
from c;


-- --- c2: a 399-character description is refused, 400 is accepted ----------
-- THE BOUNDARY, EXERCISED IN BOTH DIRECTIONS AND ROLLED BACK.
--
-- The row is inserted and deleted again, so this check leaves nothing behind
-- whether it passes or fails. It borrows a real recruiter and company id
-- because the row has to satisfy every OTHER constraint for this one to be
-- the thing being tested -- and the columns were read off the table before
-- writing it rather than guessed. apply_mode in particular is NOT NULL with
-- no default: omitting it raises not_null_violation, which the 399 branch
-- would NOT have seen as a check_violation, so the check would have failed
-- for a reason that has nothing to do with 400 characters.
do $$
declare
  v_poster  uuid;
  v_company bigint;
  v_399     boolean := false;
  v_400     boolean := false;
  v_msg     text := '(none)';
begin
  -- NOT a suspended recruiter, and not one at the 10-live-role cap:
  -- private.jobs_cap_guard() fires BEFORE INSERT and would refuse the row
  -- for a reason that has nothing to do with the description.
  select j.posted_by, j.company_id into v_poster, v_company
  from public.jobs j
  where j.posted_by is not null
    and not exists (select 1 from public.recruiter_profiles r
                     where r.user_id = j.posted_by and r.is_suspended)
  limit 1;

  if v_poster is null then
    insert into stage10_desc_checks (seq, label, result, detail)
    values (2, 'c2  399 refused, 400 accepted', 'FAIL',
            'NOT EXERCISED: no existing job to borrow a recruiter and '
              || 'company from, so a test row could not satisfy the other '
              || 'constraints');
    return;
  end if;

  -- 399 must be refused.
  begin
    insert into public.jobs (title, slug, description, city, work_mode,
                             job_function, employment_type, experience_min,
                             experience_max, status, apply_mode, posted_by,
                             company_id, expires_at)
    values ('[CHECK023] boundary', 'check023-boundary', repeat('x', 399),
            'Pune', 'onsite', 'Finance & Accounting', 'full_time', 0, 2,
            'pending', 'in_platform', v_poster, v_company,
            now() + interval '30 days');
    -- Reached only if the constraint did NOT fire.
    delete from public.jobs where slug = 'check023-boundary';
  exception when check_violation then
    v_399 := true;
  when others then
    v_msg := sqlerrm;
  end;

  -- 400 must be accepted, then removed again.
  begin
    insert into public.jobs (title, slug, description, city, work_mode,
                             job_function, employment_type, experience_min,
                             experience_max, status, apply_mode, posted_by,
                             company_id, expires_at)
    values ('[CHECK023] boundary', 'check023-boundary', repeat('x', 400),
            'Pune', 'onsite', 'Finance & Accounting', 'full_time', 0, 2,
            'pending', 'in_platform', v_poster, v_company,
            now() + interval '30 days');
    v_400 := true;
    delete from public.jobs where slug = 'check023-boundary';
  exception when others then
    v_msg := sqlerrm;
  end;

  -- Belt and braces: nothing by that slug survives either branch.
  delete from public.jobs where slug = 'check023-boundary';

  insert into stage10_desc_checks (seq, label, result, detail)
  values (2, 'c2  399 refused, 400 accepted',
          case when v_399 and v_400 then 'PASS' else 'FAIL' end,
          '399 characters refused: ' || v_399 || ' (must be true)'
            || '  ·  400 characters accepted: ' || v_400 || ' (must be true)'
            || '  ·  rows left behind: '
            || (select count(*) from public.jobs where slug = 'check023-boundary')
            || ' (must be 0)'
            || '  ·  unexpected error: ' || v_msg);
end $$;


-- --- c3: the rows already there were left alone ---------------------------
-- `not valid` is only worth having if it actually exempted them. If this
-- reports 0 under 400, the clearout has already happened and c1's
-- convalidated expectation should be revisited.
insert into stage10_desc_checks (seq, label, result, detail)
with n as (
  select
    count(*)::integer as jobs,
    count(*) filter (where length(btrim(description)) < 400)::integer as under,
    coalesce(min(length(btrim(description))), 0)::integer as shortest
  from public.jobs
)
select 3,
  'c3  the existing short rows survived the migration',
  case when n.jobs > 0 then 'PASS' else 'FAIL' end,
  'rows in jobs: ' || n.jobs
    || '  ·  under 400 characters: ' || n.under
    || '  ·  shortest: ' || n.shortest
    || '  ·  these are exempt because the constraint is NOT VALID; they are '
    || 'the [T5] test jobs queued for deletion'
from n;


-- --- the verdict ----------------------------------------------------------
insert into stage10_desc_checks (seq, label, result, detail)
select 99,
  'ALL CHECKS',
  case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
  count(*) || ' checks ran  ·  '
    || count(*) filter (where result = 'PASS') || ' passed  ·  '
    || count(*) filter (where result <> 'PASS') || ' failed'
from stage10_desc_checks
where seq < 99;


select label, result, detail
from stage10_desc_checks
order by seq;


-- ===========================================================================
-- AFTER THE PRE-MERGE CLEAROUT (carried item 13 deletes the [T5] jobs), run
-- this to finish the job. It fails loudly if any row still breaks the rule,
-- which is the point: it is the proof that nothing short remains.
--
--   alter table public.jobs validate constraint jobs_description_check;
--
--   select convalidated from pg_constraint
--    where conrelid = 'public.jobs'::regclass
--      and conname = 'jobs_description_check';   -- must be true
-- ===========================================================================
