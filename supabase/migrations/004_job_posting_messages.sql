-- ===========================================================================
-- 004 — readable messages for the job posting rules
--
-- WHAT THIS CHANGES
--   Adds ONE trigger function and ONE trigger. It creates no table, alters no
--   column, and changes no policy or grant. Nothing that already works can
--   behave differently afterwards.
--
-- WHY
--   The 10-live-roles cap has been enforced since migration 001, inside the
--   `active recruiters post own jobs` insert policy. That is the right place
--   for it: a policy cannot be bypassed by calling the API directly. But when
--   a policy refuses a row, Postgres says:
--
--       new row violates row-level security policy for table "jobs"
--
--   which tells a recruiter nothing. This trigger runs BEFORE the policy is
--   evaluated and raises a sentence a person can act on.
--
--   The policy stays exactly as it is and remains the real enforcement. The
--   trigger exists only to produce the message. If someone later drops the
--   trigger, the cap still holds; if someone later changes the trigger's
--   number, the cap still holds at 10. The two must be kept in step by hand,
--   which is why both say so in a comment.
--
-- ORDERING, WHICH IS THE WHOLE POINT
--   For an INSERT, Postgres fires BEFORE ROW triggers first and only then
--   applies the policy's WITH CHECK to the resulting row. So this trigger
--   gets to speak first.
--
-- WHAT YOU SHOULD SEE
--   "Success. No rows returned."
--
-- ROLLBACK
--   supabase/migrations/004_job_posting_messages_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The guard.
--
-- SECURITY DEFINER with a pinned search_path, and it lives in `private` for
-- the same reason every other helper does: `private` is not in the project's
-- exposed schemas, so none of this is reachable over the API.
--
-- IMPORTANT: do not add `private` to Settings -> API -> Exposed schemas.
-- ---------------------------------------------------------------------------
create or replace function private.jobs_cap_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  live_count int;
begin
  -- Only a recruiter posting their own job is capped.
  --
  -- An insert where posted_by is somebody else, or where there is no JWT at
  -- all (an admin working in the SQL editor, or a future service-role job),
  -- is not a recruiter using the form. The policy still decides whether such
  -- an insert is allowed; this trigger simply has nothing to say about it.
  if auth.uid() is null or new.posted_by is distinct from auth.uid() then
    return new;
  end if;

  -- A suspended recruiter would otherwise be refused by the policy's
  -- is_active_recruiter() check with the same opaque message. Say it plainly.
  -- Suspension is an admin action, so this should be rare and surprising,
  -- which is exactly when a clear message matters most.
  if exists (
    select 1 from public.recruiter_profiles
     where user_id = auth.uid() and is_suspended
  ) then
    raise exception
      'This recruiter account has been suspended, so it cannot post new roles. Write to jobs@iworkatgcc.com if you think this is a mistake.';
  end if;

  -- Verification lifts the cap. Checked per insert, so flipping is_verified
  -- in the dashboard takes effect on the recruiter's very next attempt with
  -- nothing to re-run and no cache to clear.
  if private.recruiter_is_verified(auth.uid()) then
    return new;
  end if;

  -- Counts only roles that are live AND unexpired, so closing a role or
  -- letting one lapse gives the slot back. Same helper the policy uses, so
  -- the two can never disagree about what "live" means.
  live_count := private.recruiter_live_job_count(auth.uid());

  -- KEEP THIS NUMBER IN STEP with the `< 10` in the policy
  -- "active recruiters post own jobs" in 001_job_board_foundation.sql.
  -- The policy is the enforcement; this is only the message.
  if live_count >= 10 then
    raise exception
      'You can keep 10 roles live at a time until your company is verified. Close a role, or let one expire, to free a slot. To lift the limit, reply to your signup email with your company website and GSTIN and we will verify you within two working days.';
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE resets a function's privileges, so re-revoke. Trigger
-- functions do not need EXECUTE granted to the calling role: Postgres invokes
-- them through the table, not through the caller. This is the same pattern as
-- private.handle_new_recruiter() in 001, which is proven to surface its
-- message to the browser.
revoke all on function private.jobs_cap_guard() from public, anon, authenticated;

drop trigger if exists jobs_cap_guard on public.jobs;

create trigger jobs_cap_guard
  before insert on public.jobs
  for each row
  execute function private.jobs_cap_guard();
