-- ============================================================================
-- ROLLBACK for 003_recruiter_role_upgrade.sql
--
-- Restores the 001 version of the function: identical except that a user who
-- already has a role row keeps it (`do nothing` instead of `do update`).
--
-- Only useful if 003 turns out to be wrong. It does not undo any role row
-- that 003 already upgraded; to undo one of those, edit it in the dashboard.
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

  new.email_domain := auth_domain;

  if auth_domain = any(blocked) then
    raise exception
      'Free email providers cannot be used for recruiter accounts. Please sign up with your work email, or write to jobs@iworkatgcc.com.';
  end if;

  insert into public.user_roles (user_id, role)
  values (new.user_id, 'recruiter')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_recruiter() from public, anon, authenticated;
