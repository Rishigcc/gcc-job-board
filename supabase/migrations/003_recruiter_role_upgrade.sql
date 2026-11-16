-- ============================================================================
-- 003_recruiter_role_upgrade.sql
--
-- Fixes carried-forward item 3. In 001, handle_new_recruiter() did:
--
--     on conflict (user_id) do nothing
--
-- So a user who already had a row in user_roles kept whatever role it held.
-- Rishi has since decided one person may be both a candidate and a recruiter,
-- which makes that behaviour wrong: a candidate who signs up as a recruiter
-- would keep role 'candidate' and be locked out of every recruiter screen,
-- with no error to explain why.
--
-- Now it upgrades to 'recruiter', while never demoting an admin.
--
-- ADDITIVE ONLY. One function is replaced. No table, column, policy, trigger
-- or grant is created, altered or dropped. The trigger that calls this keeps
-- pointing at the same function name, so nothing else changes.
--
-- Rollback is in 003_recruiter_role_upgrade_rollback.sql.
-- ============================================================================

create or replace function private.handle_new_recruiter()
  returns trigger
  language plpgsql security definer
  set search_path = public, pg_catalog
as $$
declare
  auth_domain text;
  blocked text[] := array[
    'gmail.com','googlemail.com','outlook.com','outlook.in','hotmail.com',
    'hotmail.co.uk','live.com','live.in','msn.com',
    'yahoo.com','yahoo.co.in','yahoo.in','ymail.com','rocketmail.com',
    'rediffmail.com','rediff.com',
    'proton.me','protonmail.com','protonmail.ch','pm.me',
    'icloud.com','me.com','mac.com',
    'zoho.com','zohomail.com','zoho.in',
    'aol.com','yandex.com','yandex.ru',
    'mail.com','gmx.com','gmx.net','inbox.com','fastmail.com','tutanota.com'
  ];
begin
  select lower(btrim(split_part(email, '@', 2)))
    into auth_domain
    from auth.users
   where id = new.user_id;

  if auth_domain is null or auth_domain = '' then
    raise exception 'No confirmed account found for this recruiter profile';
  end if;

  -- A recruiter can never claim a domain they did not sign up with.
  new.email_domain := auth_domain;

  if auth_domain = any(blocked) then
    raise exception
      'Free email providers cannot be used for recruiter accounts. Please sign up with your work email, or write to jobs@iworkatgcc.com.';
  end if;

  -- Still the only code path that ever writes user_roles, and the only value
  -- it can write is 'recruiter'. 'admin' can only be inserted from the
  -- Supabase dashboard, and the WHERE clause below means this can never
  -- overwrite one.
  insert into public.user_roles (user_id, role)
  values (new.user_id, 'recruiter')
  on conflict (user_id) do update
     set role = 'recruiter'
   where user_roles.role <> 'admin';

  return new;
end;
$$;

-- Re-assert the privileges, since CREATE OR REPLACE resets them to the
-- default of EXECUTE for PUBLIC. The trigger fires regardless: Postgres
-- checks privileges on a trigger function when the trigger is created, not
-- when it runs.
revoke all on function private.handle_new_recruiter() from public, anon, authenticated;
