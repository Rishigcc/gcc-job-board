-- ===========================================================================
-- 009_service_role_grants.sql   --   stage 6, the grant migration 008 missed
--
-- THE BUG
--   Replacing a resume returned 502. The Vercel log said:
--
--     upload-resume: candidate_resumes upsert failed
--     code 42501, "permission denied for table candidate_resumes"
--
--   Migration 008 said the only writer of public.candidate_resumes is
--   /api/upload-resume under the service key -- and then never gave the
--   service key permission to write it. The lockdown was real; the one hole
--   it was supposed to leave open was not cut.
--
-- WHY IT WAS NOT OBVIOUS, AND WHY IT WILL HAPPEN AGAIN IF THIS IS NOT WRITTEN
--   In a default Supabase project, new tables in `public` inherit read and
--   write privileges for anon, authenticated and service_role, and the work
--   is in REVOKING them. This project is not a default project. Its default
--   privileges are:
--
--     for role postgres, schema public, tables:
--       postgres=arwdDxtm  anon=Dxtm  authenticated=Dxtm  service_role=Dxtm
--
--   Dxtm is TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. There is no `a`
--   (insert), `r` (select), `w` (update) or `d` (delete) in it. So a new
--   table in this project starts with NO data access for ANY of the three
--   API roles, service_role included, and every privilege has to be named.
--
--   That is a good default and it should stay. But it means:
--
--     *** A NEW TABLE THAT SERVER CODE HAS TO WRITE NEEDS AN EXPLICIT
--     *** GRANT TO service_role, IN THE SAME MIGRATION THAT CREATES IT.
--
--   The community tables already follow this: profiles carries an explicit
--   SELECT and UPDATE for service_role (the digest reads it and writes
--   digest state), questions/answers/hearts carry SELECT, and nothing
--   carries INSERT or DELETE. Migrations 007 and 008 both omitted it. 007
--   got away with it because no server code writes public.applications yet.
--
-- WHAT THIS GRANTS, AND WHAT IT DELIBERATELY DOES NOT
--   SELECT, INSERT, UPDATE on public.candidate_resumes -- exactly the three
--   things /api/upload-resume does: read the current row, write the new one,
--   repoint an existing one.
--
--   NOT DELETE. Nothing server-side deletes a resume row today. Stage 8's
--   delete-my-data does, and it can grant it then. Granting a privilege
--   before anything needs it is how a locked-down table quietly stops being
--   locked down.
--
--   NOTHING on public.applications. Stage 7 reads applications through
--   narrow SECURITY DEFINER functions, which run as their owner and need no
--   grant at all. If stage 7 or 8 ever needs direct service-key access, that
--   stage's migration adds it and says why.
--
--   service_role bypasses RLS, but it does NOT bypass triggers, so
--   private.candidate_resumes_guard() still pins every path to
--   ^<candidate_id>/ even on a service-key write.
--
-- ROLLBACK: 009_service_role_grants_rollback.sql
-- ===========================================================================

grant select, insert, update on public.candidate_resumes to service_role;

-- ---------------------------------------------------------------------------
-- CHECKS
--
-- Expect, in order:
--   a) sr_select / sr_insert / sr_update true, sr_delete FALSE
--   b) the audit: candidate_resumes is the only job-board table with any
--      service_role write privilege, and no table anywhere has sr_delete.
--      anon and authenticated are unchanged by this migration.
-- ---------------------------------------------------------------------------
select
  has_table_privilege('service_role','public.candidate_resumes','SELECT') as sr_select,
  has_table_privilege('service_role','public.candidate_resumes','INSERT') as sr_insert,
  has_table_privilege('service_role','public.candidate_resumes','UPDATE') as sr_update,
  has_table_privilege('service_role','public.candidate_resumes','DELETE') as sr_delete,
  has_table_privilege('authenticated','public.candidate_resumes','INSERT') as auth_insert,
  has_table_privilege('anon','public.candidate_resumes','SELECT')          as anon_select;

select c.relname as table_name,
       has_table_privilege('service_role','public.'||c.relname,'SELECT') as sr_select,
       has_table_privilege('service_role','public.'||c.relname,'INSERT') as sr_insert,
       has_table_privilege('service_role','public.'||c.relname,'UPDATE') as sr_update,
       has_table_privilege('service_role','public.'||c.relname,'DELETE') as sr_delete
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by 1;
