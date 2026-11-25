-- ===========================================================================
-- CARRIED ITEM 27, PROOF 6 -- the overflow fixture.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR. The MCP connection is read-only, so
-- this is yours to run; it returns a result table to read, like a migration.
--
-- WHY IT IS NEEDED. A job description now has STRUCTURE: a heading, a list
-- item and a paragraph are three different measurements, because the wrap
-- classes live on each block in JobDescription.jsx rather than on one <p>.
-- `check-overflow.mjs` measures the rendered page because a class can
-- compile, apply and still do nothing -- `break-words` was inert on a flex
-- child for a whole day in stage 10 -- and nothing it currently measures has
-- a long unbroken word INSIDE a heading or a list item:
--
--   * job 42's 180-character word is in its TITLE, not its description
--   * job 13's description is real Markdown but its longest word is 18
--
-- So this appends one 180-character unbroken word as a heading and one as a
-- list item, to job 42, which is the fixture that script already drives.
--
-- DRY-RUN, 25 Nov 2026: every check below was evaluated read-only against
-- live BOTH WAYS before this file was handed over -- as the row stands now,
-- and as it would stand after the update, simulated in a SELECT. The rule is
-- that a check meant to pass must be proven to pass, and four checks have
-- shipped broken on this project for want of it.
--
--   check                       now    after   verdict
--   c1 row exists                 1      1     passes both -- see note
--   c2 heading carries the word   0      1     CAN FAIL, will pass
--   c3 list item carries it       0      1     CAN FAIL, will pass
--   c4 longest unbroken word      4    180     CAN FAIL, will pass
--   c5 description length       599    968     passes both -- see note
--   c6 only this role touched     0      1     CAN FAIL, will pass
--   idempotence guard matches     1      0     re-running is a no-op
--
-- c1 AND c5 PASS BEFORE AND AFTER, deliberately. They are not asserting the
-- fixture; they are guarding the things that would make it meaningless: c1
-- that the row still exists at all (the clearout deletes it eventually), and
-- c5 that the description has not fallen under the 400-character minimum. A
-- check that cannot fail in THIS run is fine when what it guards can change
-- in another -- what is not fine is a check nobody has evaluated.
--
-- IT IS SAFE AND TEMPORARY. Job 42 is test data and the pre-merge clearout
-- deletes it (carried item 13). The description only grows, so the NOT VALID
-- check constraint on jobs.description is unaffected. Nothing else reads this
-- row. Rollback is at the bottom if you want it gone sooner.
-- ===========================================================================

update public.jobs
set description = description
      || E'\n\n## ' || repeat('trial', 36)
      || E'\n\n- '  || repeat('trial', 36)
where id = 42
  and description not like '%' || repeat('trial', 36) || '%';   -- idempotent

-- ---------------------------------------------------------------------------
-- The result table. One row per check, with the figures in `detail`.
-- ---------------------------------------------------------------------------
select
  'c1 the fixture row exists' as check,
  case when count(*) = 1 then 'PASS' else 'FAIL' end as result,
  'id 42, rows found: ' || count(*) as detail
from public.jobs where id = 42

union all
select
  'c2 a heading now carries a 180-character word',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  'matching rows: ' || count(*)
from public.jobs
where id = 42 and description ~ ('(^|\n)## ' || repeat('trial', 36))

union all
select
  'c3 a list item now carries a 180-character word',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  'matching rows: ' || count(*)
from public.jobs
where id = 42 and description ~ ('(^|\n)- ' || repeat('trial', 36))

union all
select
  'c4 the longest unbroken word is 180 characters',
  case when max(len) = 180 then 'PASS' else 'FAIL' end,
  'longest word: ' || max(len)
from (
  select length(w) as len
  from public.jobs j,
       regexp_split_to_table(j.description, '\s+') as w
  where j.id = 42
) t

union all
select
  'c5 the description is still above the 400-character minimum',
  case when min(length(description)) >= 400 then 'PASS' else 'FAIL' end,
  'length: ' || min(length(description))
from public.jobs where id = 42

union all
select
  'c6 no other role was touched',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  'roles containing the fixture word: ' || count(*)
from public.jobs
where description like '%' || repeat('trial', 36) || '%'

order by check;

-- ---------------------------------------------------------------------------
-- ROLLBACK, if you want the fixture gone before the clearout:
--
--   update public.jobs
--   set description = regexp_replace(
--         description,
--         E'\n\n## trial{180}\n\n- trial{180}$',   -- the exact appended block
--         ''
--       )
--   where id = 42;
--
-- Or simply leave it: the clearout deletes job 42 anyway, and
-- check-overflow.mjs needs a new fixture at that point regardless.
-- ---------------------------------------------------------------------------
