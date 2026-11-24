-- ===========================================================================
-- 025_reset_eligibility.sql
--
-- public.reset_eligibility_for_email(text) -> text
--
-- The gate in front of the recruiter password reset. Takes an email address,
-- returns one of four words, and reveals nothing else:
--
--   'eligible'           send the reset
--   'role_not_eligible'  an account exists, but not one that may reset
--   'no_identity'        an eligible role with NO PASSWORD to reset
--   'none'               no account
--
-- The CALLER maps everything except 'eligible' to the same reply. The four
-- words exist so the checks below can tell the cases apart; the browser never
-- sees them.
--
-- WHY A FUNCTION AND NOT A QUERY IN THE ENDPOINT
--   supabase.auth.resetPasswordForEmail() runs in the browser with the
--   publishable key and sends to ANY existing account. It has no notion of a
--   role. So the decision has to sit server-side, and the lookup has to read
--   auth.users -- which no client may do.
--
-- IT RETURNS A VERDICT, NEVER A USER. No id, no email, no row. There is
-- nothing here to aim at a record it should not see, which is the whole of
-- its attack surface.
--
-- *** WHY THERE ARE TWO GATES AND NOT ONE ***
--
-- Rishi's condition, 24 Nov 2026: "Send a reset only if the email belongs to
-- an account with the recruiter role. Not 'only if the account has a
-- password' -- I plan to let community members join by email later, and at
-- that point the password test stops distinguishing anything. Role is the
-- condition that stays true."
--
-- Right, and role alone is not enough. INVARIANT I3: a signed-in person can
-- write their own user_metadata from the browser console, so a work-domain
-- Google account can forge account_type and end up with
-- user_roles.role = 'recruiter' and NO PASSWORD. The ROLE gate passes for
-- that account. Sending it a reset link would let a Google account acquire a
-- password -- the identity-linking risk from stage 3, and exactly what Rishi
-- named: "a community member who received a reset link could set a password
-- on a Google account, giving it a second sign-in method nobody asked for."
--
-- So: ROLE decides POLICY, and is widened by adding to eligible_roles below.
-- IDENTITY decides whether there is anything to reset at all, and is what
-- still holds when the policy is widened. Today both agree for all 2,656
-- accounts, so the second gate costs nothing now and is the one that matters
-- later.
--
-- A LATER STAGE MUST NOT COLLAPSE THIS TO THE ROLE TEST. See invariant I3.
--
-- WIDENING IT LATER IS ONE LINE: add the role to eligible_roles. That is why
-- the list is a declared array and not an `= 'recruiter'` comparison.
-- ===========================================================================

create or replace function public.reset_eligibility_for_email(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  -- THE POLICY, IN ONE PLACE. Add a role here to let it reset a password.
  eligible_roles text[] := array['recruiter'];

  v_user        uuid;
  v_has_password boolean;
  v_role        text;
begin
  if p_email is null or btrim(p_email) = '' then
    return 'none';
  end if;

  -- Normalised on both sides. Supabase lowercases at signup, but a recruiter
  -- typing their address into the reset form will not, and an address with a
  -- stray space pasted from a signature must behave identically.
  select u.id,
         (u.encrypted_password is not null and u.encrypted_password <> '')
    into v_user, v_has_password
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;

  if v_user is null then
    return 'none';
  end if;

  select ur.role into v_role
  from public.user_roles ur
  where ur.user_id = v_user;

  -- public.user_roles is SPARSE -- 2,652 of 2,656 accounts have no row at
  -- all -- so a missing row means ineligible by default. That is the feature:
  -- every community member is refused without anyone having to remember to
  -- write a rule for them.
  if v_role is null or not (v_role = any (eligible_roles)) then
    return 'role_not_eligible';
  end if;

  if not v_has_password then
    return 'no_identity';
  end if;

  return 'eligible';
end;
$$;

revoke all on function public.reset_eligibility_for_email(text) from public;
grant execute on function public.reset_eligibility_for_email(text) to service_role;
-- SERVICE_ROLE ONLY. Not anon, not authenticated.
--
-- If anon could call this, the function WOULD BE the enumeration oracle the
-- whole design exists to prevent: four distinct answers, one of which means
-- "this address has an account here". c1 asserts the absence of those grants
-- and is the most important check in this file.


-- ===========================================================================
-- CHECKS. One row per check, figures in `detail` whether it passed or failed.
--
-- FIXTURES ARE LOOKED UP BY ROLE, NEVER HARDCODED. No community member's
-- email address is written into a committed file.
-- ===========================================================================

create temporary table if not exists stage12_gate_checks (
  seq    integer primary key,
  label  text,
  result text,
  detail text
);

delete from stage12_gate_checks;


-- --- c1: definer, pinned, SERVICE_ROLE ONLY ------------------------------
insert into stage12_gate_checks (seq, label, result, detail)
with f as (
  select
    p.prosecdef                                               as definer,
    coalesce(array_to_string(p.proconfig, ' '), '(none)')     as cfg,
    pg_get_function_identity_arguments(p.oid)                 as args,
    pg_catalog.format_type(p.prorettype, null)                as rettype,
    has_function_privilege('service_role',  p.oid, 'execute') as svc,
    has_function_privilege('anon',          p.oid, 'execute') as anon_x,
    has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
    p.prosrc                                                  as body
  from pg_proc p
  where p.oid = 'public.reset_eligibility_for_email(text)'::regprocedure
)
select 1,
  'c1  definer, pinned, and callable by service_role ALONE',
  case when f.definer
            and f.cfg like '%search_path=public, pg_catalog%'
            and f.args = 'text'
            and f.rettype = 'text'
            and f.svc and not f.anon_x and not f.auth_x
            and f.body like '%eligible_roles%'
            and f.body like '%encrypted_password%'
       then 'PASS' else 'FAIL' end,
  'security definer: ' || f.definer
    || '  ·  proconfig: ' || f.cfg
    || '  ·  args: ' || f.args || '  ·  returns: ' || f.rettype
    || '  ·  service_role: ' || f.svc
    || '  ·  anon (MUST be false): ' || f.anon_x
    || '  ·  authenticated (MUST be false): ' || f.auth_x
    || '  ·  has a role list: ' || (f.body like '%eligible_roles%')
    || '  ·  has the identity gate: ' || (f.body like '%encrypted_password%')
from f;


-- --- c2 to c6: one verdict per persona -----------------------------------
do $$
declare
  v_recruiter text;
  v_member    text;
  v_admin     text;
  v_missing   text := 'no-such-address-check025@example.invalid';
  r_recruiter text;  r_member text;  r_admin text;  r_missing text;
  r_messy     text;
  v_messy     text;
begin
  select u.email into v_recruiter
  from auth.users u join public.user_roles ur on ur.user_id = u.id
  where ur.role = 'recruiter'
    and u.encrypted_password is not null and u.encrypted_password <> ''
  limit 1;

  -- A community member: a Google account with no user_roles row at all,
  -- which is 2,652 of the 2,656.
  select u.email into v_member
  from auth.users u
  where not exists (select 1 from public.user_roles ur where ur.user_id = u.id)
    and exists (select 1 from auth.identities i
                 where i.user_id = u.id and i.provider = 'google')
  limit 1;

  select u.email into v_admin
  from auth.users u join public.user_roles ur on ur.user_id = u.id
  where ur.role = 'admin'
  limit 1;

  if v_recruiter is null or v_member is null or v_admin is null then
    insert into stage12_gate_checks (seq, label, result, detail)
    values (2, 'c2-c6  one verdict per persona', 'FAIL',
            'NOT EXERCISED: a fixture is missing, so five checks did not run. '
              || 'recruiter with a password: ' || (v_recruiter is not null)
              || ', community member: ' || (v_member is not null)
              || ', admin: ' || (v_admin is not null)
              || ' — all three must be true');
    return;
  end if;

  r_recruiter := public.reset_eligibility_for_email(v_recruiter);
  r_member    := public.reset_eligibility_for_email(v_member);
  r_admin     := public.reset_eligibility_for_email(v_admin);
  r_missing   := public.reset_eligibility_for_email(v_missing);

  -- Upper-cased and padded. Supabase lowercases at signup; a recruiter
  -- typing their address will not, and a pasted one carries spaces.
  v_messy := '  ' || upper(v_recruiter) || '  ';
  r_messy := public.reset_eligibility_for_email(v_messy);

  insert into stage12_gate_checks (seq, label, result, detail) values
    (2, 'c2  a recruiter with a password is eligible',
     case when r_recruiter = 'eligible' then 'PASS' else 'FAIL' end,
     'verdict: ' || r_recruiter || ' (must be eligible)'),

    (3, 'c3  a community member is refused',
     case when r_member = 'role_not_eligible' then 'PASS' else 'FAIL' end,
     'verdict: ' || r_member || ' (must be role_not_eligible)'
       || '  ·  they have no user_roles row, which is how 2,652 accounts are '
       || 'refused without a rule being written for them'),

    (4, 'c4  an address with no account returns none',
     case when r_missing = 'none' then 'PASS' else 'FAIL' end,
     'verdict: ' || r_missing || ' (must be none, and DISTINCT from '
       || 'role_not_eligible so the two cases can be told apart here while '
       || 'the endpoint answers both identically)'),

    (5, 'c5  case and whitespace do not matter',
     case when r_messy = r_recruiter then 'PASS' else 'FAIL' end,
     'upper-cased and padded: ' || r_messy || '  ·  as stored: '
       || r_recruiter || ' (must match)'),

    (6, 'c6  the ADMIN is refused, so the list is a list',
     case when r_admin = 'role_not_eligible' then 'PASS' else 'FAIL' end,
     'verdict: ' || r_admin || ' (must be role_not_eligible — proving the '
       || 'gate reads eligible_roles rather than "any account that exists")');
end $$;


-- NOTE FOR THE NEXT PERSON WRITING ONE OF THESE: do not name a column or a
-- variable `current_role`. It is a reserved keyword and resolves to the
-- SESSION ROLE, silently, with no error -- a dry-run query for this migration
-- aliased a column that way and reported `supabase_read_only_user` where
-- 'candidate' was expected. The migration below uses v_was instead.


-- --- c7: THE FORGED-METADATA CASE, from invariant I3 ---------------------
-- An eligible ROLE with no password must return 'no_identity', not
-- 'eligible'. This is the one check that proves the second gate exists.
--
-- No such account exists today, so the check MAKES one -- by temporarily
-- changing the role on a TEST account and putting it back. Chosen because:
--
--   * it is iworkatgcctest2@gmail.com, the only user_roles row with role
--     'candidate', and a test account rather than a community member
--   * it is Google-only, so it genuinely has no password
--   * public.user_roles has NO TRIGGERS (checked), so an update fires nothing
--   * nothing is written to auth.users
--   * the whole migration is one transaction, so an abort anywhere undoes it
--
-- It restores the row before judging, so a failed check cleans up as well as
-- a passing one.
do $$
declare
  v_user     uuid;
  v_email    text;
  v_was      text;
  v_verdict  text;
  v_restored text;
begin
  select ur.user_id, u.email, ur.role
    into v_user, v_email, v_was
  from public.user_roles ur join auth.users u on u.id = ur.user_id
  where ur.role = 'candidate'
    and (u.encrypted_password is null or u.encrypted_password = '')
  limit 1;

  if v_user is null then
    insert into stage12_gate_checks (seq, label, result, detail)
    values (7, 'c7  an eligible role with no password is refused', 'FAIL',
            'NOT EXERCISED: no passwordless account with a user_roles row to '
              || 'borrow. Without this the second gate is unproven — do not '
              || 'skip it.');
    return;
  end if;

  update public.user_roles set role = 'recruiter' where user_id = v_user;

  v_verdict := public.reset_eligibility_for_email(v_email);

  update public.user_roles set role = v_was where user_id = v_user;

  select ur.role into v_restored
  from public.user_roles ur where ur.user_id = v_user;

  insert into stage12_gate_checks (seq, label, result, detail)
  values (7, 'c7  an eligible role with no password is refused',
          case when v_verdict = 'no_identity' and v_restored = v_was
               then 'PASS' else 'FAIL' end,
          'verdict with role=recruiter and no password: ' || v_verdict
            || ' (must be no_identity, NOT eligible)'
            || '  ·  role restored to: ' || coalesce(v_restored, '(null)')
            || ' (must be ' || v_was || ')'
            || '  ·  this is invariant I3''s account: role gate passes, '
            || 'identity gate refuses');
end $$;


-- --- the verdict ----------------------------------------------------------
insert into stage12_gate_checks (seq, label, result, detail)
select 99,
  'ALL CHECKS',
  case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
  count(*) || ' checks ran  ·  '
    || count(*) filter (where result = 'PASS') || ' passed  ·  '
    || count(*) filter (where result <> 'PASS') || ' failed'
from stage12_gate_checks
where seq < 99;


select label, result, detail
from stage12_gate_checks
order by seq;
