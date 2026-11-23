# Job board — test data created in production

Everything below was created in the **live** Supabase project while testing,
because migrations, Storage buckets and auth settings cannot be branched.
Clean this out before the final merge to `main`.

Status key: `LIVE` = still present, `CLEANED` = removed.

## Stage 1 — schema

| What | Where | How to remove | Status |
|---|---|---|---|
| Your admin row | `public.user_roles` | Delete the row whose `user_id` is yours | LIVE |
| Decoy `candidate` role row, pointed at a random real member | `public.user_roles` | n/a | CLEANED — deleted during stage 1 |
| `candidate` role row for your 2nd Google account | `public.user_roles` | `delete from public.user_roles where user_id = '<2nd account uid>';` | **LIVE — kept deliberately.** Rishi decided in stage 3 testing to keep it: it is the candidate persona for stages 6-8. Delete before merge. |
| Your 2nd Google test account | `auth.users` + `public.profiles` | Keep it — needed again for candidate testing in stages 6-8. Delete from Authentication → Users before launch. | LIVE — keep until stage 8 |

**Correction (stage 3 testing).** An earlier version of this file said the
`candidate` role row would be removed "at the end of stage 1", and the stage 3
checklist wrongly told Rishi to expect **two** rows in `user_roles`. The row was
never deleted and is useful, so the correct expectation from here on is:

| `user_roles` rows | Who | Status |
|---|---|---|
| `admin` | Rishi | LIVE |
| `candidate` | 2nd Google test account | LIVE — kept on purpose |
| `recruiter` × 2 | `community@` and `feedback@iworkatgcc.com` | LIVE |

So **four** rows after stage 3, not two.

The four job board tables are otherwise empty.

Note: signing in with the second Google account creates a `profiles` row,
which triggers the **existing** community welcome email to that address. That
is the welcome email that already ships today, not a new one, and it lands in
your own inbox.

## Stage 2 — policy pages

No database or test data created. Nothing to clean up.

## Stage 3 — recruiter accounts

**SIGNED OFF by Rishi, 18 November 2026.** Verified on the branch preview:
recruiter signup with the free-provider block, the single Brevo confirmation
email, the amber and green company-verification banners, the community nav
hidden in both the header and the footer, `/welcome` redirecting with no
flash, and both account-takeover tests. Commits `9382154`, `8da7cce`,
`f2ee13e`, `8a8e9b6`.


Two test recruiter accounts, both mailboxes Rishi owns and can read. Two
rather than one so we can prove recruiter A cannot read recruiter B's
applicants.

| What | Where | How to remove | Status |
|---|---|---|---|
| Test recruiter A — `community@iworkatgcc.com` | `auth.users`, `public.recruiter_profiles`, `public.user_roles` | Authentication → Users → delete. Cascades to both tables. | LIVE — created and confirmed 16 Nov 2026 |
| Test recruiter B — `feedback@iworkatgcc.com` | same | same | LIVE — created and confirmed 16 Nov 2026 |
| Stray `user_activity` row for `community@` | `public.user_activity` | `delete from public.user_activity where user_id = (select id from auth.users where email = 'community@iworkatgcc.com');` — or just delete the account, which cascades | LIVE — written before the ActivityTracker guard existed |
| Any companies, jobs and applications these two create | `public.companies`, `public.jobs`, `public.applications` | Delete the jobs first (applications cascade), then any company rows they created | PLANNED |

**Both accounts, and everything they create, get deleted before the merge
to `main`.** Nothing these accounts produce is real data.

Known wrinkles with these two addresses, both flagged to Rishi:

- Both are on `iworkatgcc.com`, so `recruiter_profiles.email_domain` is
  identical for both. That does not weaken the isolation test — a job is
  owned by `posted_by` (a user id), never by domain.
- `jobs@` is deliberately NOT a test account: it is the sender and
  reply-to on the recruiter signup email, and self-addressed mail through
  Brevo is a delivery problem not worth debugging.
- Mail still goes from `iworkatgcc.com` to `iworkatgcc.com` via an
  external relay, which is the classic shape for spam quarantine. Treat
  the **Brevo transactional log** as ground truth for "did we send it",
  not the inbox.
- `community@` is the sender on the existing welcome and digest emails.
  Using it as a recruiter test account is fine — recruiters get no
  `profiles` row, so neither of those emails can reach it.
- Do **not** sign in to the community side with either address via Google.
  If `iworkatgcc.com` runs on Google Workspace that would create a second
  identity on the same email and muddy every test.

### Stage 3 — account-takeover testing (settled 18 Nov 2026)

Enabling the email/password provider meant anyone could POST to
`/auth/v1/signup` with any address. 2,486 of the accounts on this project are
Google-only with no password, and several sit on real company domains that
pass the free-provider blocklist. Two tests, run with
`scripts/stage3-takeover-check.js` and `.sql`:

**T1 — password signup against an address that already exists as Google-only.
PASS.** HTTP 200, no session, `identities` length 0, and a *fabricated* user
id that matches no real row. The real row was untouched: `has_password` false,
one identity, provider google. No Brevo send. This is Supabase's documented
enumeration protection, and it means **all existing members are immune**.

**T2 — pre-register an unconfirmed password account, then have the real owner
sign in with Google. PASS, outcome B.** The merge kept the same user id
(`2db00631-…`) but Supabase wiped **both** the attacker's password and the
attacker's `user_metadata`:

| | after T2A (pre-registered) | after the owner's Google sign-in |
|---|---|---|
| `confirmed` | false | true |
| `has_password` | **true** | **false** |
| `providers` | email | google |
| `identity_count` | 1 | 1 |
| `account_type` metadata | recruiter | **null** |
| `recruiter_name` metadata | "Takeover probe" | **null** |

`signInWithPassword` with the attacker's password then returned 400
"Invalid login credentials".

This is better than the Supabase docs promise — they only commit to removing
the unconfirmed *identity*, and say nothing about the password or the
metadata. Both were cleared. The metadata-poisoning sub-case does not occur,
so no mitigation is needed and no cleanup cron is required. Item 11 closed.

While unconfirmed, the pre-registered account owned nothing: zero rows in
`profiles`, `recruiter_profiles` and `user_roles`.

**Note on baselines.** An earlier version of the `.sql` file hardcoded
`2446 / 2444 / 2 / 0` as the expected counts. That was wrong — this is a live
site and people join during testing (2,447 at the start of the stage 3
retest, 2,488 two days later). Always run section 0 on the day and compare
against that, never against a number written down earlier.

## Stage 4 — posting a job

| What | Where | How to remove | Status |
|---|---|---|---|
| Test job postings by the two recruiter accounts | `public.jobs` | `delete from public.jobs where posted_by in (select id from auth.users where email in ('community@iworkatgcc.com','feedback@iworkatgcc.com'));` | PLANNED |
| Company rows created while testing | `public.companies` | Delete the jobs first, then the company rows. **Companies are shared**, so check nothing else references one before deleting it. | PLANNED |
| `jobs_cap_guard` trigger + `private.jobs_cap_guard()` | database | `supabase/migrations/004_job_posting_messages_rollback.sql` — but keep it, it is product behaviour, not test scaffolding | LIVE after migration 004 |

Notes for testing:

- **Use obviously fake company names.** New tables are published to the
  production API the moment they exist, so a test job is readable by anyone
  holding the public key even though no production page links to it. "Test Co
  A" is fine; a real GCC's name is not.
- Reaching the 10-live-roles cap needs **10 live roles on one unverified
  account**. They can be thin — the only long field is the description, at 50
  characters minimum.
- A job cannot be deleted through the UI by design: there is no DELETE grant
  on `public.jobs` for `authenticated`. Closing is the recruiter's action;
  deleting is yours, in the SQL editor.

### Stage 4 — first test round, 18 Nov 2026

Rishi tested the whole of stage 4 and everything passed, including the cap
test (HTTP 400, `P0001`, our own sentence, not the RLS message). Nine UI
issues and one design change were raised. All were fixed in the same stage.

| # | Issue | Resolution |
|---|---|---|
| 1 | Checklist said 8 fields need attention on an empty submit; the form says 7 | My count was wrong, not the form. Later checklists state the rule, not the number. |
| 2 | Page did not scroll to the first error | **Real bug.** `data-invalid` was passed to `<Field>` as a prop and `Field` never put it on a DOM node, so `querySelector("[data-invalid='true']")` matched nothing. The attribute is now on the wrapper `<div>`. |
| 3 | Experience from/to inputs vertically misaligned | Hints moved from above the control to below it. Labels are one line everywhere, so paired fields in a grid now line up by construction. Also fixed Location vs Work mode, which had the same fault unreported. |
| 4 | Error messages did not clear when a field was fixed | Errors were held in `useState` and only recomputed on submit. They are now derived — `const errors = touched ? validateJob(values) : {}` — so they cannot go stale. |
| 5 | Enter submitted the whole form | Form-level `onKeyDown` blocks Enter unless the target is a `<textarea>` or a `<button>`. |
| 6 | No confirmation before posting | Two-step: **Review this role** → summary panel (title, hiring company with a new/existing badge, location, function) → **Confirm and publish**. On edit the panel appears only when the hiring company changed. |
| 7 | Public link preview under the job title | Removed. |
| 8 | Grey slot counter did not mention that verification lifts the limit | It does now. |
| 9 | Dropdown type-ahead appeared not to work | **Cause: the `Choose…` placeholder.** Browsers' native type-ahead walks option *text*, so the letter C matched "Choose…" before Cybersecurity or Coimbatore. The placeholder is now `disabled`, which type-ahead and the arrow keys skip. |
| 10 | Free-text hiring company fragments the company table | **Replaced with a picker.** See below. |

### Stage 4 — the hiring company picker (issue 10)

`src/components/CompanyPicker.jsx`. Typing searches `public.companies`
server-side (debounced, `ilike`, 8 results). Typing resolves to **nothing**:
the recruiter must either click an existing company or click
"Add *name* as a new company", and `validateJob` refuses to submit until one
of those has happened. The review panel then restates which it was.

**Correction to something I told Rishi earlier.** I said slug matching meant
"HSBC" and "H.S.B.C." resolved to one row. That was wrong: `slugify` turns
every run of non-alphanumerics into a hyphen, so they became `hsbc` and
`h-s-b-c`. There is now a separate `companySlug()` which deletes in-word
punctuation first, so they do collide. But the wider point stands — no slug
rule can know that "Walmart Global Tech India" and "Walmart" are one
employer. The picker is the fix; the slug is only a spelling backstop.

**Seeding.** `scripts/build-company-seed.mjs` turns a plain list of names
into `supabase/migrations/005_seed_companies.sql`, deduplicating by
`companySlug` and printing every collision for a human to settle. Input
format: UTF-8 text, one company name per line, no header, no numbering,
written exactly as it should display. The migration is data-only and
`on conflict (slug) do nothing`, so it is safe to run twice and will never
overwrite a name a recruiter created. **Note that `public.companies` is
readable by `anon`, so seeded names are on the public API immediately.**

### Stage 4 — second test round, 18 Nov 2026

One real failure, two cosmetic, two new requests. All fixed.

| # | Issue | Resolution |
|---|---|---|
| 1 | **The duplicate backstop did not work.** Typing `test co a.` returned "no company matches" and offered to create a duplicate. | **Real failure, and the one that mattered.** `companySlug()` was applied at insert time but not at search time, so a collision could only be found by causing it. The picker now runs **two** queries — `name ilike %term%` **and** `slug ilike %companySlug(term)%` — merges them, and sorts an exact slug match to the top. Verified against the live table: the name query returns nothing for `test co a.`, the slug query returns Test Co A. |
| 2 | Prefill fired against an empty companies table | My description was wrong, not just the code: only the *id* was conditional, the *name* was always prefilled. That is how the stray `iworkatgcctest1` row was created. **Prefill dropped entirely**, per Rishi — for an agency their own company is never the hiring company. |
| 3 | `\u2014` rendered as literal text under "Post a role" | JSX text is not a JS string literal, so the escape never ran. One instance; the two in `jobFormModel.js` are inside real string literals and were always correct. |
| 4 | Location type-ahead: `c` → Chennai, `c` → Chandigarh, third press nothing | **Not fixed, by agreement.** Native macOS select behaviour. The bug that *was* ours — the enabled `Choose…` placeholder swallowing the first keystroke — is fixed. Replacing native selects with custom components would be worse on phones and for screen readers. |
| R1 | Remove the external-apply option | Done. The radio group is gone and `insertPayload()` pins `apply_mode` to `in_platform` and `external_url` to null. **`jobs.apply_mode` and `jobs.external_url` deliberately stay in the schema**, so reversing this is a form change and never a migration. |
| R2 | Warn before losing a half-filled form | `src/lib/useUnsavedChanges.js`. See the limit below. |

**Known limit of the unsaved-work warning: the browser Back button is not
covered.** Blocking it needs React Router's `useBlocker`, which only works
on a data router (`createBrowserRouter`). This app uses `<BrowserRouter>`
with `<Routes>`, so `useBlocker` throws. Converting the app to a data router
touches every route on the site, community pages included, and is not a
change to make from inside the posting form. Links, the logo, Cancel, tab
close and reload are all covered.

**Known limit of the company search:** it matches on the name, and on the
slug of what was typed. It will not connect a name typed with the word
breaks removed — `testcoa` does not find `Test Co A` — because that slug has
no hyphens to match. Punctuation, casing and spacing are all handled.

### Stage 4 — still to clean up before the merge

- **All test jobs** in `public.jobs`, from both test rounds.
- **All company rows** created while testing — `Test Co A`, `Test Co B`, and
  anything else added through the picker. `iworkatgcctest1` was deleted
  during the second round.
- Deletion SQL is in the table above. **Jobs first, then companies**, because
  of the foreign key. No DELETE grant on `public.jobs` for `authenticated`,
  so this is Rishi's to run in the SQL editor.

### Stage 4 — SIGNED OFF 18 Nov 2026

Three test rounds. Commits `bb66739`, `a6040af`, `6d9729e`, `5f8f9ec`.

Round one passed everything including the cap test and raised nine UI
issues plus the hiring-company redesign. Round two found the one failure
that mattered — the duplicate backstop searched names but normalised slugs,
so a collision could only be discovered by causing it. Round three passed
clean.

Rishi's decisions recorded at sign-off:

- **Browser Back button: do not schedule the router change.** Converting to
  a data router rewrites routing for every page including the community
  pages ~2,492 people use daily, to close a gap on one button in one form
  in a feature that is not live. Revisit after merge, on its own.
- **Same-name message: keep the add button suppressed.** A rare recruiter
  emailing about a genuine collision costs one reply; duplicate company
  rows cost admin work forever.
- Applications are in-platform only. `apply_mode` and `external_url` stay
  in the schema so this is reversible without a migration.

Test data deliberately **kept** for stage 5, because the candidate side
needs live roles to browse:

| Row | Note |
|---|---|
| `Test Co A` | company, 0 jobs |
| `Test Co B` | company, 1 live job |

The Walmart company row and its test job were deleted during round three —
a real company name should not sit in the table as a test artifact. Both
Test Co rows and every test job still go before the merge.

## Stage 5 — public jobs page and job detail

| What | Where | How to remove | Status |
|---|---|---|---|
| 24 sample roles, titles prefixed `[T5]` | `public.jobs` | `delete from public.jobs where title like '[T5]%';` | PLANNED |
| `public.job_posting_agency(bigint)` | database | `supabase/migrations/005_public_job_detail_rollback.sql` — but keep it, it is product behaviour | LIVE after migration 005 |
| Roles posted through the form while testing | `public.jobs` | `delete from public.jobs where posted_by in (select id from auth.users where email in ('community@iworkatgcc.com','feedback@iworkatgcc.com'));` | PLANNED |

Notes:

- **The 24 sample roles are inserted in the SQL editor, not through the
  form.** Run there you are the `postgres` role, so the insert policy, the
  column grants and the cap trigger are all bypassed — the trigger checks
  `auth.uid()`, which is null in the editor. That is fine, and deliberate:
  posting 24 roles by hand would re-prove stage 4 and nothing else. They are
  scenery for the candidate side.
- They all carry the `[T5]` prefix so one `like` clause removes every one.

### Stage 5 — why the posting agency needed a migration

`recruiter_profiles` is granted to `authenticated` only, and its read policy
narrows that to the recruiter's own row plus admins — the same row carries
their phone number and email domain. So the agency name could not be
reached by a join from a public job. Migration 005 adds
`public.job_posting_agency(bigint)`, which returns that one field and only
for a job the caller can already see.

Rejected alternatives, for the record: a view that bypasses RLS (flagged by
Supabase's own security advisor, and easy to widen later) and a
denormalised `posting_agency` column on `jobs` (goes stale the moment a
recruiter corrects their own company name).

### Stage 5 — one thing checked and found to be a non-issue

`jobs.posted_by` is readable by `anon`, because the select grant on `jobs`
is table-wide. That looked like it could link a recruiter's user id to their
community identity. It cannot: `public.profiles` has no grant to `anon` at
all, and its select policy for `authenticated` is `auth.uid() = id`, so even
a signed-in candidate can read only their own row. The uuid joins to
nothing. No change made.

### Stage 5 — SIGNED OFF 18 Nov 2026

Everything passed on the first test round. Four changes were made after
sign-off and are verified in Part 0 of the stage 6 checklist.

| # | Change | Note |
|---|---|---|
| 1 | Numbered pagination | Reuses `src/components/Pagination.jsx`, the component the collated `/jobs` page already uses. Two job lists on one site should not paginate in two shapes. |
| 2 | Skills searchable | Needed **migration 006**. `jobs.skills` is `text[]`, and PostgREST can only test an array for containment — an exact, case-sensitive match on a whole element — so "snowflake" matched nothing while "Snowflake" sat in the list. |
| 3 | Detail sidebar fills the card | `h-full` on the panel inside the stretched grid column. |
| 4 | Salary row always on the detail page | "Not disclosed" where there is none. **Cards unchanged** — the same row twenty times down a list is noise. |

Rishi's decisions at sign-off:

- **Filters are Location, Function and Experience band** — not work mode.
  GCC roles are overwhelmingly on-site or hybrid so a work-mode filter
  barely splits the set, and ~75% of the audience is early to mid career,
  where experience is the first screen. Bands overlap by design: a 3–8 year
  role appears in both 3–5 and 6–10. Work mode may become a fourth filter
  later. Built, with overlap tested in `scripts/stage5-display-test.mjs`.
- **`/gcc-jobs` is not linked in the nav yet.** Linking a near-empty page
  from the header makes the board look dead while he is recruiting
  recruiters. Revisit at five or more real direct postings, roughly when
  stage 10 makes these pages indexable; the two nav labels get settled then.

A correction to my own checklist: step 13 said "snowflake" appeared in a
skills list **and a description**. It appears only in the skills list. The
code was right and the expectation was wrong.

**Design: do not invent a visual identity.** Rishi has one — muted plum,
mauve and warm rose with amber accents, as used on the LinkedIn and YouTube
banners — and will supply exact colours at a design stage after stage 10.
Until then, plain and consistent.

## Stage 6 — applying

| What | Where | How to remove | Status |
|---|---|---|---|
| Test applications | `public.applications` | `delete from public.applications;` — there are none from real people yet | PLANNED |
| Uploaded test resumes | Storage → `resumes` bucket | Delete the folders by hand in the dashboard. Deleting an application row does **not** delete its file. **Includes orphans from the failed replace attempts before migration 009** — the upload succeeded and the row write failed, so those objects are referenced by nothing. The endpoint now cleans up after itself on that path, but the ones already there predate the fix. | PLANNED |
| `applications` table, `resumes` bucket, two `private` functions | database | `supabase/migrations/007_applications_rollback.sql` — keep them, this is the product | LIVE after migration 007 |
| Resumes on file | `public.candidate_resumes` | `delete from public.candidate_resumes;` **then** delete the objects in Storage by hand. Deleting the row does not delete the file. | PLANNED |
| `candidate_resumes` table + guard | database | `supabase/migrations/008_candidate_resumes_rollback.sql` — keep it, this is the product | LIVE after migration 008 |

Notes:

- **Use a throwaway PDF.** Anything uploaded is on production storage.
- **Delete order:** rows first, then the files, because nothing cascades
  from the row to the object. Stage 8's delete-my-data does both; doing it
  by hand here does not.
- The test Gmail community account is the candidate for this stage. It is
  already on the carried-forward list for deletion before the merge
  (item 5); its applications and resume go with it.

### Stage 6 — how "a recruiter never receives candidate data" is enforced

`public.applications` has **no select policy mentioning recruiters**. Not a
narrowed one — none. There is no row a recruiter can read, so there is no
column to leak, and that is far easier to verify than any policy would be:
a recruiter calling `/rest/v1/applications` with the public key gets `[]`
whatever they ask for. Stage 7 gives them what they are allowed to see
through narrow functions returning only permitted columns; it must not
widen this table.

Resumes: the `resumes` bucket is private and **has no policies on
`storage.objects` at all**, so no client role can read or write it. Every
upload goes through `/api/upload-resume` under the service key; every
future download will be a short-lived signed URL minted server-side.

### Stage 6 — one resume per candidate (migration 008)

**This reverses a spec line, on purpose.** Migration 007 stored a resume path
on every application, so an application recorded exactly what was sent that
day. Rishi's decision, 18 Nov 2026: candidates should not re-upload for every
role. The resume now lives on the candidate — one row in
`public.candidate_resumes` — and every application points at whatever is
current.

**The trade-off, accepted knowingly.** A recruiter who shortlisted someone in
March and opens the file in May may be reading a different document. The
mitigation is `candidate_resumes.updated_at`, shown as "Resume updated on
&lt;date&gt;" beside the recruiter's download in stage 7. There is no silent
substitution: the date is always on screen next to the file.

**Nothing writes this table from a browser.** No insert, update or delete
policy and no write grant — only `/api/upload-resume` under the service key,
which has already read the file's first bytes and built the path from a
verified user id. `private.candidate_resumes_guard()` is the second lock: the
service key bypasses RLS but not triggers, and the trigger pins every path to
`^<candidate_id>/`.

**Replacing deletes the old object**, but only after the row has been
repointed. A failed delete leaves an orphan nobody can reach; a delete in the
other order would lose a live resume.

**An application still cannot exist without a resume.** That used to be the
`not null` on `applications.resume_path`, which migration 008 drops. It is now
`private.applications_guard()` refusing an INSERT by a candidate with no
`candidate_resumes` row — on INSERT only, because stage 8 anonymises by UPDATE
after the resume is gone.

**Stage 7 owes this:** the "Resume updated on &lt;date&gt;" line beside the
download. The data is in place; there is no recruiter-facing UI yet to put it
in.

**Stage 8 owes this:** a standalone "my resume" control, so replacing it does
not require opening a job. Today the only place to manage it is the apply
form.

### Stage 6 — the grant migration 008 forgot (migration 009)

**This is the trap most likely to bite stages 7 to 10, so it is written here
rather than only in the migration.**

Replacing a resume returned 502. The Vercel log: `42501, permission denied
for table candidate_resumes`. Migration 008 said the only writer was
`/api/upload-resume` under the service key, then never granted the service
key anything.

**Why it was not obvious.** In a default Supabase project, a new table in
`public` inherits read and write for `anon`, `authenticated` **and**
`service_role`, and the work is in revoking them. This project is not
default. Its default privileges are:

```
for role postgres, schema public, tables:
  postgres=arwdDxtm  anon=Dxtm  authenticated=Dxtm  service_role=Dxtm
```

`Dxtm` is TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. No insert, select, update
or delete for **any** of the three API roles. So a new table starts with no
data access at all and every privilege must be named — including the service
key's.

> **A new table that server code has to write needs an explicit grant to
> `service_role`, in the same migration that creates it.**

The community tables already follow this: `profiles` carries an explicit
SELECT and UPDATE for `service_role`, `questions` / `answers` / the hearts
tables carry SELECT, and nothing carries INSERT or DELETE. Migrations 007 and
008 both omitted it; 007 got away with it because no server code writes
`public.applications` yet. **Stage 7 must not assume it has access.**

Migration 009 grants `select, insert, update` on `candidate_resumes` to
`service_role` — and deliberately not DELETE, and nothing on `applications`.
A SECURITY DEFINER function runs as its owner and needs no grant, which is
how stage 7 should read applications.

`service_role` bypasses RLS but **not** triggers, so
`private.candidate_resumes_guard()` still pins every path on a service-key
write.

### Stage 6 — what the file check does and does not do

`api/upload-resume.js` reads the uploaded bytes and requires `%PDF-<n>.<n>`
at the start and `%%EOF` within the last 64 KB. This is the only honest
check available: the filename, the `Content-Type` header and the bucket's
`allowed_mime_types` are all supplied by whoever uploads, so a `.exe`
renamed to `.pdf` and sent as `application/pdf` satisfies every one of them.

The 64 KB window is deliberately generous. A junk file that slips through is
caught by the header check and by the recruiter opening it; a real
candidate's resume wrongly refused is an application silently lost.

**It is a structure check, not antivirus.** A genuinely malicious PDF is
still a PDF and will pass. Any job board carries that risk the moment a
recruiter downloads a stranger's file.

### Stage 6 — SIGNED OFF 19 Nov 2026

Three test rounds. The security property held on the first one and did not
have to be revisited.

**The main result, in Rishi's own test.** Signed in as `community@`, the
recruiter who posted the role, `GET /rest/v1/applications?select=*` returned
`200 []`. The identical call as the candidate returned one row. So the empty
array means filtered, not a broken request. A direct `GET` on the real resume
path as the recruiter returned `400 {"statusCode":"404"}` — refused without
even being told the file exists.

| Round | What came back | Outcome |
|---|---|---|
| 1 | Sidebar still not full height; four changes; two non-bugs | The sidebar fix had targeted the description column, not the card |
| 2 | **Blocker: replacing a resume returned 502** | Migration 008 granted the service key nothing — see the grant rule above |
| 3 | All passed | Signed off |

Decisions taken during the stage:

- **One resume per candidate**, overriding the spec line that each
  application stores its own copy. Rishi's call, knowing that a recruiter may
  open a different document than the one they shortlisted; the mitigation is
  the updated-on date travelling with the file. Migration 008.
- **The landline collision stays.** `080 2555 1234` has the same digits as a
  mobile written with a leading zero, so 08x and 09x landlines pass the phone
  check. Rishi: "Refusing a real mobile loses a candidate silently, while
  accepting a rare landline costs a recruiter one wasted dial. And a landline
  in a phone field isn't wrong anyway — it's a working number."
- **Both confirmation panels say "You have applied to this job"**, and the
  applied panel is one line: "Sent on &lt;date&gt;."
- **The confirmation does not promise never to email.** Candidate email is
  deferred, not cancelled, and published copy should not need walking back.

Two things that looked like bugs and were not:

- "Fresher" is the display rule for a 0–0 year role, not a form option.
- A `.docx` renamed to `.pdf` is accepted *into the file field* by the
  browser — `accept` filters the picker, it does not validate. The real check
  runs on Send, and refused it.

Carried into stage 7: the "Resume updated on &lt;date&gt;" line beside the
download, and the grant rule — migration 007 granted `service_role` nothing
on `public.applications`, and that is to be left that way.

## Stage 4 onwards

(Appended at the end of each stage.)

## Stage 7 — the recruiter sees applications

| What | Where | How to remove | Status |
|---|---|---|---|
| Statuses moved to Shortlisted / Not selected while testing | `public.applications.status` | `update public.applications set status = 'applied';` — or leave it, the rows are going anyway | PLANNED |
| Four `public.recruiter_*` functions | database | `supabase/migrations/011_recruiter_applications_rollback.sql` — keep them, this is the product | LIVE after migration 011 |

**Nothing else is created by this stage.** No table, no bucket, no row. It adds
four functions and reads what stage 6 already stored.

### Stage 7 — how the verification gate is enforced

**`public.applications` is untouched.** Migration 011 adds no policy, no grant
and no column to it. Stage 6's three policies — one INSERT, two SELECT, none
for recruiters — are exactly as they were tested, and the check queries at the
bottom of 011 re-print them so a regression is visible on the day.

**Why a policy could not have done this job.** RLS is row-level. A policy that
lets a recruiter match their applications lets them read *every column* of
those rows, names and emails included, and there is no second policy that
takes columns back. Column grants can restrict columns, but a grant is
per-role, not per-row — it cannot say "this recruiter but not that one".
Verification is a per-row, per-column rule, so it belongs in a function with a
named column list.

So: four SECURITY DEFINER functions, each checking ownership and verification
itself.

| Function | Who | Returns |
|---|---|---|
| `recruiter_application_counts()` | any active recruiter | job_id, count, latest date — **no per-candidate row at all** |
| `recruiter_applications(job_id)` | verified only | nine named columns; **no `candidate_id`**, no `consent_at`, no `resume_path` |
| `recruiter_resume_path(id)` | verified only | one path, one application at a time |
| `recruiter_set_application_status(id, status)` | verified only | the stored status; cannot set `withdrawn` |

**An unverified caller gets an empty result, not an error.** That is what
makes the gate checkable in one browser request: `[]` while applications sit
in the table. The page does **not** infer "nobody applied" from that — it
reads `is_verified` from the recruiter's own profile row and shows the gate
with the count from the counts function. `fetchApplications()` returns
`gated: true` rather than a bare empty array so that distinction cannot be
lost in a later edit.

**`candidate_id` is deliberately not returned.** A recruiter has no use for
the uuid, and withholding it means they cannot carry it to any other table.

### Stage 7 — the resume download, and why it takes two clients

`/api/resume-url` uses two Supabase clients and the split is the security
property:

- **The database decides whether.** The first client is built with the
  **publishable** key and the recruiter's own bearer token, so inside
  `recruiter_resume_path()` `auth.uid()` is the recruiter and the function's
  checks apply. Null means no — not your job, not verified, suspended,
  anonymised, no resume — and which one is never reported back.
- **The service key decides how.** The bucket has no policies on
  `storage.objects`, so only the service key can read it. It signs the URL and
  does nothing else.

Doing it the other way round — verifying the token with the service key and
checking ownership in JavaScript — would put the same authorisation rule in
two places, and the copy that drifts is always the one nobody is looking at.

The URL lasts **60 seconds** and is never stored. `Content-Disposition` is
built from the application id, which the server knows and the client does not
get to choose: a filename from the client would be a header the client writes.

### Stage 7 — where the apply form's name prefill comes from

Asked at the first test round, because a prefill is what most people accept
without thinking: if a community **nickname** were prefilled into a job
application, candidates would send recruiters the wrong name without noticing.

**It is the Google account name, and it always was.** `ApplyPanel` reads
`user.user_metadata.full_name` (falling back to `.name`), which is written
only by the identity provider at sign-in. **Nothing in this codebase ever
writes `user_metadata`** — there is no `supabase.auth.updateUser` call
anywhere — and `saveDisplayName()` writes `public.profiles.display_name` and
nothing else. The two values are never connected.

Worth confirming rather than reasoning about, because the two agree for most
accounts and a test account cannot tell them apart:

```sql
-- 132 on 19 Nov 2026
select count(*) from auth.users u join public.profiles p on p.id = u.id
 where p.display_name is not null
   and coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') is not null
   and p.display_name is distinct from
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name');
```

**So this is a rule to keep, not a bug that was fixed.** Anything that starts
writing `user_metadata` — a "complete your profile" screen, a nickname sync —
would silently change what gets prefilled into every job application.

### Stage 7 — the grant rule, applied

Migration 007 granted `service_role` nothing on `public.applications` and
**migration 011 leaves it that way.** A SECURITY DEFINER function runs as its
owner, `postgres`, so it needs no grant; and `/api/resume-url` never reads the
table with the service key. If a later stage finds it needs direct service-key
access to applications, that is a sign the work belongs in a function instead.

### Stage 7 — decisions at the first test round (19 Nov 2026)

- **Status control is buttons, not a dropdown.** Rishi: "Setting someone to
  'Not selected' is a judgement about a person, and a dropdown puts that one
  stray scroll away on Windows." Pressing the active button returns the
  application to Applied, so nothing is one-way.
- **The privacy paragraph stays exactly as written** — the only place a
  recruiter is reminded while actually holding someone's email address.
- **The gate panel is about half its original length**, and says *company*
  verification throughout — never "verify your email" or "verify your
  account", because they confirmed their email at signup and would read either
  of those as a bug.
- **Sort on My jobs: newest, oldest, most applications.** No filter — an
  unverified recruiter caps at ten live roles, and filtering ten items is not
  worth the surface. The 25 in testing only exist because of the SQL-inserted
  samples.

**The 60-second signed-URL expiry is now verified** — at stage 8 sign-off
Rishi fetched a signed URL two minutes later and got 400. It had been recorded
here as unverified rather than as a pass.

### Stage 7 — SIGNED OFF 20 Nov 2026

Two rounds. The security property passed on the first one and was not
revisited.

**The results that mattered, in Rishi's own tests.** Unverified, with
applications in the table, `recruiter_application_counts()` returned six rows
of numbers and dates while `recruiter_applications()` returned `200 []`;
`recruiter_set_application_status` returned `400 / P0001` with its own
sentence and `recruiter_resume_path` returned `null`. After verification the
full card appeared — and `GET /rest/v1/applications?select=*` **still**
returned `200 []`, with a direct storage read on the real resume path still
`400`. **Verification opens the functions, not the table.**

Also confirmed: suspension empties the counts and the list; the second
recruiter account, which has posted nothing, gets `[]` from both RPCs; a
status of `withdrawn` is refused with a readable message; "Not selected" never
renders as "rejected" or as a raw value.

| Round | What came back | Outcome |
|---|---|---|
| 1 | All passed. Three changes, three decisions, one question | Status control, gate wording, sort |
| 2 | All passed, plus the 375px overflow fixed on the real preview | Signed off |

Changes made between the rounds:

- **Status control is buttons, not a dropdown.** Both directions reversible,
  and Not selected → Shortlist moves straight across without going via
  Applied.
- **Gate panel about half its length**, company verification throughout.
- **Sort on My jobs** — newest, oldest, most applications. URL state holds
  across a fresh tab, `?sort=sideways` falls back cleanly, no roles dropped.
- **The applications card overflowed at 375px** and `shrink-0` was the cause:
  with it the button column takes its max-content width, so the `flex-wrap`
  inside had nothing to wrap against. 433px inside a 303px card. Fixed in its
  own commit and verified on the real preview.

**The 60-second signed-URL expiry is now verified** — at stage 8 sign-off
Rishi fetched a signed URL two minutes later and got 400. It had been recorded
here as unverified rather than as a pass.

**Confirmed, not changed:** the apply form's name prefill is the Google
account name, not `profiles.display_name` — see the section above. 132 real
users have a display name that differs, so this would have mattered.

## Stage 8 — the candidate's own side

| What | Where | How to remove | Status |
|---|---|---|---|
| Anonymised applications from testing delete-my-data | `public.applications` | **Cannot be undone.** The row survives with nulls; delete it with the rest of the test rows. | PLANNED |
| `jobs.closed_at` on test roles | `public.jobs` | Goes with the test jobs | PLANNED |
| Four `public` functions, one `private` trigger function | database | `supabase/migrations/013_candidate_dashboard_rollback.sql` — keep them, this is the product | LIVE after migration 013 |

**Nothing new is created by this stage** beyond a column and five functions. It
deletes rather than collects.

### Stage 8 — why the columns are nullable instead of hidden

Stage 7 hides candidate data from an unverified recruiter by having a function
not return it. That is right **there**, where the data must still exist for a
verified recruiter to see later.

It is **wrong here.** The privacy policy says the name, email, phone, notice
period and account reference are *"erased from our database — not hidden,
erased"*. A column that still holds the name has erased nothing, whatever the
read function does with it. So migration 013 drops `NOT NULL` on
`candidate_id`, `full_name`, `email` and `notice_period`, and
`anonymise_job_data_for()` nulls them.

Every CHECK constraint on those columns already tolerates NULL — a CHECK that
evaluates to NULL passes — so none needed altering. Verified against the live
definitions before writing the migration rather than after it failed.

**`candidate_id` goes because of one sentence**: *"neither we nor the recruiter
can connect that application back to you."* Nulling the name while keeping the
account reference would leave that false. Two consequences, both of them
decided and both stated on the button before it is pressed: the candidate
loses sight of the application too, and `one_application_per_job` no longer
stops them applying to that role again, because NULLs do not collide in a
Postgres unique index.

### Stage 8 — the delete functions are not callable from a browser

Deleting a resume is two things that must both happen: a row goes and a file
in a private bucket goes. Only the service key can delete the file.

So `delete_resume_for(uuid)` and `anonymise_job_data_for(uuid)` take a user id
and are granted to **`service_role` only**. There is no client-callable path to
either. If there were, a hand-written RPC call from the console would
anonymise the row and leave the file in storage — and *"permanently deleted"*
would be quietly false with nothing left to notice it.

The endpoints verify the bearer token with the service key and pass the
verified id, the same shape `/api/upload-resume` already uses.
`my_applications()` is read-only and stays callable by the candidate.

**The grant is the only thing between "pass your own id" and "pass anybody's",
so it must not be widened to `authenticated`.**

**Order of operations: file first, then the database.** A failed file delete
then changes nothing and can be retried. The other order leaves a row saying
the resume is gone while the file still sits in storage, which is the single
outcome the policy forbids.

### Stage 8 — the 12-month sweep rides an existing cron

The policy says applications are kept *"for up to 12 months after it closes or
expires"*. The Hobby plan allows two cron jobs and both were taken.

It did not need a third. The sweep touches **no files** — resumes have their
own retention and there is one per candidate, not one per application — so it
is a single SQL statement in `public.purge_expired_applications()`, called once
a day from `api/rebuild.js`.

**It cannot be verified before the merge, and that is now recorded as P1 in the
post-merge section rather than as an open stage 8 test.** Vercel runs crons
only against the production deployment, and production builds from `main`.

`rebuild.js` hosts it rather than `send-digest.js` deliberately: the digest
reaches ~2,500 people and a crash part-way through risks double-sending, while
`rebuild.js` sends nothing. The sweep runs **after** the deploy hook has fired
and is wrapped so it can never fail a rebuild — its outcome goes in the
response body and the log, never into the status code. The count is logged on
every run including zero, so a sweep that has silently stopped working shows
up as an absence.

**`jobs.closed_at` had to exist first.** Closing early was not recorded
anywhere and `updated_at` moves on any edit, so "12 months after it closes"
could not be computed. Measuring from `expires_at` instead would have
**breached** the sentence rather than satisfied it: a role closed on day 3
still expires on day 30, so its applications would be held about 12.9 months
after closing. Rishi's decision, 22 Nov 2026: record the date rather than
reword around not having it, since once roles close without it that date is
gone for good and stage 9's admin queue will want it.

Reopening clears it, so retention always measures from the most recent close.
**There is deliberately no backfill** — for roles already closed the date is
not recoverable, and inventing one would be worse than the `coalesce` fallback
to `expires_at`. Every such row today is test data.

### Stage 8 — status precedence, which is the part no test round would catch

A recruiter can shortlist someone and the role can then expire. Both facts are
true and only one can be a chip. **The recruiter's decision wins**, because
"Shortlisted" tells the candidate something about themselves while "Closed"
only tells them about the calendar — and showing "Closed" over a shortlist
reads as a rejection, which is the crueller of the two mistakes.

Seeing it by hand would need a shortlisted application on an expired role,
which is exactly the state nobody sets up by accident, so it is pinned in
`scripts/stage8-candidate-test.mjs` instead.

### Stage 8 — /profile was stripped back after the first look

Rishi's instruction, 22 Nov 2026, and the reasoning is worth keeping: no red
panel on a page the whole community opens every day.

- **The resume block is a date and a button.** No explanatory paragraph, no
  warning box. The one fact that could not simply be dropped — there is one
  resume and replacing it reaches back into applications already sent — is
  not standing page text; it appears once a file has been picked, beside the
  button that would do it. Clean resting page, no silent replacement.
- **An upload control had to be added**, because `/profile` previously had
  none: uploading only ever happened inside an apply form. Same endpoint, same
  2 MB and real-PDF checks.
- **Everything destructive moved to `/profile/delete-data`**, reached by one
  quiet grey text link at the bottom of `/profile`. The feature stays because
  the privacy policy promises it; it just no longer greets people who came to
  change their display name.
- **"Delete my resume only" moved there too** rather than disappearing with
  the stripped-back block, because the policy promises a resume can be deleted
  on its own.

- **A Download option was added to the resume block**, because a candidate
  could replace their resume but never see which file a recruiter was being
  given. `/api/my-resume-url` **takes no identity input of any kind** — not a
  user id in the body, not one in the query string. It verifies the bearer
  token with the service key and looks up only the row keyed by that verified
  id, so there is no parameter to tamper with and no server-side comparison
  that could be got wrong. That is a stronger guarantee than validating an id
  would be: the recruiter endpoint has to ask the database whether the caller
  owns an application, because it is reaching for someone else's data on
  purpose; here the caller *is* the answer. The path is still checked against
  the verified id before signing, because this function can sign any object in
  the bucket and should refuse rather than trust that the write-time trigger
  held. Signed for 60 seconds, filename built from the row's own `updated_at`.

- **The job detail page's back link now depends on how you got there.** From
  `/my-applications` it offers both *My applications* and *All roles*; from
  anywhere else it is unchanged. It keys off **router state, not a query
  parameter**, and that is the whole design: state exists only for an in-app
  navigation, so a refresh, a pasted link or a link shared with someone else
  arrives with none and falls back to the public behaviour. A `?from=`
  parameter would survive being copied and would then offer a stranger a route
  to "My applications", which is not theirs. The state is read as a boolean
  and the destination is hardcoded, so nothing navigates to a path that came
  out of state. The canonical-slug redirect passes the state through, or an
  older saved link would silently lose its way back.

Two policy sentences had to follow the controls, and both were approved: the
resume paragraph now says replacing happens on the profile and deleting on its
own happens on the delete page, with the clause that deleting a resume does not
withdraw anything; and the policy and the button now share one name, **Delete
my job board data**, instead of the policy saying "Delete my data".

### Stage 8 — the privacy policy was corrected, not the code

Three paragraphs disagreed with the built system. `Privacy.jsx` is on the
branch only and has never been on `main`, so none of this was ever published —
it would have gone live at the merge.

| Said | Reality | Fixed by |
|---|---|---|
| Replacing a resume *"does not reach back into past applications"* | Stage 6 deliberately reversed exactly this | Rewriting the paragraph to describe one resume per candidate and the updated-on date as the mitigation |
| A whole *"Withdrawing an application"* section | Version 1 has no withdraw | Replacing it with "Can I take an application back?" — not yet, and why |
| Anonymising erases *"name, experience, location, notice period"* | There is no experience or location column; email and phone are collected and were not listed | Listing the columns that actually exist |

**One went the other way.** *"Neither we nor the recruiter can link that
application back to you"* was the better design, so the code was changed to
match the policy rather than the policy softened to match the code. That is
why `candidate_id` is erased.

`LAST_UPDATED` on the privacy policy moves to **22 November 2026**.
`RecruiterTerms.jsx` still carries its own date and is unaffected — carried
item 1 still applies to it.

### Stage 8 — SIGNED OFF 22 Nov 2026

Five rounds, four of them changes rather than failures. Nothing in the security
design had to be revisited.

**The results that mattered, in Rishi's own tests.** Every application row came
back with `candidate_id`, `full_name`, `email`, `phone` and `notice_period`
**null** — erased in the column, not hidden by a function — with `status` and
`consent_at` surviving. The recruiter saw *"Details removed"*, and
`recruiter_applications` returned all nulls with `is_anonymised` true.
Re-applying worked. All three write functions returned **403** from the browser.
Download returned only the caller's own file, and passing three different id
fields in the body changed nothing.

**Folder clearing was proved against the real orphans:** four objects removed,
including the three from 19 November that deleting by row name could never have
reached. Storage is now completely empty and the invariant query reads 0, 0, 0.

| Round | What came back | Outcome |
|---|---|---|
| 1 | Not testable — built but not pushed | Led to the standing push-before-checklist rule |
| 2 | Three changes: strip `/profile`, move deletion to its own route, saved jobs | Plus two policy corrections |
| 3 | Add a resume Download | Endpoint takes no identity input at all |
| 4 | Back link wrong when arriving from `/my-applications` | Router state, so a shared link cannot mislead |
| 5 | An orphan survived deletion | Became invariant I2 |
| — | All passed | Signed off |

**Two carried items closed by this stage:**

- **The 60-second signed URL expiry**, recorded as unverified at stage 7
  sign-off. Rishi fetched one two minutes later and got 400.
- **The three orphaned storage objects** carried since stage 6. Removed by the
  feature that exists because of them, which is a better outcome than clearing
  them by hand.

### Stage 8 — what the Security Advisor says, and which of it matters

Worth triaging once rather than re-reading the warnings before every launch
check. The dashboard's count and a raw lint count group these differently, so
the categories matter more than the number.

| Finding | Level | Verdict |
|---|---|---|
| `security_definer_view` on `question_authors` | **ERROR** | Known. Dropped after the merge — carried item 14. The only error. |
| `rls_enabled_no_policy` on `user_activity` | INFO | **Correct as designed.** RLS on with no policy means no client role can touch it; `record_activity()` writes it as definer and the digest reads it with the service key. The same "absence is the design" pattern as `applications`. |
| `anon_security_definer_function_executable` ×4 | WARN | `author_names` and `job_posting_agency` are deliberate — anonymous visitors read author names and job pages. The other two are below. |
| `authenticated_security_definer_function_executable` ×9 | WARN | Seven are the job board's own, each checking ownership and verification itself; that is the design. The three **write** functions correctly do **not** appear, which is the advisor confirming the service-role-only grant. |
| `auth_leaked_password_protection` | WARN | Carried item 7. Needs Pro. |

**Two of those warnings cannot do harm, and it is worth knowing why rather
than trying to fix them:**

- **`record_activity()`** opens with `if auth.uid() is null then return; end
  if;`. An anonymous caller gets a no-op, so the `anon` grant is noise.
- **`rls_auto_enable()`** is declared `returns event_trigger`. Postgres refuses
  to call such a function any way other than as an event trigger, so the grant
  is unreachable by construction. It is also useful: it enables RLS
  automatically on any new table in `public`.

Neither is ours and neither needs changing. Recorded so nobody spends launch
day on them.

## Deferred — saved jobs, to stage 10

A candidate bookmarking a recruiter-posted role on `/gcc-jobs`, the same idea
as the existing Questions Saved counter. Not job drafts, and nothing to do
with the external listings on `/jobs`.

**Cut from stage 8, reinstated, then moved to stage 10 on 22 Nov 2026.** The
reason it was reinstated — that "Explore GCC Jobs" is in the navigation — does
not hold: that link goes to `/jobs`, the collated external page, and `/gcc-jobs`
is still unreachable from anywhere a visitor would look. Building a bookmark
button on a page nobody can navigate to would ship a feature to an empty room.
Stage 10 is where the board becomes both indexable and linked, so that is where
this belongs.

**The design, recorded now so stage 10 does not redesign it:**

| Piece | Decision |
|---|---|
| Table | `public.job_saves`, mirroring `question_saves` exactly, since that shape is already proven in production |
| Columns | `job_id bigint`, `user_id uuid`, `created_at timestamptz` |
| Primary key | `(job_id, user_id)` — one save per person per role, so saving twice is idempotent rather than an error |
| Foreign keys | both `on delete cascade` |
| Policies | three, all `auth.uid() = user_id`: select own, insert as self, delete own |
| Grants | `select, insert, delete` to `authenticated`. **No update** — a save has nothing to change. |
| Function | `my_saved_jobs()`, definer, for the same reason `my_applications()` exists: a saved role that has since closed is hidden by `private.job_is_public()`, and a list that silently loses rows is worse than one that marks them Closed |
| Save control | the card on `/gcc-jobs` and the detail page. Signed out reuses `setPostLoginRedirect`, so the save completes after sign-in instead of being lost |
| Profile | a **Jobs Saved** counter beside Questions Asked and Questions Saved — the existing two-up grid becomes three — linking to `/saved-jobs` |

No new security surface: a save is the candidate's own row and nothing else
ever reads it.

## Deferred — the wording pass (after all eleven stages)

Logged, **not to be changed now**. Both are Rishi's calls from the stage 7
sign-off.

| # | Item | Note |
|---|---|---|
| W1 | The gate panel says **"verify your company"**; Rishi asked for **"verify your account"**. | The phrase appears in the gate panel, the My jobs counter line, the posting form and the stage 3 signup banner. Changing one and not the others would be worse than leaving all four, so this moves as a set. Note it also cuts against the stage 3 decision to say "company verification" rather than "email verification" — that decision was about not implying the *email* needed confirming, which "account" also avoids, so there is no conflict, only a change of word. |
| W3 | The recruiter applications page still shows **"1 new"** above an application whose details have been removed. | `summariseStatuses()` counts by `status`, and anonymising deliberately leaves `status` alone so a recruiter keeps their own shortlist decision. So the count is accurate and the word is wrong: an anonymised application is not "new", it is gone. Either exclude anonymised rows from the summary or give them their own term. **Do not "fix" it by changing what anonymising does to `status`.** |
| W4 | The privacy page says **"Delete my data"** under *"Can I take an application back?"* while everywhere else says **"Delete my job board data"**. | The same two-names problem fixed elsewhere on 22 Nov, missed in that one paragraph because it was written before the button was renamed. One word. |
| W2 | Shorten the verified state on My jobs to a plain **"Verified"** chip. | **Tension Rishi flagged himself:** the current sentence — "Your company is verified, so there is no limit on live roles." — also carries the no-limit fact, and a chip cannot. So the chip needs somewhere else to carry it. Options not yet chosen: next to the slot counter it replaces, on the posting form where the cap is already explained, or on recruiter home. Decide the destination before shortening the line, or the fact is simply lost. |

## `public.question_authors` — settled 19 Nov 2026 (migration 010)

Raised by Rishi as its own piece of work, not folded into a stage: the
Security Advisor flags a Security Definer View on `public.question_authors`,
which predates the job board. Was it actually a problem?

**Partly, and not where the advisor points.** The view was
`select id, display_name from profiles`, owned by `postgres`, no
`security_invoker`, granted to `anon` and `authenticated` — so it bypassed the
`auth.uid() = id` policy on `profiles`.

**That bypass is necessary.** The Q&A pages must show who wrote what, and RLS
cannot express "anyone may read the display name but nothing else": a policy
is row-level, so letting you read a row lets you read every column of it.
Column grants are the tool for that, and `profiles` grants `authenticated` the
whole table (`arwdDxtm`), so fixing it there would mean rewriting the
privileges of the table the whole community depends on.

**The scope was the problem.** Named `question_authors`, it returned every
profile row:

| | |
|---|---|
| Rows the view returned | 2,464 |
| With a display name | 166 |
| People who have ever asked, answered or hearted | 97 |
| **Named but never participated — published for nothing** | **76** |

No email, no avatar, no contact detail. A membership list, not a breach.

**The real risk was structural.** A definer view silently ignores RLS, so
adding `email` for some future "contact the author" feature would publish
2,464 addresses with nothing in the way. The advisor flags the shape, not
today's columns.

**The fix: a function, not a view.** `public.author_names(uuid[])` resolves
ids the caller already has. There is no `select *`, so there is nothing to
enumerate — you must know the uuid to learn the name, and every uuid this app
passes came from questions, answers or hearts in the first place. It is the
pattern this project already uses for the same problem
(`public.job_posting_agency`, migration 005). Widening it to return an email
means changing a signature and every caller, which is a visible act; adding a
column to a view was not.

**A correction to my own earlier analysis.** I said narrowing could not break
the app because `authors.js` only ever queries ids taken from questions and
answers. That was wrong: `NotificationsBell.jsx` also passes the ids of people
who **hearted** a question or answer, and a hearter need not have posted
anything. Hence 97 "with a public presence", not 89 authors — and hence a
function taking explicit ids rather than a narrowed row set being the right
answer anyway.

**The view is NOT dropped yet, on purpose.** Production serves the main
branch, which still reads it. Dropping it now would replace every author name
on the live community with "Community Member" until the branch merges. So the
view stays, narrowed to 90 rows, and
`supabase/post-merge/drop_question_authors.sql` removes it after the merge.
**Until then the advisor will keep flagging it, correctly.**

**Measured sequencing risk.** The prerender runs the real app against the real
database, so the order matters. With the branch's code and no migration 010,
prerendered question pages carry **95** "Community Member" fallbacks; with
author names resolving, **2** (people who genuinely have no display name).
Run migration 010 **before** the preview rebuilds, or redeploy after it.
Production is unaffected either way.

## Function search_path — settled 20 Nov 2026 (migration 012)

The Security Advisor flags `update_updated_at`, `prevent_slug_change` and
`mark_answer_edited` as "Function Search Path Mutable". All three predate the
job board.

**Honest severity: lower than the same warning on a SECURITY DEFINER
function.** All three are SECURITY INVOKER — they run with the privileges of
whoever triggered them, so a mutable `search_path` cannot escalate anything.
All three are also trivial and reference no object in `public` at all, only
`NEW`, `OLD` and `now()`. There was nothing to hijack.

**Pinned anyway**, because the warning is about what a function could become:
these are trigger functions, so the moment a body grows a reference to a
table, that name resolves according to whoever is writing the row.

Done with `alter function ... set search_path`, **not** `create or replace`,
so the bodies are provably untouched — these fire on the community's questions
and answers, and there was no reason to retype them.

`public, pg_catalog` rather than Supabase's recommended `''`, because every
function in this project has used that since migration 001 and one convention
applied consistently beats a marginally tighter setting on three functions
that resolve nothing.

**The sweep at the bottom of 012 is the reusable part.** It counts every
unpinned function across `public` and `private`, so it proves nothing was
missed and is the query to re-run after any later migration adds one. It
should read 0 from now on.

## Launch checklist — production-dependent verification

**This is the list, so it does not live only in a conversation.** Each item
says what to check and *when it first becomes checkable*, because two of them
cannot be done before the merge and two must be done before it.

| # | What to check | When it becomes checkable | Done |
|---|---|---|---|
| **P1** | The 12-month retention sweep ran. `curl` the rebuild endpoint with `CRON_SECRET` and read `purged` out of the response body — never a log. | **After the merge deploy.** A cron cannot run on a preview at all. | ☐ |
| **P2** | Analytics and Clarity actually fire: a `gtag` collect request in the network tab, the Clarity script loading, GA4 realtime showing the session. Plus **carried item 2**, Clarity's form-input masking. | **After the merge deploy.** Both guards are hostname-gated to the live host, so on a preview they only ever take the deny path. | ☐ |
| **P3** | Crawlability: `robots.txt`, `sitemap.xml` and JSON-LD fetchable, via Search Console URL inspection. | **After the merge deploy.** Deployment protection serves an unauthenticated client Vercel's login page, so Googlebot cannot reach a preview. | ☐ |
| **P4** | All six environment variables are ticked for **Production**, not only Preview. | **Now, and again immediately before the merge.** | ☐ |
| **P5** | `DEPLOY_HOOK_URL` works from `api/rebuild.js` as this branch writes it. | **After the merge deploy** — P1's single `curl` proves both at once. | ☐ |

**The rule these came from, worth keeping:** a check that ends in "look at the
log tomorrow" is not a check. Hobby keeps runtime logs for about an hour, and
crons only run against production.

### Detail



**Raised by Rishi on 23 Nov 2026, and it invalidated a check rather than
delaying it.** The stage 8 checklist asked him to read the retention sweep's
log line after the 02:00 cron. That could never have printed: **Vercel runs
cron jobs only against the production deployment, and production builds from
`main`.** The sweep lives in `api/rebuild.js` on the branch, which does not
merge until stage 11, so the 02:00 run executed the old rebuild code.

**Two separate constraints, both worth remembering when writing any future
check:**

1. A cron cannot be tested on a preview deployment at all. Not slowly — not at
   all.
2. **Hobby retains runtime logs for about an hour**, so even after the merge a
   02:00 UTC run cannot be read the following morning. Any check that ends in
   "look at the log tomorrow" is not a check.

### P1 — the 12-month retention sweep

**Status: not verified, and not verifiable before the merge.** Moved here out
of stage 8, where it was wrongly listed as an open test.

**How to verify it without depending on logs — do this straight after the
merge deploy:**

```bash
# CRON_SECRET is in Vercel's environment variables.
curl -s -X POST https://www.iworkatgcc.com/api/rebuild \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

Expect `{"triggered": true, "purged": 0}`. That is the whole check: the
response body carries the sweep's own return value, so nothing depends on log
retention and it can be run at any hour. The one side effect is that it fires
the deploy hook and production rebuilds — which is exactly what happens every
night anyway, so it costs one build and nothing else.

**And make it permanently checkable.** Stage 9 builds an audit table, and a
nightly retention purge is an administrative action by any reasonable
definition. If `purge_expired_applications()` writes an audit row, the nightly
run becomes a SQL query rather than a log hunt — verifiable forever instead of
within an hour. Added to stage 9 scope.

### P2 — analytics and Clarity will fire for the first time at merge

Both guards are **new on this branch** and both key off the hostname:

| Guard | Where |
|---|---|
| `trackEvent()` returns early unless the host matches | `src/analytics.js` |
| Clarity's loader only runs if the host matches | `index.html` |

On every preview deployment they take the **deny** path. So "zero analytics
requests", tested in every stage since 2, only ever proved the guard blocks.
**The allow path has never run once.**

The failure mode is the quiet kind: if the hostname were wrong, analytics would
simply stop at merge and look like a run of quiet days.

**The hostname itself is verified correct**, checked 23 Nov 2026: `iworkatgcc.com`
returns **308** to `https://www.iworkatgcc.com/`, which answers with 200. So the
constant matches what production serves, and every other canonical host in the
repo agrees — `src/lib/seo.js`, `scripts/prerender.mjs`, `public/robots.txt`.

**Still to do at merge**, two minutes: load the live site, confirm a `gtag`
collect request fires in the network tab and a Clarity script loads, and that
GA4 realtime shows the session. **Carried item 2 — verifying Clarity's
form-input masking — belongs here too**, because Clarity cannot load on a
preview by construction, so that item was never completable before merge.

### P3 — crawlability cannot be tested on a preview

The preview deployment sits behind Vercel's deployment protection: an
unauthenticated client gets Vercel's sign-in page, not the app. Confirmed on
22 Nov when a scripted fetch of the preview returned the login screen.

So nothing about Googlebot, `robots.txt`, `sitemap.xml` or JSON-LD being
*fetchable* can be proved on the branch. **Stage 10 has to be planned knowing
its central claim is only testable after merge**, via Search Console's URL
inspection on the live site.

### P4 — environment variables are scoped per environment

Every function added by this branch reads `SUPABASE_SERVICE_ROLE_KEY`, and
`/api/resume-url` also reads `VITE_SUPABASE_PUBLISHABLE_KEY`. A variable set
for Preview only would work throughout testing and fail the moment production
served it.

**Pre-merge check:** in Vercel → Settings → Environment Variables, confirm all
six are ticked for **Production** as well as Preview: `SUPABASE_SERVICE_ROLE_KEY`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `BREVO_API_KEY`,
`CRON_SECRET`, `DEPLOY_HOOK_URL`.

### P5 — `DEPLOY_HOOK_URL` has never been fired from this branch's code

The rebuild cron's only job before stage 8 was to hit that hook, and it has
been doing so nightly from `main`, so the hook works. What has not been
exercised is `api/rebuild.js` **as the branch now writes it**, which fires the
hook and then sweeps. P1's curl covers both in one request.

### Checked and found to be a non-issue

- **`api/send-digest.js`** shows 24 added lines on this branch and runs only
  against production at 03:30 — so on the face of it, the same problem. **It
  is comment-only.** Every added line is a `//` comment explaining invariant
  I1 at the line that depends on it. No behaviour changed, so there is nothing
  to verify. Worth recording that it was checked rather than assumed.
- **`scripts/prerender.mjs`** also changed, but it runs at build time on every
  deployment including previews, so it has been exercised on every stage.
- **`vercel.json` is unchanged on this branch**, so neither cron's schedule nor
  the rewrite rules differ from what production already runs.

## Carried-forward items (must be done before the final merge)

| # | Item | Raised in | Due |
|---|---|---|---|
| 1 | Change `LAST_UPDATED` in `src/Pages/Privacy.jsx` and `src/Pages/RecruiterTerms.jsx` to the real launch date | Stage 2 | Before merge |
| 2 | Verify in the Microsoft Clarity dashboard that form-input masking is ON. The privacy policy states that text typed into forms is masked. | Stage 2 | Stage 6 |
| 3 | ~~Fix `private.handle_new_recruiter()` `on conflict do nothing`.~~ **DONE** — migration 003 upgrades a candidate to recruiter and never demotes an admin. | Stage 1 review | Closed |
| 4 | ~~Decide the test recruiter email address.~~ **DONE** — `community@` and `feedback@iworkatgcc.com`. | Stage 1 review | Closed |
| 5 | Delete the test Gmail account from Authentication → Users | Stage 1 | Before merge |
| 17 | **STAGE 9 SCOPE: `purge_expired_applications()` writes an audit row.** A nightly retention purge is an administrative action, and on Hobby a log line is unreadable an hour later. An audit row turns "did the sweep run" into a SQL query that is answerable forever rather than within the hour after 02:00 UTC. | Rishi, 23 Nov 2026 | **Stage 9** |
| 16 | **STAGE 9 SCOPE: a global orphan sweep in the admin queue, reporting before it deletes.** Stage 8's folder-clearing covers everyone who *asks* to be deleted. It does nothing about files belonging to people who never ask — which is what the three 19 Nov orphans were. The sweep compares `storage.objects` against `candidate_resumes` across every folder. Rishi's decision, 22 Nov 2026: **it reports first and deletes second**, reviewed by a human for the first few runs, rather than being trusted straight into the nightly cron. | Rishi, 22 Nov 2026 | **Stage 9** |
| 15 | **STAGE 10 SCOPE, RECORDED SO IT IS NOT ASSUMED: link `/gcc-jobs` in the navigation.** The board going public and the board being findable must happen in the same stage. Today `/gcc-jobs` is linked from exactly one place in the whole app — the empty state of `/my-applications`. "Explore GCC Jobs" in the header goes to `/jobs`, the collated page of external listings, and always has. Stage 10 makes the board indexable; if it does not also link it, the board is public to Google and invisible to a visitor. The two nav labels need settling at the same time, because "Explore GCC Jobs" is taken. | Rishi, 22 Nov 2026 | **Stage 10** |
| 14 | **Run `supabase/post-merge/drop_question_authors.sql`** — AFTER the merge is deployed and a live question page is confirmed to show author names, not before. Clears the Security Advisor's Security Definer View finding for good. | question_authors review | **After** merge |
| 13 | **Partly done by stage 8's own testing, 22 Nov 2026: `candidate_resumes` is empty and the `resumes` bucket is completely empty, so those two lines are closed.** What remains: the anonymised `applications` rows, the 24 `[T5]` jobs, `Test Co A` and `Test Co B`, the two recruiter accounts, and `iworkatgcctest3@gmail.com`. Order still matters — jobs before companies, because of the foreign key. **Full pre-merge clearout, confirmed by Rishi 18 Nov 2026.** In this order: `candidate_resumes` rows → the resume objects in Storage by hand → `applications` rows → the 24 `[T5]` jobs → `Test Co A` and `Test Co B` → the two recruiter accounts → `iworkatgcctest3@gmail.com`. Rows before objects because nothing cascades to storage; companies after jobs because of the foreign key. | Stage 6 sign-off | Before merge |
| 7 | **Turn on leaked-password protection** (Auth → Policies). Pro-plan only and Rishi is on Free, so it is skipped for now. It checks new passwords against HaveIBeenPwned. Only affects password accounts, i.e. recruiters. Do this if the plan is ever upgraded. | Rishi, stage 3 setup | If/when on Pro |
| 8 | **Add `http://localhost:5173/**` to Supabase Redirect URLs before changing Site URL**, or local `npm run dev` sign-in breaks. Localhost is currently allowed only because it *is* the Site URL. | Stage 3 review | Before changing Site URL |
| 6 | ~~**10-live-roles cap: the error message.**~~ **DONE in stage 4.** Migration 004 adds a `BEFORE INSERT` trigger, `private.jobs_cap_guard()`, which raises a readable sentence before the insert policy is evaluated. The policy from migration 001 is untouched and remains the enforcement; the trigger only supplies the message. It also gives a suspended recruiter a plain explanation instead of the same opaque RLS error. The cap number appears in two places now — the policy and the trigger — and each carries a comment saying to keep them in step. | Rishi, stage 2 sign-off | Closed |
| 9 | ~~**`auth.signUp` is not domain-restricted.**~~ **DEFERRED by Rishi, 18 Nov 2026.** The free-provider blocklist lives in the client form and in the `handle_new_recruiter` trigger, but the trigger only fires when the `recruiter_profiles` row is inserted, so a scripted call to `/auth/v1/signup` can still create an **unconfirmed** `auth.users` row on any domain and burn one Brevo send. Rishi's call: the trigger still stops them becoming a recruiter, so it is a junk account that can do nothing. Not worth a Before User Created auth hook. Revisit only if junk signups or send quota ever become a real problem. | Stage 3 review | Deferred — no action |
| 10 | **A recruiter can create a community `profiles` row — and that is now intended.** `saveDisplayName()` in `src/lib/useDisplayName.js` upserts one, reachable from `/profile`, `/ask` and any question page. **Rishi's decision, 18 Nov 2026: leave the behaviour as it is.** Someone who deliberately sets a display name is choosing to join the community, which matches the "one person can be both" decision. `/ask` and `/profile` stay reachable for recruiters. **The guard is the invariant below, not a code change.** | Stage 3 review | Decided — see the invariant |
| 11 | ~~**Stale unconfirmed `auth.users` rows / pre-account-takeover.**~~ **CLOSED 18 Nov 2026 by test T2 — outcome B.** A pre-registered unconfirmed password account was merged into the same user id when the real owner signed in with Google, and Supabase wiped **both** the attacker's password (`has_password` false, `providers` google only) **and** the attacker's `user_metadata`. `signInWithPassword` with the attacker's password returned 400 "Invalid login credentials". No cleanup cron is needed. | Stage 3 review | Closed |
| 12 | **`user_activity` now skips recruiters.** `ActivityTracker` is mounted at the app root and ran `record_activity()` for every signed-in user, recruiters included — proven by the one row `community@iworkatgcc.com` had accumulated. That table feeds the digest's active-user set and the community stats, so recruiters were inflating both. Guarded in stage 3. The guard keys off `account_type` metadata; if one account ever needs to be both candidate and recruiter, change it to key off the presence of a `profiles` row instead. | Rishi, stage 3 retest | Closed (guard shipped); stray row listed above for cleanup |

## Invariants — things a later stage must not quietly break

These are not to-do items. They are rules that currently hold, that nothing
enforces mechanically, and that a reasonable-looking future change could
break without any test failing.

### I2 — deletion means the folder is empty, not that the named file is gone

**The rule.** `/api/delete-my-resume` and `/api/delete-my-data` must clear
**every** object under `resumes/<candidate_id>/`. Neither may go back to
deleting the single path held in `candidate_resumes.resume_path`.

**Why it is a rule and not a preference.** A file can exist with no row
pointing at it, for reasons no error handling prevents:

| How | Can it be prevented? |
|---|---|
| The upload succeeded and the function died before the row was written — a timeout or an evicted instance | **No.** There is no process left to run a cleanup. |
| The row was replaced and deleting the superseded file failed | **No**, not without making it worse: that failure is deliberately non-fatal, because the new resume is already live and failing the request would tell a candidate their upload did not work when it did. |
| Two uploads landed at once, so the loser is referenced by nothing and was never the "previous" path either | Not without locking an upload path that does not need it. |
| The row write failed outright | Fixed — migration 009. This is what produced the three real orphans on 19 Nov 2026, before the service key had write access: *every* upload orphaned a file. |

So an orphan is not an error state to be designed out. It is a state that will
occur, which means deletion has to be defined by the end state of the folder
rather than by what we believe is in it. **Deleting by row name can only ever
be as reliable as the row.**

**What depends on it.** The privacy policy says *"Your resume file is
permanently deleted from our storage. This cannot be undone."* Deleting by row
name leaves orphans behind and makes that sentence false for exactly the
candidates whose upload once half-failed.

**How it breaks.** Any of these would silently reintroduce it:

- "simplifying" either endpoint back to `remove([row.resume_path])`
- removing the pagination loop in `clearResumeFolder`, so a deletion stops at
  100 objects
- adding a third deletion path that does not use the helper

**How to check it still holds.** After any change to either endpoint, or to
`api/_lib/resumeStorage.js`:

```sql
-- orphans MUST be 0 after any delete-my-data or delete-my-resume test.
-- Before launch, objects_total and resume_rows should also agree.
select
  (select count(*) from storage.objects where bucket_id = 'resumes') as objects_total,
  (select count(*) from public.candidate_resumes)                   as resume_rows,
  (select count(*) from storage.objects o
     where o.bucket_id = 'resumes'
       and not exists (select 1 from public.candidate_resumes cr
                        where cr.resume_path = o.name))             as orphans;
```

`scripts/stage8-candidate-test.mjs` covers the helper against a fake client,
including the cases production will not produce on demand: a second page of
results, three files where the row names one, a prefix placeholder, and a
listing entry that is not a plain filename.

**Not covered by this, on purpose.** Orphans belonging to people who never ask
for deletion. Those need a sweep across every folder, which is stage 9 — see
carried-forward item 16.

### I1 — `profiles.google_email` must stay null for recruiters

**Corrected 20 Nov 2026.** The earlier wording said the null `google_email`
is what keeps recruiters out of the weekly digest. That was the wrong reason
for the right outcome, as Rishi spotted: **neither recruiter has a `profiles`
row at all**, and `api/send-digest.js` iterates `profiles`, so they are never
considered in the first place. The column filter does not even run on them
today.

The invariant still matters, though, and the correction is to its *trigger
condition* rather than to the rule:

**The rule.** `profiles.google_email` is written by exactly one thing: the
Google sign-in sync in `src/Pages/Welcome.jsx`. Nothing else may write it.

**What actually keeps recruiters out of the digest, in order:**

1. **Today: they have no `profiles` row.** Verified 20 Nov 2026 — both
   recruiter accounts return `has_profile_row = 0`. Nothing to iterate, so
   nothing to filter.
2. **The moment one creates a row, the null column is the only thing left.**
   And a recruiter *is allowed* to create one: `saveDisplayName()` upserts a
   `profiles` row and is reachable from `/profile`, `/ask` and any question
   page. That is item 10 — Rishi's deliberate decision, because someone who
   sets a display name is choosing to join the community.

So the row's existence cannot be the filter, and layer 1 is luck rather than
design: it holds only for as long as no recruiter ever sets a display name.
Layer 2 is the actual guarantee, which is why this invariant exists and why
the reasoning is written at the check in `api/send-digest.js` where whoever
edits that line will see it.

**How it breaks.** Any of these would silently start emailing recruiters —
but only once a recruiter has a `profiles` row, which is why this can sit
latent and look fine:

- backfilling `google_email` from `auth.users.email`
- setting `google_email` in `saveDisplayName()` or anywhere in the recruiter
  signup path
- a migration that adds a `not null` default or copies `email` into it
- a new "complete your profile" screen that asks for and saves an email

**Why not just filter on role.** One person is allowed to be both a candidate
and a recruiter, and that person *should* get the digest. The real question is
"did they join the community through Google", and a non-null `google_email` is
exactly that. A role-based filter would exclude the dual-role case wrongly.

**How to check it still holds.** Before any stage that touches `profiles`,
the digest, or recruiter signup. The old check was a single `0`, which could
not tell "no rows" apart from "rows, all safe" — the two cases this
correction is about. This reports both:

```sql
-- recruiters_with_a_profile_row: 0 today. Not required to stay 0 -- a
--   recruiter may legitimately join the community.
-- recruiters_who_would_be_emailed: MUST be 0. Any row here is a recruiter
--   who will receive the next digest.
select
  count(*) filter (where p.id is not null)                              as recruiters_with_a_profile_row,
  count(*) filter (where p.google_email is not null)                    as recruiters_who_would_be_emailed
  from public.user_roles r
  left join public.profiles p on p.id = r.user_id
 where r.role = 'recruiter';
```

## Project-wide settings changed (NOT undone by the rollback scripts)

| Setting | Changed in stage | Previous value | Reverted? |
|---|---|---|---|
| **Site URL** → `https://www.iworkatgcc.com` | Stage 3 setup | `http://localhost:5173` | No — and should stay changed. The old value was unused by any code path (the one `signInWithOAuth` call passes `redirectTo` explicitly), but it was the fallback for every auth email. |
| **Redirect URLs** — added 2 preview wildcards | Stage 3 setup | `http://localhost:5173/**` only | No — keep. Harmless after launch; remove the preview wildcards then if you want to tidy up. |
| **Auth SMTP** → Brevo, sender `jobs@iworkatgcc.com`, port 587 | Stage 3 setup | Supabase default sender | No — keep. Nothing used it before: all existing identities are Google OAuth and never trigger a Supabase auth email. |
| **Email provider + Confirm email** | — | Already enabled before this project | n/a |
| **Confirm signup email template** | Stage 3 | Supabase default copy | No — keep. Draft is in `supabase/email-templates/confirm-recruiter-signup.html`. Note this template is project-wide and would also reach any candidate who ever signs up with a password. |
