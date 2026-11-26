-- ===========================================================================
-- 010_author_names.sql   --   public.question_authors, as its own piece
--
-- Not part of any stage. The Security Advisor has been flagging
-- "Security Definer View: public.question_authors" since before the job
-- board existed, and the question was whether it is actually a problem.
--
-- IS IT A PROBLEM? PARTLY -- AND NOT WHERE THE ADVISOR POINTS.
--
--   The view is:  select id, display_name from profiles;
--   Owned by postgres, no security_invoker, granted to anon and
--   authenticated. So it bypasses the "Users can view their own profile"
--   policy on profiles (auth.uid() = id).
--
--   That bypass is NECESSARY. The Q&A pages have to show who wrote what. No
--   policy on profiles can express "anyone may read the display name but
--   nothing else", because RLS is row-level: a policy that lets you read
--   someone's row lets you read every column of it. Column grants are the
--   tool for that, and profiles already grants `authenticated` the whole
--   table (arwdDxtm), so narrowing by column there would mean rewriting the
--   privileges of the table 2,400 community members depend on.
--
--   WHAT IS ACTUALLY WRONG IS THE SCOPE. It is called question_authors and
--   it returns every profile row -- 2,464 of them, 166 with a display name,
--   while only 97 people have ever asked, answered or hearted anything. So
--   76 people who set a display name and never posted were published to
--   anyone holding the public key. No email, no avatar, no contact detail:
--   a membership list, not a breach. But not what it says on the tin.
--
--   THE REAL RISK IS STRUCTURAL. A definer view silently ignores RLS, so
--   the next person to add a column -- `email`, for a "contact the author"
--   feature -- would publish 2,464 email addresses with nothing standing in
--   the way. The advisor is flagging the shape, not today's columns. That is
--   worth fixing before the shape gets reused.
--
-- WHAT THIS DOES
--
--   1. Adds public.author_names(uuid[]), a SECURITY DEFINER *function* that
--      resolves ids the caller already has. A function cannot be enumerated:
--      there is no `select *`, so you must already know the uuid to learn
--      the name. It is also the pattern this project already uses for
--      exactly this problem -- see public.job_posting_agency in 005.
--
--   2. Narrows the view, which the LIVE site still uses, to people with a
--      public presence and a display name. 2,464 rows becomes about 90.
--
-- WHY THE VIEW IS NOT DROPPED HERE
--   iworkatgcc.com is serving the main branch, and the main branch reads
--   this view. Dropping it now would replace every author name on the live
--   community with "Someone" until the job-board branch merges. So the
--   branch switches to the function, the view stays narrowed for production,
--   and supabase/post-merge/drop_question_authors.sql removes it AFTER the
--   merge. Until then the advisor will keep flagging it, correctly.
--
-- ROLLBACK: 010_author_names_rollback.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE FUNCTION
--
-- STABLE, not VOLATILE: it only reads. SECURITY DEFINER with a pinned
-- search_path, so `profiles` cannot be hijacked by a search_path trick.
--
-- It returns only ids that were asked for, and only those with a display
-- name -- a row with no name resolves nothing, so returning it would say
-- "this uuid is a registered user" and nothing else, which is precisely the
-- fact that should not leak.
-- ---------------------------------------------------------------------------
create or replace function public.author_names(p_ids uuid[])
  returns table (id uuid, display_name text)
  language plpgsql
  stable
  security definer
  set search_path = public, pg_catalog
as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  -- Nothing legitimate asks for hundreds at once: the largest real caller is
  -- the notifications bell. Guessing uuids is not feasible, so this is not
  -- the thing stopping enumeration -- it stops one request doing a lot of
  -- work, which is a different and much duller problem.
  if array_length(p_ids, 1) > 500 then
    raise exception 'Too many ids in one request.';
  end if;

  return query
    select p.id, p.display_name
      from public.profiles p
     where p.id = any (p_ids)
       and p.display_name is not null;
end;
$$;

revoke all on function public.author_names(uuid[]) from public;
grant execute on function public.author_names(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. NARROW THE VIEW THE LIVE SITE STILL READS
--
-- "Public presence" is anyone whose name the site already shows to someone:
-- question and answer authors, and people who hearted a question or an
-- answer (the notifications bell names them to the owner of the item). Every
-- id the live site resolves comes from one of those four tables, so nothing
-- it asks for disappears. Anyone outside the set would have resolved to
-- "Someone" anyway, because nothing displays them.
--
-- create or replace keeps the existing grants to anon and authenticated.
-- ---------------------------------------------------------------------------
create or replace view public.question_authors as
  select p.id, p.display_name
    from public.profiles p
   where p.display_name is not null
     and p.id in (
       select user_id from public.questions
       union
       select user_id from public.answers
       union
       select user_id from public.question_hearts
       union
       select user_id from public.answer_hearts
     );

comment on view public.question_authors is
  'DEPRECATED. Superseded by public.author_names(uuid[]) in migration 010. '
  'Still read by the main branch in production; drop it after the job-board '
  'branch merges, with supabase/post-merge/drop_question_authors.sql.';

-- ---------------------------------------------------------------------------
-- 3. CHECKS
--
-- Expect, in order:
--   a) the function exists, prosecdef true, with search_path pinned
--   b) rows_now much smaller than profiles_total, and equal to
--      with_presence_and_a_name
--   c) a sample resolution: the same ids through the view and the function
--      return the same names. same_result must be true.
-- ---------------------------------------------------------------------------
select p.proname, p.prosecdef, p.provolatile, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'author_names';

with presence as (
  select user_id from public.questions
  union select user_id from public.answers
  union select user_id from public.question_hearts
  union select user_id from public.answer_hearts
)
select
  (select count(*) from public.question_authors) as rows_now,
  (select count(*) from public.profiles)         as profiles_total,
  (select count(*) from public.profiles p
    where p.display_name is not null
      and p.id in (select user_id from presence)) as with_presence_and_a_name,
  (select count(*) from public.profiles p
    where p.display_name is not null
      and p.id not in (select user_id from presence)) as no_longer_enumerable;

with ids as (
  select distinct user_id as id from public.questions limit 20
)
select
  (select count(*) from public.question_authors v join ids on ids.id = v.id) as via_view,
  (select count(*) from public.author_names(array(select id from ids)))      as via_function,
  (select count(*) from public.question_authors v join ids on ids.id = v.id)
    = (select count(*) from public.author_names(array(select id from ids)))  as same_result;
