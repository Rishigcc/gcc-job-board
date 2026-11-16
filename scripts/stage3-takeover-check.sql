-- ===========================================================================
-- Stage 3 account-takeover check — RUN THESE IN THE SUPABASE SQL EDITOR.
--
-- The browser console script does the actions. This file gives the verdict,
-- because auth.users and auth.identities cannot be read from the browser.
--
-- Run section 0 FIRST and keep the output. Everything else is a comparison
-- against it.
-- ===========================================================================


-- ===========================================================================
-- SECTION 0 — the baseline. Run this before any test.
-- ===========================================================================

-- 0a. The shape of the project right now.
select
  count(*)                                                as total_users,
  count(*) filter (where encrypted_password is null)      as google_only_no_password,
  count(*) filter (where encrypted_password is not null)  as has_a_password,
  count(*) filter (where email_confirmed_at is null)      as unconfirmed
from auth.users;

-- Expected before any test: 2446 / 2444 / 2 / 0
-- The 2 with passwords are the community@ and feedback@ test recruiters.
-- unconfirmed MUST be 0. Anything else means a stale signup is already
-- sitting there.


-- 0b. Anyone with more than one sign-in method. Expected: zero rows.
select u.email,
       u.encrypted_password is not null as has_password,
       u.email_confirmed_at is not null as confirmed,
       string_agg(i.provider, ', ' order by i.provider) as providers,
       count(i.*) as identity_count
  from auth.users u
  join auth.identities i on i.user_id = u.id
 group by u.id, u.email, u.encrypted_password, u.email_confirmed_at
having count(i.*) > 1;


-- ===========================================================================
-- SECTION T1 — after running TEST = "T1" in the console.
--
-- You submitted a password signup for an address that already existed as a
-- Google-only account. The question: did anything change?
-- ===========================================================================

-- T1a. Replace the address with the one you targeted.
select id,
       email,
       created_at,
       updated_at,
       email_confirmed_at is not null as confirmed,
       encrypted_password is not null as has_password,
       confirmation_sent_at,
       (select count(*) from auth.identities i where i.user_id = u.id) as identity_count,
       (select string_agg(i.provider, ', ') from auth.identities i where i.user_id = u.id) as providers
  from auth.users u
 where email = 'PASTE_THE_T1_ADDRESS_HERE';

-- PASS looks like exactly this:
--   * ONE row only (no duplicate user was created)
--   * has_password            = false   <-- the decisive one
--   * identity_count          = 1
--   * providers               = google
--   * confirmation_sent_at    = null (or unchanged from before the test)
--
-- FAIL looks like:
--   * has_password = true   -> a password was attached to someone else's
--                              Google account. Real takeover path.
--   * two rows for the same email -> the uniqueness assumption is broken.


-- T1b. Re-run the 0a count. It must be IDENTICAL to the baseline.
select
  count(*)                                                as total_users,
  count(*) filter (where encrypted_password is null)      as google_only_no_password,
  count(*) filter (where encrypted_password is not null)  as has_a_password,
  count(*) filter (where email_confirmed_at is null)      as unconfirmed
from auth.users;


-- ===========================================================================
-- SECTION T2A — after running TEST = "T2A" in the console.
--
-- You pre-registered a password account on an address with no account yet,
-- and did NOT click the confirmation email.
-- ===========================================================================

select id,
       email,
       created_at,
       email_confirmed_at is not null as confirmed,
       encrypted_password is not null as has_password,
       (select count(*) from auth.identities i where i.user_id = u.id) as identity_count,
       (select string_agg(i.provider, ', ') from auth.identities i where i.user_id = u.id) as providers
  from auth.users u
 where email = 'PASTE_THE_T2_ADDRESS_HERE';

-- EXPECTED (this is the setup, not the bug):
--   confirmed      = false
--   has_password   = true
--   identity_count = 1
--   providers      = email
--
-- WRITE DOWN THE `id`. The whole test turns on whether it survives.

-- Also confirm it created no community or recruiter rows:
select 'profiles'           as tbl, count(*) from public.profiles           where id      = (select id from auth.users where email = 'PASTE_THE_T2_ADDRESS_HERE')
union all
select 'recruiter_profiles' as tbl, count(*) from public.recruiter_profiles where user_id = (select id from auth.users where email = 'PASTE_THE_T2_ADDRESS_HERE')
union all
select 'user_roles'         as tbl, count(*) from public.user_roles         where user_id = (select id from auth.users where email = 'PASTE_THE_T2_ADDRESS_HERE');

-- All three MUST be 0. An unconfirmed account must own nothing.


-- ===========================================================================
-- SECTION T2B — after the real owner signed in with GOOGLE on that address.
--
-- This is the decisive query in the whole file.
-- ===========================================================================

select u.id,
       u.email,
       u.created_at,
       u.email_confirmed_at is not null as confirmed,
       u.encrypted_password is not null as has_password,
       u.raw_user_meta_data ->> 'account_type' as account_type_metadata,
       u.raw_user_meta_data ->> 'recruiter_name' as recruiter_name_metadata,
       (select count(*) from auth.identities i where i.user_id = u.id) as identity_count,
       (select string_agg(i.provider, ', ' order by i.provider)
          from auth.identities i where i.user_id = u.id) as providers
  from auth.users u
 where u.email = 'PASTE_THE_T2_ADDRESS_HERE';

-- Read it against the id you wrote down in T2A.
--
-- OUTCOME A — SAFE, and the cleanest result.
--   The id is DIFFERENT from T2A. The pre-registered row was discarded and
--   the owner got a brand-new account. Nothing carried over.
--
-- OUTCOME B — SAFE, but worth knowing.
--   Same id, providers = 'google' only, has_password = FALSE. The rows were
--   merged and the attacker's password was dropped. Note that
--   account_type_metadata may still say 'recruiter' and recruiter_name may
--   still say 'Takeover probe' — metadata the attacker wrote, now sitting on
--   the owner's account. That is cosmetic here (our nav and routing read it,
--   but every real permission comes from user_roles and recruiter_profiles,
--   which the SQL above proves are empty). Tell me if you see it, because it
--   means an attacker can choose how a future member's account first behaves.
--
-- OUTCOME C — THIS IS A HOLE. Stop and report it.
--   Same id, providers include BOTH 'email' and 'google', and
--   has_password = TRUE. The attacker's password is now attached to a
--   confirmed account belonging to the real owner. Console test T2B will
--   have returned an access_token.


-- T2C. Did the Google sign-in enrol them in the community as normal?
select p.id, p.google_email, p.display_name, p.welcome_email_sent_at
  from public.profiles p
 where p.id = (select id from auth.users where email = 'PASTE_THE_T2_ADDRESS_HERE');

-- A row here with a non-null google_email is correct and expected: the owner
-- signed in with Google, so they are a community member. welcome_email_sent_at
-- will be set, because the existing community welcome email fired. That email
-- predates this project and is not one of the job board's sends.


-- ===========================================================================
-- CLEANUP after T2 — do this before the merge to main either way.
-- ===========================================================================

-- Delete the throwaway account from Authentication -> Users in the dashboard
-- (not with SQL — the dashboard removes the storage and identity rows too).
-- Then re-run section 0a and confirm you are back to the baseline numbers.
