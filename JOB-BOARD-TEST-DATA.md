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
| W2 | Shorten the verified state on My jobs to a plain **"Verified"** chip. | **Tension Rishi flagged himself:** the current sentence — "Your company is verified, so there is no limit on live roles." — also carries the no-limit fact, and a chip cannot. So the chip needs somewhere else to carry it. Options not yet chosen: next to the slot counter it replaces, on the posting form where the cap is already explained, or on recruiter home. Decide the destination before shortening the line, or the fact is simply lost. |
| ~~W3~~ **DONE in 9b** | ~~The recruiter applications page still shows **"1 new"** above an application whose details have been removed. | `summariseStatuses()` counts by `status`, and anonymising deliberately leaves `status` alone so a recruiter keeps their own shortlist decision. So the count is accurate and the word is wrong: an anonymised application is not "new", it is gone. Either exclude anonymised rows from the summary or give them their own term. **Do not "fix" it by changing what anonymising does to `status`.** **Shipped 23 Nov 2026: anonymised applications no longer count toward "new" and appear as their own figure. Left here rather than deleted, because W6 is about how that same line now reads.** |
| ~~W4~~ **DONE 24 Nov 2026** | ~~The privacy page says **"Delete my data"** under *"Can I take an application back?"* while everywhere else says **"Delete my job board data"**.** Fixed as part of the D3 policy rewrite, with Rishi's agreement: *"Take W4 in D as you suggested — no point leaving the old name in a sentence you're rewriting."* The same stale name was also in a code comment in `Profile.jsx`, now corrected. | The same two-names problem fixed elsewhere on 22 Nov, missed in that one paragraph because it was written before the button was renamed. One word. |
| W5 | **Two tabs called Roles on `/admin`** — the action queue's and the report's. Confusing on one screen. | Rishi, 23 Nov 2026. Renaming one is a word; deciding which is the question. The admin one acts on roles, the report one counts them, so "Moderate roles" / "Roles" or "Roles" / "Role performance" are both defensible. |
| W7 | **The navigation label "Apply Directly" does not contain the word "jobs".** | Raised by me, 23 Nov 2026; Rishi's decision the same day: *"Keep 'Apply Directly' for now. Your reservation is noted and I agree it's real, but the wording review covers the whole site and this is one line. Log it there rather than deciding it in isolation."* The concern: scanning *Explore GCC Jobs · Apply Directly*, a visitor may not realise both are job listings — and the item holding our own roles is the one that does not announce itself as roles. Candidates that keep the distinction and still say jobs: **Direct GCC Jobs**, **Jobs: Apply Directly**. Note the homepage card added the same day says "Apply Directly to GCC **Roles**", so the two surfaces currently word it differently — which the review should settle together. |
| W6 | **The recruiter summary line's figures overlap** — `1 new · 1 not selected · 3 anonymised` sums to 5 against 4 applications, because the not-selected one is also anonymised. | Deliberate, and recorded as deliberate in the W3 note: the first three say what you decided, the last says who can no longer be contacted. But Rishi is right that **a reader will try to add them**, and a figure that invites a wrong sum is a wording problem even when every number is correct. Options: separate them visually, or label the last one so it reads as a qualifier rather than a fourth bucket. |

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

## Stage 9 — admin

| What | Where | How to remove | Status |
|---|---|---|---|
| Audit rows from testing | `public.admin_audit` | **`truncate public.admin_audit;`** — Rishi's decision 23 Nov 2026: all 67 rows are test actions on test accounts, so truncate at merge rather than deleting entries selectively now. Deleting selectively would leave a log with holes in it, which is worse than a log that starts at launch. | PLANNED |
| Verification and suspension states changed while testing | `public.recruiter_profiles` | Set back from `/admin` itself, which is the point of the stage | PLANNED |
| A test company rename | `public.companies` | Rename back from `/admin`; the audit row carries the old name | PLANNED |
| `admin_audit`, 7 `public` functions, 1 `private` function | database | `supabase/migrations/014_admin_audit_rollback.sql` — **it drops the audit log**, so export first | LIVE after migration 014 |

### Stage 9 — what changed the shape of this stage

Before designing it, I checked what an admin could actually do **through the
app**. The answer was nothing:

| Table | Admin write path before stage 9 |
|---|---|
| `recruiter_profiles` | None. Own-row INSERT/UPDATE and an admin SELECT only. |
| `companies` | **None at all** — no UPDATE policy, no DELETE policy, for anyone. |
| `jobs` | Recruiter-only, and the update policy excludes `hidden` on both sides. |

So every verification and suspension to date has been raw SQL in the
dashboard. **This is the first time these actions exist outside the SQL
editor**, which is why the audit row is written by the same function that
performs the change rather than by the page that calls it. A page can forget;
a function cannot.

**No new policies on the tables being acted on.** `companies` and
`recruiter_profiles` still carry no admin write policy afterwards, and check
`c5_no_new_admin_policies` in migration 014 asserts exactly that, so a later
migration cannot quietly take the easier route.

### Stage 9 — reversible and final, split honestly

Rishi's decision was that admin actions should be reversible. **Three cannot
be**, and the split is recorded rather than approximated:

| Action | | Why |
|---|---|---|
| verify ↔ unverify | Reversible | The inverse is the other button |
| suspend ↔ unsuspend | Reversible | Same |
| hide ↔ unhide | Reversible | Same, and only `/admin` can unhide |
| rename a company | Reversible | The audit row carries the old name and slug |
| delete an orphaned file | **Final** | The bytes are gone |
| anonymise on request | **Final** | The columns are erased, which is the feature |
| the nightly retention purge | **Final** | Rows are deleted |

"Reversible" here means **an inverse action exists and the audit row records
the previous value** — not a generic undo engine. The four reversible actions
are toggles, so there is nothing to build for the undo; the audit row supplies
the old value where a toggle is not enough.

**Company merge is out of version 1.** With 1,814 companies seeded, recruiters
pick rather than add, so the realistic repair is a misspelling. If a rename
collides with an existing slug the function refuses and says a merge is what is
needed, rather than doing something else silently.

### Stage 9 — the orphan report is its own authorisation

`/api/admin-delete-orphan` is the only admin action whose target is a
client-supplied string rather than a row id, and the service key can delete
any object in the bucket. So the path is not taken on trust: it must still
appear in `admin_orphaned_resumes()`, which by definition only lists objects
no `candidate_resumes` row points at. **A live candidate's resume therefore
cannot be deleted from that panel at all**, however the request is
constructed.

### Stage 9 — `/admin` is hidden, and hiding is not the security

URL-only, linked from nowhere, and a non-admin sees **"Page not found"**
rather than a refusal — a refusal confirms the route exists.

**That is presentation, not protection, and must never be mistaken for it.**
Every action is a definer function checking `private.is_admin()` in the
database, and both endpoints verify the bearer token with the service key and
read the admin row with the service key — not through the caller's session,
which would be reading a permission from the thing being permitted. Whether
this component renders changes nothing about what a request can do.

### Stage 9 — the 502 on both admin endpoints (migration 015)

**Found by Rishi at step 7, and it broke for the admin too — not only for the
non-admin the step was testing.** Worth recording in full, because it is the
third appearance of the same root cause.

`api/_lib/adminGuard.js` read `public.user_roles` with the service key to
establish whether the caller was an admin. **This project grants
`service_role` nothing by default**, so that read was `42501` and the guard
reported it as "We could not confirm your account" with a 502. Proved from the
database rather than from a log: `has_table_privilege('service_role',
'public.user_roles','SELECT')` was **false**.

**The same root cause had broken a second thing nobody had reached yet.**
`/api/admin-delete-orphan` verified a path by calling
`admin_orphaned_resumes()` with the service key, and that was wrong twice
over:

1. the function is granted to `authenticated` only, so the service key could
   not execute it — `has_function_privilege` was **false**; and
2. **even with a grant it would have returned nothing**, because its `WHERE`
   clause contains `private.is_admin()` and `auth.uid()` is null for the
   service key. Every path would have looked un-orphaned and every deletion
   would have been refused with 409.

So the orphan panel was broken in two independent ways, and the guard's 502
on an earlier step hid both. **The lesson is the ordering of the checklist as
much as the code:** the admin's own path (steps 31, 33) would have failed too,
several steps after a non-admin check that looked like a minor wording issue.

**The fix is two booleans, not a grant.** Granting `service_role` SELECT on
`user_roles` would have worked and widened the one table whose entire design
is that nothing writes it and almost nothing reads it. Instead, migration 015
adds `public.is_admin_user(uuid)` and `public.is_orphaned_resume(text)`, both
**service_role only**, and check `c3_user_roles_still_closed` asserts the
table was not widened instead.

`is_orphaned_resume()` is deliberately **factual, not authorising**: it says
whether an object exists with no `candidate_resumes` row pointing at it, and
nothing about who is asking. The authorisation is the guard plus
`admin_log_orphan_deleted()`'s own actor check — a third copy of the same
decision would be noise. What it still guarantees is the part that matters: a
path with a live row returns false.

**And every failure now looks like a missing route.** Not an admin, a broken
lookup, a bad token: all **404 "Not found."** The old message told an
anonymous caller both that the route was real and that it had tried to check
them. The cost is that a genuine outage is indistinguishable from "not an
admin" *in the response*, which is why the two cases log differently — the
response is for the caller, the log is for us.

### Stage 9 — "every failure looks like a missing route" took three passes

Worth recording because the rule is only worth anything if it has no
exceptions, and it acquired one twice.

| Pass | What leaked | How |
|---|---|---|
| 1 | 502 *"We could not confirm your account"* | Announced that the route was real **and** that it had tried to check the caller |
| 2 | **401 *"Sign in again and retry."*** on the missing-token path | Announced exactly the same thing to exactly the same anonymous caller. Found by Rishi at R2. |
| 3 | **405 with an `Allow: POST` header** on a non-POST | A path that does not exist answers 404 to a `GET`; this one answered 405. Nobody had tried it. |

Also closed in pass 3: a missing `SUPABASE_SERVICE_ROLE_KEY` returned **500
"Server not configured"**, which confirms the route to anyone who asks.

**All five paths now return an identical 404 `{"error":"Not found."}`** — no
token, malformed token, expired token, broken lookup, real non-admin — through
one `notFound()` helper, so a later edit cannot reintroduce a distinguishable
response on one path and not the others.

**The structural invariant, which is checkable by reading rather than
testing:** in both admin endpoints, every `res.status(...)` that is not 404
appears *after* the `requireAdmin` gate. So nothing but a proven admin can
ever see a 400, 409, 502 or 200. If a status appears above that line in a
future edit, it is a disclosure.

**The other endpoints keep their 405 and 500.** `upload-resume`, `resume-url`,
`my-resume-url`, `delete-my-resume` and `delete-my-data` are not hidden
routes — they are linked from pages, and pretending they do not exist would
cost real diagnosability for no gain. **Only the admin pair pretends not to be
there.**

**And the honest cost:** a genuine outage is now indistinguishable from "not an
admin" in the response. The cases log differently, and the common case — an
admin whose session has gone — is caught earlier and more usefully by
`postAsAdmin()` in `src/lib/adminData.js`, which checks for a session before
sending anything.

### Stage 9 — the audit log's growth, answered with measurements

Three questions asked at the first test round, answered from the live database
rather than estimated.

**1. Is there an index supporting newest-first reads?** Yes —
`admin_audit_recent_idx on (created_at desc)`, created by migration 014. And
the planner is already using it rather than table-scanning, at five rows:

```
Limit  (cost=0.15..5.77 rows=100)
  ->  Index Scan using admin_audit_recent_idx on admin_audit
Execution Time: 0.119 ms
```

**2. Did the page load every row?** It was capped at a flat 100 with no way
past it — which is worse than no paging, because **it would have silently
stopped showing history the day the log passed 100 and looked like the whole
truth while doing it.** Now paged at 50 with a Load more, and it shows
"Showing N of M" so a truncated view is visibly truncated.

The cursor is **`id`, not `created_at`**, deliberately: two rows can share a
timestamp, and a keyset cursor on a non-unique column skips rows at the page
boundary — the kind of bug that loses one entry in a thousand and is never
noticed. `id` is a generated identity, so its order *is* insertion order,
which here is chronological order. `admin_audit_recent_idx` is kept anyway,
because the realistic future question is "what happened last March" and that
is the index which answers it.

**3. How many rows a year?** Measured: **282 bytes per row**, 64 kB total for
the table and both indexes at five rows.

| Source | Rows per year |
|---|---|
| Verifications, at five recruiters a week | ~260 |
| Suspensions, hides, renames, anonymisations | tens |
| The nightly purge | **at most 365, usually far fewer** — it writes a row only when it actually deleted something |
| **Total, order of magnitude** | **a few hundred to ~700** |

At 700 rows a year that is **about 200 kB a year**. The Supabase free tier
allows 500 MB. **Deleting old entries would never be the thing that saves you.**

**So: agreed, do not prune, and the reasoning should be recorded rather than
assumed.** An audit log that expires stops being evidence, and the Final rows
are precisely what would be needed to show a deletion request was honoured.

**Is there a size at which that changes? Not realistically — but there is a
shape that would.** The number to protect is not rows per year, it is
**one row per decision, not per affected record.** `purge_expired_applications`
already follows it: one row saying "deleted 40 applications", not forty rows.
If a future action logs per-record — an orphan sweep writing a row per file,
say — volume could jump by orders of magnitude, and the answer even then would
be partitioning or archiving to cold storage, never deletion.

### Stage 9 — the typed confirmations were case-insensitive

Found by Rishi: typing lower-case `delete` on the orphan panel enabled the
button **and the deletion succeeded**, on a form whose own label said to type
`DELETE`.

**Both halves were broken independently, and the earlier specification of this
endpoint was wrong.** I had said it "returns 400 unless the confirmation is
exactly DELETE". It did not:

| Site | What it did |
|---|---|
| `AdminData.jsx` orphan panel | client `.toUpperCase()` before comparing |
| `AdminData.jsx` anonymise panel | the same, on the action that erases a person's data |
| `api/admin-delete-orphan.js` | **server `.toUpperCase()`** |
| `api/admin-anonymise.js` | **server `.toUpperCase()`** |

The client sent `typed.trim()` unmodified, so **it was the server that accepted
it.** Stage 8's `delete-my-data` was correct all along — the defect was a
deviation from a pattern that already existed, in the admin pair only.

**The fix is one comparison instead of six.** `src/lib/confirmations.js` holds
the three words and `confirmed(typed, expected)`, and all six call sites use
it, including stage 8's two — which was a no-behaviour-change refactor, because
leaving two patterns in place is precisely how a transformation gets added to
one of them.

`api/` importing from `src/lib/` is unusual and deliberate: the module is plain
ESM with no browser dependency, and the alternative is two copies of the one
thing that must not vary.

**The rule, written at the function: trim, never fold case.** A typed
confirmation is a deliberate-effort check, and accepting `delete` for `DELETE`
halves the effort while making the label untrue. Surrounding whitespace is
forgiven because it is an artefact of selecting and pasting, not a reduction in
deliberateness.

**22 cases cover it**, including the ones that would have caught this: lower
case refused, mixed case refused, `DELETE` not accepted for `DELETE MY DATA` in
either direction, a prefix insufficient, a superstring insufficient, and an
object with a `toString` returning the right word refused.

> **One of those tests was initially wrong in a way worth recording**: it
> asserted that doubling the inner spaces of a confirmation fails, applied to
> all three words. `DELETE` and `ANONYMISE` contain no spaces, so the
> assertion tested nothing and "passed" by accident on a transformation that
> did not happen. It now runs only against multi-word confirmations. A test
> that cannot fail is worth less than no test, because it looks like coverage.

### Stage 9 — SIGNED OFF 23 Nov 2026

Three rounds, **three bugs, and all three were the same kind of mistake in
different clothes: a thing that was claimed rather than checked.**

| Bug | What it actually was |
|---|---|
| Both admin endpoints returned 502 to **everyone, admin included** | A server-side read of `user_roles`, on a project that grants `service_role` nothing. The third appearance of that trap. It also silently broke the orphan verification in two further ways nobody had reached. |
| Unhiding a closed role **reopened it** and wiped `closed_at` | The inverse assumed `'live'` instead of reading the previous status, which the audit row already held |
| The confirmation comparison **folded case on the server** for both admin endpoints | A deviation from stage 8's correct pattern, in the admin pair only. My specification of that endpoint had been wrong. |

**Results at sign-off, in Rishi's own tests.** `/admin` gives *Page not found*
to a candidate and redirects when signed out; direct function calls return
`P0001 "Only an administrator can do that."`; the orphan report and audit log
both return `[]`. After migration 015 every endpoint failure path returns an
identical 404 — no token, bad token, GET, non-admin. `is_admin_user` and
`is_orphaned_resume` both 403.

**The hidden path, which had never run anywhere, works end to end**: the public
page, the `/gcc-jobs` listing, search, the poster's My jobs panel, the edit page
refusing to load, and a direct `PATCH` changing zero rows. Unhiding restores
`closed` with `closed_at` intact.

**The audit log paged correctly** — "Showing 50 of 67", Load more, 67 of 67, and
SQL agreed.

**Advisor as predicted:** +5 entries, all `admin_*`, under the signed-in
definer-function lint. `admin_audit` absent from `rls_enabled_no_policy`. The
three `service_role`-only functions absent everywhere.

### Stage 9 — two things recorded rather than re-tested

**A6, the audit-log page boundary, is reasoned rather than observed.** Rishi
could not eyeball a gap at the 50/51 boundary from the UI, and he is right that
asserting it from the screen would be theatre. The argument stands on its own:
the cursor is `id`, a generated identity, so it is unique and monotonic with
insertion, and `.lt("id", last)` therefore cannot skip or repeat. **Recorded as
reasoned.** The thing that would make it observable is a test against a fake
client, as `clearResumeFolder` has — worth doing if this ever paginates
something that matters more than a log.

**Reloading a job page reached from `/admin` keeps the `← Admin` link; it does
not fall back.** Rishi found this and correctly judged it harmless. **My
checklist predicted a fallback and my code comment asserted one, and both were
wrong** — the browser preserves `history.state` across a reload by design.

The accurate statement, now in the comment: the fallback triggers on a **new
navigation**, which is every way a URL reaches someone else — a pasted link, a
shared link, a new tab. Rishi confirmed that half directly: a copied URL shows
only `← All roles`. A reload is the same person on the same history entry they
just navigated, so keeping the link is correct, and the link does nothing for a
non-admin anyway. **Nothing to fix; a comment to correct, which is worse than a
bug if left, because the next person reasons from it.**

The same is true of `/my-applications`, for the same reason and with the same
lack of consequence.

### Stage 9 — expected Security Advisor state

Checked directly after migration 014 rather than predicted, so a real finding
can be told from a designed absence. **Compare by category, not by the
dashboard's headline total** — the dashboard groups differently from the raw
lint output.

| Lint | Before 014 | After 014 |
|---|---|---|
| `security_definer_view` (**ERROR**) | 1 | **1** — `question_authors`, dropped after merge |
| `rls_enabled_no_policy` (INFO) | 1 | **1** — `user_activity` only. **`admin_audit` must NOT appear**: it has a SELECT policy. |
| `anon_security_definer_function_executable` | 4 | **4 — unchanged.** No admin function is anon-callable. |
| `authenticated_security_definer_function_executable` | 9 | **14**, +5 |
| `auth_leaked_password_protection` | 1 | 1 |

The five new entries, all expected, all `is_admin()`-gated internally:
`admin_orphaned_resumes`, `admin_rename_company`, `admin_set_job_hidden`,
`admin_set_recruiter_suspended`, `admin_set_recruiter_verified`.

**Migration 015 adds nothing to the advisor**, because both its functions are
`service_role` only. If `is_admin_user` or `is_orphaned_resume` ever shows up
under either definer-function lint, a grant has been widened.

**Five functions must NOT appear anywhere in the advisor**, and their absence
is the advisor confirming the grant split:
`admin_anonymise_candidate_for`, `admin_log_orphan_deleted`,
`purge_expired_applications`, `is_admin_user` and `is_orphaned_resume` are all
granted to `service_role` only.
`private.audit()` is absent too, because the `private` schema is not exposed.

## Stage 9b — admin reporting (SCOPED 23 Nov 2026, not started)

Its own stage, **before stage 10**, because verification decisions are being
made weekly with no numbers and the latency baseline has to exist before real
recruiters arrive. Read-only and additive, so it cannot destabilise stage 9's
action queue — which is why it is not folded into it.

### What it covers

| Section | Figures |
|---|---|
| **Overview** | Headline and reconciliation numbers, from one function so nothing is computed twice |
| **Roles** | applications, unactioned, shortlisted, not selected, anonymised, time to first application, last application, **plus the zero-application view** |
| **Recruiters** | posted / live / closed / hidden / expired, applications received, shortlisted, not selected, last posted, **verification latency**, **cap pressure** |
| **Candidates** | name, roles applied to, first and last applied. **No email in the list** — see below |
| **Data health** | candidates with applications but no resume, orphaned files |

One **Reports** tab with a sub-selector (Overview / Roles / Recruiters /
Candidates). Rishi's decision: five top-level tabs is too many.

### Four functions, and why functions at all

`admin reads all applications` and `admin reads all jobs` **already permit
every one of these reads.** The functions unlock nothing. They exist because an
aggregate returns counts, whereas a client-side group-by ships every
candidate's name and email to a browser in order to count them — the same
principle as stage 7, made even though the policy does not require it.

```
admin_report_totals()      one row  -- every headline and reconciliation figure
admin_role_stats()         per role
admin_recruiter_stats()    per recruiter, including latency
admin_candidate_stats()    per identifiable candidate, no email
admin_candidate_detail()   one candidate, with email -- opened deliberately
```

Zero-application roles and cap pressure are **filters over those**, not new
functions: the page narrows, the surface does not grow.

**One rule the stage rests on: every number has exactly one source.** If the
Roles page sums per-role counts and Overview sums its own, they will eventually
disagree. That is the only reason `admin_report_totals()` exists.

### The reconciliation rule — W3 applied consistently

Rishi's decision, 23 Nov 2026: **a number nobody can act on should not sit in a
count of work waiting.**

| Figure | Anonymised rows |
|---|---|
| Totals, per role and per recruiter | **Included** — they must agree with what the recruiter sees |
| **Unactioned** | **Excluded** |
| Shortlisted / not selected | **Included** — `status` survives anonymising |
| Candidates list | **Absent** — no id, no name, no email to list |
| Anonymised | **Its own figure, beside the totals** |

So the candidates view shows a number **deliberately smaller** than the total,
and the page must state the difference, or the per-candidate figures will not
sum and someone will lose an afternoon to it.

### Verification latency — decision A

**Source: the audit log, not `recruiter_profiles.verified_at`.** That column is
overwritten on re-verification and nulled on unverify, so it is not a
historical record. Latency is `recruiter_profiles.created_at` to the **first**
`recruiter_verified` audit row — first, not latest, because a re-verification
after an unverify is not the original wait.

**The baseline starts the day migration 014 shipped.** Verifications done in
SQL before that have no audit row and must display as **"not measured"**, never
as a null treated as zero, which would drag the average into looking good.

**Rishi's decision: A — weekends excluded, public holidays not modelled.** His
reasoning: *"I'd rather under-report my own performance than model state
holidays."* A holiday therefore counts as a working day, which makes the figure
**pessimistic — it will never flatter.** That is the right direction for a
published promise.

A signup at Friday 18:00 is due end of Tuesday: two working days, **4.2
calendar days**. Measuring calendar time would report a breach that never
happened, which is the whole reason this needed deciding rather than assuming.

### The candidates list — Rishi's shape, and the two details it needs

**Decided: name, roles applied to, first and last applied in the list. Email
only on opening one candidate**, the same shape as the anonymise panel. Not
harder than either option originally proposed — one extra function, and the
email never crosses the wire for the list view at all, which is better than the
full-list option.

**Two details that need stating because they are not obvious:**

- **`full_name` is per application, not per candidate.** Someone who applied
  three times may have three spellings. The list shows **the name on their most
  recent application**, and the same applies to the email on the detail view.
- **A candidate who deleted their data and then applied again** appears with a
  count covering only the applications made since. The earlier ones are
  unlinkable by design, and the reconciliation figure is where they show up.

### The four additions Rishi accepted

1. **Verification latency** against the published two-working-day promise.
2. **Time to first application** per role, and **roles with zero applications
   by age** — the second being the actionable one, since those are the
   recruiters who quietly leave.
3. **Cap pressure** — unverified recruiters at or near ten live roles, a
   verification-queue signal currently invisible.
4. **Resume-less candidates** — `candidate_resumes` against distinct
   candidates with applications. Should be equal; a gap means something broke.

**One sequencing fact:** all of these come from existing tables plus the audit
log. Nothing needs new collection **except "did anyone look at the role", which
needs stage 11.** So the honest funnel in 9b is applications → shortlisted →
not selected, and views can only be added afterwards.

### 9b TOUCHES A SIGNED-OFF STAGE

**W3 moves into 9b** (Rishi's decision: not into stage 9's current round, which
is mid-retest of the hide/unhide bug and should not gain a second moving part).

The change is **`summariseStatuses()` in `src/lib/applicationDisplay.js` plus
its tests — no migration.** `recruiter_applications()` already returns
`is_anonymised` and the function already receives it and ignores it. Anonymised
rows stop counting toward "1 new" and get their own figure.

`recruiter_application_counts()` — the "1 application" on My jobs — **stays
exactly as it is**, because that is a total, and totals include anonymised.

> **9b's checklist must retest stage 7's applications panel.** It is a
> signed-off stage and this changes one line of what it displays.

### Stage 9b — migration 017, and two faults caught by dry-running it

**The migration would have failed outright when run.** `percentile_cont`
returns `double precision`, and `round(double precision, integer)` does not
exist in Postgres — only `round(numeric, integer)`. Found by executing the
query body against the live database before shipping it, not by reading it.
Fixed with an explicit `::numeric` and a comment saying why, since it looks
like a redundant cast.

A second fault in my own check queries: `c3` tested
`information_schema.columns` for a *function* name, which is always zero, so
half of it could never fail. It now compares `pg_get_function_result` for both
candidate functions — the list must not mention email, the detail must.

**The working-day arithmetic was verified as data**, five cases including the
one that justified the whole decision:

| | Working days |
|---|---|
| Friday 18:00 → Tuesday 17:00 | **2** — within the promise |
| Friday 18:00 → Wednesday | **3** — a breach |
| Monday → Tuesday | 1 |
| Monday → same day | 0 |
| Saturday → Monday | 1 |

### Stage 9b — c5 could not pass, which is the other half of the c3 lesson

**Rishi's diagnosis was exactly right.** Every report function gates on
`private.is_admin()`, which reads `auth.uid()`, which reads
`request.jwt.claims` — and **the SQL editor has no JWT**. So all five returned
zero rows, a scalar subquery over zero rows returned **NULL**, and
`0 + NULL = NULL` failed against the total. Confirmed from the function
definition rather than inferred: `auth.uid()` is
`coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid`,
and both settings are null in the editor.

**It is the same trap as `admin_orphaned_resumes()` in stage 9** — a function
whose `WHERE` contains `is_admin()` returns nothing rather than refusing — and
I wrote a check that depended on it.

Together with `c3` in the first draft of the same file, which queried
`information_schema` for a *function* name and so could never fail, the pair is
worth stating as a rule, and it is now in the file:

> **A check that cannot pass is as useless as one that cannot fail. Both look
> like coverage and neither is.**

**The fix tests the rule, not the session**, in three statements whose order
matters:

| | |
|---|---|
| **9a** | With no session, assert **every** report returns zero rows. The gate, verified rather than assumed. |
| **9b** | `set_config('request.jwt.claims', …, true)` — become the admin **for this transaction only**, reading the id from `user_roles` rather than hardcoding it |
| **9c** | `c0` asserts the impersonation carried, then the arithmetic runs against the real functions |

**Why impersonation rather than recomputing from base tables**, which was the
other option: recomputing would assert an arithmetic identity about the table
and never execute the functions at all, so a bug in one of them would pass.
This way `c5` compares the numbers the application will actually display.

Verified that it works before shipping it: `set_config(..., true)` in one
statement and `auth.uid()` in the next returns the admin uuid, because the
editor runs a script as a single transaction. **`c0` exists because that is an
assumption** — if it ever stopped being true, the arithmetic would fail
mysteriously instead of saying why.

`true` makes it transaction-local, so it cannot leak into the session. Nothing
is granted; it supplies a session the editor does not have.

### Stage 9b — W3, and why the figures deliberately do not sum

`summariseStatuses()` now excludes anonymised applications from **"new"** and
shows **"N anonymised"** as its own part. `recruiter_applications()` already
returned `is_anonymised`; the function received it and ignored it. **No
migration.**

`recruiter_application_counts()` — the "1 application" on My jobs — is
unchanged, because that is a **total**, and totals include anonymised.

**The anonymised figure is a separate axis, not a fifth bucket**, which is why
the parts need not add up to the number of cards:

- *new / shortlisted / not selected* answer **what did you decide**
- *anonymised* answers **who can no longer be contacted**

An application you shortlisted whose candidate then deleted their data is
counted in **both**, and the card itself already shows the same two facts: a
Shortlisted chip and "Details removed". Forcing them into one partition would
mean either losing a decision you made or inventing a sum nobody asked for.

### Stage 9b — a silent no-op in my own tooling, worth recording

While adding the report-formatting tests, a Python `s.replace()` that inserted
an import **matched nothing and failed silently**, because the anchor string I
used belonged to a different test file. The tests then ran and died on
`notMeasured is not defined`.

Harmless here because it failed loudly at runtime. Worth recording because the
same edit a line later — into a *source* file rather than a test — would have
produced a file that still compiled and silently lacked the change. **Every
edit in this project's tooling should assert its anchor matched**, and the
ones that do are the reason several of these edits have failed fast instead of
quietly.

### Stage 9b — two raw database values on screen, one found and one not

Rishi found the candidate detail panel listing applications as `applied`,
`shortlisted`, `not_selected` — lower case, with an underscore, on the one
surface that had not been routed through `statusLabel()`.

**The same defect was one view over and he had not hit it yet.** The Roles
table's status pill rendered `admin_role_stats().display_status` unchanged:
`live`, `closed`, `expired`, `hidden`. Two of those — `closed` and `hidden` —
**are** `jobs.status` column values, and every other surface in the product
says Live, Closed, Expired, Hidden.

Both fixed: the panel uses `statusLabel()`, and the pill uses a new
`roleStatusLabel()` in `src/lib/reportFormat.js` so it is testable rather than
inline. Nine cases, including that no label is lower case, none contains an
underscore, and an inherited key like `constructor` returns "Unknown" rather
than a function.

**The pattern worth noticing:** every time a new surface renders an existing
value, it is a fresh opportunity to leak a token, and the rule has now been
broken in stages 8, 9 and 9b. A label function per value type, imported rather
than re-expressed, is the only thing that has actually held.

### Stage 9b — the "not measured" safeguard did not catch its own case
(migration 018)

**Rishi's observation, and it was more than a note.** Reports → Recruiters
showed `iworkatgcctest1` as a **5-working-day breach** of the two-working-day
promise, with "Not measured" reading **0**.

That recruiter was really verified by hand in SQL on 16–19 Nov, before the
audit log existed. The only recorded verification is a test one from 23 Nov. So
`first_verified_at()` found an audit row, called it the first verification, and
measured signup to a re-verification seven days later.

**The safeguard was built to report "not measured" in exactly this case and
failed to, because it tested whether an audit row EXISTS rather than whether
the row it found is the ORIGINAL event.**

**The inference that fixes it:** an account cannot be *unverified* unless it was
verified first. So a `recruiter_unverified` row preceding the earliest
`recruiter_verified` row proves the original verification predates the log.
Confirmed against the data before writing it — **audit row id 1 for that
recruiter is `recruiter_unverified`.**

This is not a workaround for test data. **It is the correct general rule:** any
account verified outside the log and later re-verified through `/admin`
produces exactly this pattern, and its original wait is genuinely unmeasurable.
Saying "not measured" is honest; inventing 5 working days is not.

**What it cannot fix**, stated so it is not mistaken for complete: a SQL
verification never re-verified through `/admin` leaves no trace at all. It
already reads as not measured, correctly, but for the weaker reason that there
is nothing to find. And from here the question disappears — every verification
goes through `admin_set_recruiter_verified()`, so the first audit row *is* the
first verification. This only ever mattered for accounts predating migration
014.

### Stage 9b — a moving denominator in the promise statistic (migration 019)

**R7 failed, and not for the reason the step gave.** I wrote that unverifying a
recruiter should not wipe their measurement, since 018 keys off an unverify
*preceding* the first verify. It did wipe it, and that rule was not the cause.

`admin_report_totals()` computed latency from
`from public.recruiter_profiles r where r.is_verified`, so unverifying someone
removed them from the statistic altogether. Rishi named the cause exactly in
his second hypothesis.

**The fault is a moving denominator.** "Currently verified" and "has ever been
verified" are different populations, and the promise is about the second. A
recruiter who waited five working days waited five working days; unverifying
them later does not unmake it. Under the old filter a **published-promise
statistic changed retroactively** — and it moved in the **flattering**
direction, because the breach simply left the sample.

His follow-up was the right instinct too: *"Not measured should arguably be 2."*
Neither was right. The recruiter was not unmeasured, it was **excluded** — and
that is the tell for a moving denominator.

**It also broke a rule this stage was built on, in a way the rule did not
cover.** Migration 017 says every number has exactly one source, so the
Overview must not add up what another view returned. It does not. But the
Overview and `admin_recruiter_stats()` defined their **population**
differently — the latter has no `is_verified` filter and was right all along —
so the two views disagreed about the same recruiter:

| | `iworkatgcc`, measured at 5 working days |
|---|---|
| Recruiters view | showed it as over two working days |
| Overview | reported **0 breaches** |

Same bug class, different axis. **"One source per number" was not enough; it
needed to be "one source per number AND one population per question."**

**The checks are now the cross-view assertions that would have caught it:** c1
and c2 assert the Overview's measured and breached counts equal what the
Recruiters view reports, and c3 asserts measured + unmeasured equals everyone
ever verified — so nobody can be silently excluded again.

Rehearsed against live data before shipping: measured **1**, unmeasured **1**,
within **0**, breached **1**, median **5** — with `iworkatgcc` counted at 5
working days despite not being verified right now, which is the whole point.

### Stage 9b — the test data is in an unusual state, on purpose

After stage 9's testing, **all 10 applications are anonymised.** So when 9b is
first opened:

- the candidates report is **empty**
- `applications_unactioned` is **0**
- `applications_anonymised` equals `applications_total`

**That is the reconciliation rule working, not a bug.** It also means check
`c5` exercises the interesting path from the first run: `0 + 10 = 10`. Applying
again from the test Gmail is what populates the candidate side.

### What 9b needs before it starts

One migration (**017**). No new environment variables. Nothing from Rishi
beyond stage 9 being signed off first.

### Stage 9b — SIGNED OFF 23 Nov 2026

Three rounds. **Two real bugs, both found by testing rather than review**, and
both of a kind that reading the code would not have caught.

| Bug | Why review would have missed it |
|---|---|
| Raw status values leaking into **two** new surfaces — the candidate panel and the Roles pill | Each one looks correct in isolation. The defect is only visible against the rest of the product, where every other surface capitalises. |
| The verification population defined as **currently** verified rather than **ever** verified | The line `where r.is_verified` reads like "verified recruiters". It takes toggling a recruiter and watching a published statistic move to see that it means something else. |

**The second was the serious one.** It moved a published-promise statistic
**retroactively, in the flattering direction** — unverifying a recruiter
removed their breach from the sample. And it made two views disagree about the
same person while each was internally consistent.

| Round | What came back |
|---|---|
| 1 | `c5` could not pass from the SQL editor — the check, not the code |
| 2 | Raw status values in the candidate panel; and an observation about verification that turned out to be a defect |
| 3 | R7 failed: the measurement vanished on unverify |
| — | All passed. Signed off. |

**What Rishi's testing contributed that the code review did not:** every one of
the three rounds was a case where a stated behaviour did not hold, and in two
of them my own explanation of the cause was wrong before his diagnosis
corrected it. R7's step text said the unverify rule was the likely cause; it
was not, and his second hypothesis was right.

### Stage 9b — the rules this stage added, worth carrying forward

- **A check that cannot pass is as useless as one that cannot fail.** Both
  halves happened in the same file, one round apart.
- **One source per number AND one population per question.** The first was
  written down in 017 and honoured; the second was not stated and was broken.
- **A label function per value type, imported rather than re-expressed.** The
  only thing that has actually stopped raw column values reaching a screen
  across stages 8, 9 and 9b.
- **Null is not zero.** An unmeasured verification displayed as "0 days" would
  make a published promise look perfect precisely where there is no evidence.

## Stage 10 — SEO, and making the board findable (ROUND ONE BUILT 23 Nov 2026)

**One stage, two rounds, signed off separately — Rishi's decision, 23 Nov
2026.** Round one is everything that is fully testable on a preview: the board
becomes reachable, and a candidate can save a role. Round two is the SEO work,
which is only partly testable before merge (see P3).

### Round one — what was built

| Piece | Where |
|---|---|
| `job_saves` table, three policies, `my_saved_jobs()` | `supabase/migrations/020_job_saves.sql` |
| The saves hook (optimistic, sign-in popup) | `src/lib/useJobSaves.js` |
| Pure display helpers for the three states | `src/lib/savedJobsDisplay.js` |
| The RPC read and the delete | `src/lib/savedJobs.js` |
| The Save control | `src/components/SaveJobButton.jsx` |
| Save on the list and on the detail page | `src/Pages/GccJobs.jsx`, `src/Pages/GccJobDetail.jsx` |
| `/profile/saved-jobs` | `src/Pages/SavedJobs.jsx` |
| "Roles Saved" counter, third tile | `src/Pages/Profile.jsx` |
| **"Apply Directly" in the header nav → `/gcc-jobs`** | `src/components/SiteHeader.jsx` |
| 111 assertions on the helpers | `scripts/stage10-saves-test.mjs` |

### A saved role has three states, and only one of them is the normal case

`public.jobs` has a select policy built on `private.job_is_public()`, so a role
that closed, expired, was hidden by an admin, or whose recruiter was suspended
**stops being returned to the browser entirely**. A plain join from `job_saves`
would therefore drop exactly the rows the page exists to explain — and the
counter on `/profile` counts *rows in `job_saves`*, so the number and the page
it opens would disagree. A page showing four cards under a counter reading six
is a bug report.

So `my_saved_jobs()` returns **every** save with an availability:

| State | Means | What is shown |
|---|---|---|
| `open` | still accepting applications | the ordinary job card |
| `closed` | filled, closed by the recruiter, or past its closing date | a flattened card: which role it was, and that it has closed |
| `withdrawn` | hidden by an admin, or its recruiter is suspended | **no title, no company, no link** |

**The difference between the last two is not cosmetic.** A closed role was a
real posting that ran its course, and someone who bookmarked it is entitled to
know which role it was. A withdrawn role was taken down *by us*, which is the
one case where continuing to print the recruiter's words would undo the
removal. The function nulls every display column for those, so the page cannot
render one by accident.

**An unrecognised availability is treated as withdrawn, not as open.** That is
the fail-closed direction, and it is the one a future `jobs.status` value will
exercise. Asserted in the test script across nine bad values.

### Round one — open decisions for Rishi

| # | Decision |
|---|---|
| D1 | **The nav label.** Built as "Apply Directly", as instructed. My one reservation, recorded: it does not contain the word "jobs", so a visitor scanning *Explore GCC Jobs · Apply Directly* may not realise both are job listings — and the item holding our own roles is the one that does not announce itself as roles. "Direct GCC Jobs" or "Jobs: Apply Directly" keep the distinction and still say jobs. One-line change either way. |
| D2 | **A homepage hero card for the board.** `src/components/Header.jsx` carries the homepage cards and one already says "Explore GCC Jobs". A card there would be seen by far more people than a nav item. Not added, because it was not asked for. |
| D3 | **Does "Delete my job board data" also forget saved roles?** Not changed, deliberately. Saved *questions* are explicitly untouched by that endpoint; the privacy policy names applications and the resume and nothing else; and a saved role holds no personal detail an application does not already hold. But the button says "job board data", and a saved role plainly is. If the answer is yes, the privacy policy needs a line and `api/delete-my-data.js`'s header comment is currently wrong. Deleting the **account** already clears these rows, by the cascade. |

### Round two — scope, recorded before it starts

- Per-request job detail pages with `JobPosting` JSON-LD; `noindex` removed.
- 404 for a job that is not public, so Google drops it (spec allows 404, 410,
  a past `validThrough`, or removing the markup; no stated preference).
- **No markup on `/gcc-jobs`** — "Don't add structured data to pages intended
  to present a list of jobs", and exactly one job per page.
- `jobLocation` as `Place` + `PostalAddress` with `addressCountry: "IN"` plus
  the city; `jobLocationType: TELECOMMUTE` only for "Anywhere in India".
- `directApply` **omitted** — our flow has a sign-in in the middle, so the
  claim would be false. Rishi, 23 Nov 2026.
- Indexing API **out of v1**. Rishi, 23 Nov 2026.
- `employmentType` values are case-sensitive: `FULL_TIME`, `PART_TIME`,
  `CONTRACTOR`, `TEMPORARY`, `INTERN`, `VOLUNTEER`, `PER_DIEM`, `OTHER`.
- **India is in Google's listed countries.** Confirmed against the live spec
  page, 23 Nov 2026, before building: the Asia list is Bangladesh, Hong Kong,
  **India**, Indonesia, Japan, Kazakhstan, Kyrgyzstan, Malaysia, Pakistan,
  Philippines, Singapore, Sri Lanka, Taiwan, Thailand, Uzbekistan, Vietnam.
  No date marker on that section.
- **Raise the description minimum from 50 to 400 characters.** Google's only
  stated rule is the negative one — "We don't allow job postings with
  incomplete job descriptions" — and there is no number in the spec, so a
  counter cannot enforce completeness; it can only catch the one-liner. 400 is
  roughly 60–70 words. Stage 9's admin hide is the backstop for a post that
  clears 400 and is still junk. The message names the consequence: *"Describe
  the role in at least 400 characters — you have N. A thin description stops
  the role appearing in Google's job results, where most candidates will find
  it."* **The CHECK constraint on `jobs.description` is still `>= 50` and must
  be raised in the same migration, or the form and the database disagree.**

### Stage 10 round one — SIGNED OFF 23 Nov 2026

Rishi's result, verbatim: *"Round one signed off. Migration 020 re-run: 8
checks, 8 PASS, with the figures readable. Nav works and recruiters don't see
either link. Save works signed out → sign in → filter survives. Three saves
persist across reload, list and detail agree, toggle works both ways. Tile and
page counts match at every step. Closed role shows the grey panel with its
title; hidden role shows 'A role you saved' with nothing of the posting;
unhide restores; Remove drops both counts. Second account sees the empty state
and job_saves has exactly one user's rows. No overflow at 375px."*

The three decisions he returned with:

| # | Decision | Outcome |
|---|---|---|
| D1 | **Keep "Apply Directly" for now.** *"Your reservation is noted and I agree it's real, but the wording review covers the whole site and this is one line. Log it there rather than deciding it in isolation — W7."* | Logged as **W7**. No code change. |
| D2 | **Add the homepage card.** *"A nav item only reaches people already looking; the homepage reaches the 2,520 members who don't know the board exists. That's the findable half of the stage."* | Built 23 Nov. Fourth card in `ACTION_ITEMS`, second position, orange accent, paper-plane icon. Grid moved from `md:grid-cols-3` to `md:grid-cols-2 lg:grid-cols-4` — **a visible homepage layout change for every member**, because three columns plus a fourth card leaves one card alone on a second row. |
| D3 | **Include saved roles in "Delete my job board data".** *"The button's name is a promise, and a saved role is plainly job board data. It also reveals something an application doesn't: which employers someone was interested in but never approached. Saved questions staying untouched doesn't argue against this — those aren't job board data."* | Migration 021. See below. |

**D2 had a side effect worth recording as a result, not a footnote.** The
homepage is prerendered, so `dist/index.html` now contains a real
`<a href="/gcc-jobs">`. A crawler reaching the homepage finds the board
**without running JavaScript** — which is part of what round two was for,
delivered early by where the card happens to live.

### Stage 10 — D3's policy wording, approved 24 Nov 2026

Four changes, all approved as drafted:

| Where | What changed |
|---|---|
| **What we collect** | A new `<h3>When you save a role</h3>`. It sits between the community section and the application section because a saved role is the **only** job board data collected from someone who has not applied — so it cannot live under "When you apply", and it is not community data either. It states plainly that the recruiter is told nothing: not who saved the role, not how many did. |
| **What we collect** (community) | *"which posts you have saved or liked"* → *"which **questions** you have saved or liked"*, so the two kinds of save are never confused anywhere in the document. |
| **What we keep and for how long** | A retention line: saved roles last until removed, until the job board data is deleted, or until the account is deleted — whichever comes first. |
| **Deleting your data** | A new bullet before the applications one: every saved role is **deleted, not anonymised**, because there is nothing in a bookmark worth keeping once someone has asked to be forgotten. And the "not touched" bullet now names **saved questions** explicitly. |
| **Can I take an application back?** | Rewritten to include saved roles — and **W4 fixed in the same sentence**, since it was being rewritten anyway. |

**`LAST_UPDATED` deliberately left at 22 November 2026.** Carried item 1 sets
it to the real launch date at merge, and no date is correct before then: the
policy is not published, so "24 November" would be as untrue as "22
November". This is the one place where leaving a stale value is the honest
choice rather than the lazy one.

**D3 is now complete.** The code was ahead of the promise between 23 and 24
November, which was only safe because nothing merges until stage 11.

### Stage 10 — D3, and the argument I got wrong

Migration 020's header argued *against* including saved roles, on the grounds
that "a saved role holds no personal detail that an application does not
already hold". **That was wrong, and Rishi's reason is the one the file should
have reached:**

> An application tells an employer something they already know. A saved role
> says *interested, and did not approach* — which nobody knows at all.

That is a disclosure with no counterpart anywhere else in the system, and it
is exactly what a delete-my-data button exists for. 020's header is annotated
as superseded rather than rewritten, because a migration is a record of what
was run and what was believed when it ran.

**It went INSIDE `anonymise_job_data_for()` rather than beside it, for two
reasons.** Atomicity: a second RPC could half-succeed, and the endpoint would
then have to describe a half-finished deletion to someone who had just typed
`DELETE MY DATA`. And it keeps 020's `c3` true — no grant to `service_role` on
`job_saves` was needed, because a definer function runs as its owner. 021's
`c5` asserts that grant still does not exist.

Two faults caught while writing 021's own checks, both of the same kind —
**a check that can destroy real data is worse than no check**:

- `c3` calls a destructive function on a real account. It now proves the
  subject has zero applications, zero resume rows and zero saves *before*
  calling, and reports FAIL without calling anything if not.
- `c4` called the same function and did **not** repeat that proof. If `c3` had
  bailed out because the subject was dirty, `c4` would have gone ahead and run
  it on exactly the account `c3` had just refused to touch. The guard is now
  duplicated on purpose.

### Stage 10 — eight checks that could not be read (the same lesson, third form)

Migration 020 as first shipped reported all eight checks with `raise notice`.
**Supabase's SQL editor does not display notice output at all**, so a
completely clean run printed "Success. No rows returned" and every PASS was
invisible. The checks were sound and their figures were real; there was simply
no way for the person running the file to see either.

Rishi, 23 Nov 2026: *"That's the third time a check has been written in a form
I can't read — c3 that couldn't fail, c5 that couldn't pass, and now eight
that are invisible. Same lesson each time. From here, migration checks should
return a result row like 017/018/019 did, not notices."*

| Migration | The fault | The form of it |
|---|---|---|
| 015 c3 | queried `information_schema.columns` for a *function* name | a check that could not **fail** |
| 017 c5 | `is_admin()` returned zero rows, so the scalar subquery was NULL | a check that could not **pass** |
| 020 v1 | eight `raise notice` calls in an editor that shows none of them | eight checks that could not be **read** |

**THE RULE, now in force for every migration from 020 onwards: a migration's
checks end in a `select` that returns one row per check, with the figures in a
`detail` column whether it passed or failed.** A check is only a check if its
outcome reaches the person running it — and a check that shows its numbers
only on failure is a check whose numbers nobody ever sees, which is most of
how this went wrong.

020 was rewritten to that form, 23 Nov 2026. The results collect in a
temporary table rather than one wide select — which is what 019 used — for two
reasons: the editor shows the result of the **last** statement only, and `c7`
has to write rows before it can read them back through the function, so it
cannot be a column in a single select.

**The original run did pass.** Every check raised on failure, so a run with no
exception plus `job_saves` holding zero rows afterwards is direct evidence:
`c7` cannot reach its end without having inserted three rows, read exactly two
back, classified both correctly, and deleted them. What was lost was the
figures, not the verdict.

### Stage 10 — the board's placement changed, 24 Nov 2026

Rishi's decision, verbatim: *"New placement for the board, replacing what
round one shipped. Remove the 'Apply Directly' link from the header and the
card from the homepage. Both go. Instead, a promo card at the top of /jobs,
above the Notify Me box."*

His reason, which is the better argument: `/jobs` is where someone is already
looking for work, so the card reaches them **mid-search**. A nav item reaches
people already looking for the board; a homepage card reaches people who
arrive at the homepage. Neither is a person in the middle of a job hunt.

| What | Then | Now |
|---|---|---|
| Header nav | "Apply Directly" item | **removed** |
| Homepage | fourth action card, four-column grid | **removed**, grid back to three; `FeatureCard.jsx` restored byte-for-byte |
| `/jobs` | nothing | promo card above the Notify Me box, "New Feature" badge, heading **Exclusive jobs** |
| `/gcc-jobs` empty state | "Recruiters post roles here directly. Check back shortly." | Rishi's wording, plus two links; signed-in variant |
| `/gcc-jobs` last page | nothing | "More direct GCC jobs coming soon" |

This **supersedes** decision 27 (add the homepage card) rather than undoing it:
the findability problem 27 named is real, and the promo card is the answer to
it. **D1 (the nav label) and D2 (a homepage card) are closed by removal.**

#### The card, third version: a feature-announcement banner, 24 Nov 2026

Rishi supplied an illustration and a brief: two columns on desktop, text left
and artwork right, on a very pale gradient — *"Not a saturated filled panel;
the last version was too heavy."*

**The illustration was not in the repo.** It arrived attached to the message
rather than committed, so it was written to
`public/exclusive-jobs-illustration.svg` **verbatim** — not recoloured, not
redrawn, as instructed.

| | Second version | Third version |
|---|---|---|
| Background | blue-600 → purple-700, filled | white → blue-50 → teal-100, very pale |
| Text | white on saturated blue | navy heading, blue accent, slate body |
| Badge | white/20 pill | teal-200 pill, navy text, letter-spaced, megaphone glyph |
| CTA | text link with arrow | solid blue pill button with arrow |
| Artwork | none | his SVG, right, bleeding past the edge |
| Corners | 16px | 24px |

**The CTA is a `<span>`, not a `<button>`.** The whole card is a link, and a
button inside an anchor is invalid HTML — a nested interactive element, which
keyboard navigation and screen readers both handle badly. It is styled as a
button with the card as the click target: one thing to click, one thing to
announce.

**The illustration is not rendered at all below `md`**, rather than scaled
down. Rishi: *"I'd rather lose the artwork than squeeze it."* `hidden
md:block` means a phone never downloads 4KB it will not show.

**Two colour observations, reported rather than fixed** (he asked to be told
rather than have the file edited):

- The **yellow sparks** (`#FACC15`) are back on the card, in his artwork. He
  had asked for yellow to go because it read as a warning; three small sparks
  in the top-right corner read as an accent rather than as caution, so they
  were left alone — but the earlier note was explicit enough to flag this
  against.
- The **laptop base** (`#CFE0FA`, pale blue) lands on the blue-50 part of the
  gradient, which is nearly the same value. It may look faint. The laptop's
  navy bezel keeps the screen itself defined, so this is the one element worth
  a second look.

**Verified rather than assumed**, as with the previous version: every
arbitrary-value class (`w-[260px]`, `md:grid-cols-[1fr_auto]`,
`tracking-[0.12em]`) was confirmed in the compiled Tailwind v4 CSS, and the
prerendered `/jobs` confirmed to carry the badge, the two-tone heading, the
pill button and the `<img>`.

#### The card's colour and copy, revised 24 Nov 2026

Rishi, after seeing it: *"Drop the yellow. It reads as a warning rather than
an announcement."* He is right, and the reason is worth keeping: yellow is the
colour this site uses for nothing and the colour the whole web uses for
caution, so amber was carrying a meaning nobody intended.

Replaced with **blue into purple** — both already in use on the homepage
cards, no new hue, because the design pass is still deferred until every stage
is done and this must not pre-empt it. It is the **saturation** that does the
work, not the hue: everything else on `/jobs` is a white card or the pale blue
Notify Me box directly below, so a filled, shadowed panel reads as an
announcement while still being the site's own blue. A gradient and two
blurred highlights supply the depth he asked for — *"flat colour reads as a
notice, a lit surface reads as a feature."*

Checked rather than assumed: the project is on **Tailwind v4**, which renamed
the gradient utilities, so every class used was confirmed present in the
compiled CSS before pushing.

| | Then | Now |
|---|---|---|
| Heading | "Exclusive jobs" | **"Exclusive GCC jobs"** |
| First sentence | "...posted directly to our website." | **"...posted directly to our community website."** |
| Colour | amber-50 / amber-300 | blue-600 → purple-700 gradient, white text |

**The line break he spotted was a real fault.** The body had `max-w-2xl`
(672px) inside a card already constrained by the page's `max-w-6xl` column —
a second cap doing nothing but breaking the sentence with half the line above
it empty. Removed; the card's own width is the only constraint now.

Also on his instruction, the `/gcc-jobs` subtitle became **"Posted directly by
the people hiring for GCC roles."** The old one ("...you are not sent off to
another site") explained the board by contrast with `/jobs`, which only makes
sense to someone who already knows both pages.

#### The card only renders when the board has live roles — and a plain count would have got that wrong

Rishi's rule: *"The card only appears when the board has live roles. No live
roles, no card."*

`/jobs` makes **no database query at all** today — the listings are a static
`/data/jobs.json` — so this needed one. The obvious version, counting
`public.jobs` from the browser and letting RLS filter it, is wrong. Postgres
ORs a table's SELECT policies together, and `public.jobs` has three:

| Who is asking | What a plain `count(*)` returns |
|---|---|
| a visitor | the public roles |
| a recruiter | public roles **plus their own** pending, closed, expired, hidden |
| the admin | **every row in the table** |

**Rishi is the admin.** On a board with no live roles but one closed test
posting, he would have been the one person on the site seeing a card that
promised roles and clicked through to an empty board — the exact failure the
rule exists to prevent, found first by its author.

`public.live_job_count()` (migration 022) is `security definer`, takes no
arguments, and applies the same `private.job_is_public()` the public read
policy uses, so the card and `/gcc-jobs` cannot disagree about what "live"
means. Filtering client-side with `.eq('status','live')` would have needed no
migration and missed the suspended-recruiter half of that condition.

**Migration 022's checks force the roles.** The Supabase SQL editor runs as
`postgres`, which has `BYPASSRLS`: a plain `count(*)` there returns every row
whatever JWT claim is set, so a check written that way would prove nothing but
its own privilege. c3 and c4 use `set local role anon` / `authenticated` —
the two roles the browser actually uses — and measure both numbers for all
three personas. **c4 fails when the bug is absent**, on purpose: if a plain
count were already correct, the migration is dead weight and should be deleted
rather than trusted.

#### What the card costs a visitor

One extra request per `/jobs` load: a single integer over RPC, fired in the
**same effect** as the `jobs.json` fetch rather than after it, so the two
overlap and nothing on the page waits for it. Rejected alternative: baking the
count into a static file at build time (free per visitor), because the
staleness window is up to 24 hours — the first role ever posted would not
light the card until 02:00 the next morning, which is both wrong and
untestable in one sitting.

**Fail closed.** An error, a null, a NaN, a string or a negative all resolve to
*no card*. The one outcome worse than a visitor not seeing the card is a
visitor clicking it into an empty board.

#### The prerender had to be taught to wait

`/jobs` is prerendered, and the count is issued from an effect after
hydration — which can start **after** `networkidle` has already been
declared. Saving then would have put the card on `/jobs` on some builds and
not others, with nothing in the output to say which had happened. The wrapper
publishes its decision as `data-board-promo="pending|show|hide"` and
`scripts/prerender.mjs` waits for it to stop saying `pending`.

Proved both ways locally, 24 Nov 2026: with no function in the database the
prerendered `/jobs` carries `data-board-promo="hide"` and no card; with a
positive count it carries the badge, the heading, the body and a real
`<a href="/gcc-jobs">`.

#### The "New Feature" badge takes itself off

Rishi's decision: `NEW_FEATURE_UNTIL`, **eight weeks, set at merge alongside
`LAST_UPDATED`** (carried item 20). Not a role count, and not a reminder.

The badge's job is to make the ~2,520 members who already know `/jobs` notice
the page has changed; they will nearly all have passed through within a few
weeks. A role count measures **supply**, which is a different fact — the board
could hit 40 roles in a fortnight while the feature is still new, and worse, it
would keep the badge shouting "New Feature" over an empty board. Rishi:
*"Your reasoning about an empty board shouting 'New Feature' is the failure I
wanted to avoid."* The comparison happens at render, so the live page drops the
badge the moment the date passes and the 02:00 rebuild refreshes the
prerendered `/jobs` within a day.

#### The empty state is now mostly unreachable, and kept anyway

Rishi: *"I know this is now mostly unreachable, since the card won't be there
when the board is empty. Keep it anyway as a fallback for direct URLs."* It
remains reachable by a bookmark, a typed URL, or a search result that outlived
the roles it was indexed from.

**He corrected the wording himself**, from "we'll notify you" to "we'll
announce it there": *"you were right that joining the community doesn't put
anyone on the jobs alert list, and I'd rather promise what I'll actually do."*
The two lists are genuinely different — `/signup` creates a community account
whose only automated email is the digest about hearts and answers, while the
jobs alert list is the Notify Me box on `/jobs`, which posts to a Google Apps
Script. **No new automated email is involved, so the one-Brevo-email rule is
intact.**

The **filtered** miss keeps its own answer. Someone who searched for a Pune
finance role and found none is not asking to be told about the feature — they
want their filters back.

**Signed-in members see a different third sentence and a different first
link**, because `/signup` *redirects a signed-in person to `/welcome`*: the
link would not merely read oddly, it would not work. `userId` is now
three-state (`undefined` / `null` / id) so the page says nothing rather than
flashing the wrong sentence for half a second.

#### Decision 29 — `/post-a-job` now tells a signed-in member that accounts are separate

`/post-a-job` was linked from **nowhere a candidate could reach** — only a
typed URL or `RecruiterRoute`'s redirect. The empty state's "Are you a
recruiter or GCC leader?" is its first public entrance, which means a
signed-in community member can land on a sign-up form while already holding a
session; filling it in would open a second account on a different email and
replace the session they arrived with.

Rishi, 24 Nov 2026: *"yes, add the line on /post-a-job telling a signed-in
community member that recruiter accounts are separate."* The form is left
available — a community member may genuinely be a GCC leader who wants to post
— it is just no longer silent about what is about to happen. **This touches a
signed-off page: carried item 21.**

#### W8 — three vocabularies for one thing

Logged for the site-wide wording review, not fixed here. The same feature is
now called **"Exclusive jobs"** (the promo card), **"posted directly to our
website"** (its body), **"Roles posted on iWorkAtGCC"** (the page's own `h1`)
and **"direct GCC jobs"** (the end-of-list card). Each reads well alone. W7's
line about the nav label is moot — the nav item is gone.

### Stage 10 round two (placement) — SIGNED OFF 24 Nov 2026

Rishi's result, verbatim: *"Stage 10 round two (placement) passes."*

| What he confirmed | Result |
|---|---|
| Migration 021 | 5 checks, all PASS |
| Migration 022 | 4 checks, all PASS — **c4 showed the point: 23 as a visitor against 25 as the recruiter** |
| Fail-closed before 022 ran | no card on `/jobs` |
| The card | renders, links to `/gcc-jobs`, and `live_job_count()` matches the 23 the page prints |
| Removals | no "Apply Directly" anywhere; homepage back to three cards; recruiters still see the promo card |
| `/gcc-jobs` | end-of-list card on the last page only; `zzzz` gives "Nothing matches that", not the new-feature copy |
| `/post-a-job` | no notice signed out; amber notice for a signed-in community member; "Your recruiter account is ready" for a recruiter |
| Delete flow | resume gone, **6 applications anonymised, 5 saved roles removed**, community account and saved questions untouched, Roles Saved 0, Questions Saved unchanged, lower-case confirmation refused |
| 375px | no overflow; illustration dropped on phones as intended |

**c4 is the check worth remembering.** It was written to fail if the bug it
describes were absent, and it reported 23 against 25 — a plain count really
would have shown the admin two roles that no visitor can see. The card would
have appeared over an empty board for exactly one person: its author.

On decision 29's notice, Rishi: *"The notice also warns that posting signs
them out of their community account on that device — good catch, that's the
part someone would otherwise find out the hard way."*

**Two items deferred to the design pass, not fixed now, on his instruction:**

- The `/post-a-job` recruiter panel has a lot of empty white space under the
  button.
- **The illustration's yellow sparks stay.** His words: *"three accent marks
  in a corner aren't the warning-coloured panel I objected to."* That closes
  the colour note raised when the illustration was wired in.

### Stage 10 round two — the SEO half (BUILT 24 Nov 2026)

| Piece | Where |
|---|---|
| Per-request job page with `JobPosting` markup | `api/job-page.js` |
| The head block, pure and tested | `src/lib/jobPageHead.js` |
| Jobs sitemap | `api/sitemap-jobs.js` → `/sitemap-jobs.xml` |
| Ordered rewrites | `vercel.json` |
| `noindex` removed | `src/Pages/GccJobDetail.jsx` |
| Description minimum 50 → 400 | `src/lib/jobFormModel.js`, `src/components/JobForm.jsx`, migration 023 |

#### THE SHELL WAS FETCHED OVER HTTP, AND THAT WAS WRONG — FOUND 24 Nov 2026

The first version of `api/job-page.js` fetched `/app.html` over HTTP from the
deployment's own host and trusted it when `response.ok` was true. Rishi tested
step 1 and got **a blank page with 70 MIME-type errors**, not the 503 I had
predicted. His diagnosis, from View Source, was exact:

```
data-dpl-id="dpl_2pfh63eC3yPnKdmeRGgHS3stomBy"
src="/_next/static/immutable/chunks/0c0hxoamwjsbw.js"
data-testid="geistcn/skip-nav-link"
```

**Vercel's deployment-protection page is a Next.js app.** Protection
intercepted the internal fetch and answered with its own login page — valid
HTML, status 200 — so the guard passed, the markup was injected into a
stranger's document, and that is what the browser got. The markup itself was
correct; only the shell was someone else's.

**TWO SEPARATE FAULTS, AND HE SEPARATED THEM CORRECTLY.**

*1. The guard was too weak for production, not just preview.* His words:
*"'Did I get HTML back' isn't enough — it got HTML. It needs to verify the
shell is actually ours before injecting. If that internal fetch ever returns
anything unexpected in production, this function will inject into it and serve
it to candidates."*

`isAppShell()` in `src/lib/jobPageHead.js` now identifies the shell
**positively**: `<div id="root">`, a `/assets/index-*.js` bundle with this
deployment's hash, and a `</head>` to inject before. Vercel's page has none of
the three, so the positive checks alone refuse it. A list of markers from the
real incident is kept as a second layer, and the test **strips every one of
them and asserts the page is still refused** — because a guard that works only
by recognising one known document would not survive the next unexpected one.

*2. The approach changed rather than being patched.* His instruction: *"If the
approach has to change, say so plainly rather than working around protection —
I'd rather rebuild this than ship something that only works because production
happens not to have protection on."*

**There is no request-time network call for the shell any more.** It is read
off the deployment's own filesystem, declared in `vercel.json`:

```json
"functions": { "api/job-page.js": { "includeFiles": "dist/app.html" } }
```

Nothing can intercept a file read, so the fault is not merely detected — it is
out of reach. **And there is no fetch fallback, deliberately.** One would be
safe now that the shell is identified, but it would mean a protected preview
quietly behaving differently from production, which is the thing he asked not
to ship.

**Proved locally before pushing**, by invoking the handler with a mock
request/response against the real database and the real built shell:

| Request | Status | Markup | Notes |
|---|---|---|---|
| `program-manager-13` (live) | **200** | JobPosting, title intact | `index, follow` |
| `t5-platform-engineer-17` (closed) | **404** | none | `noindex, nofollow`, full shell in the body |
| `nonsense-99999` | **404** | none | |
| `wrong-slug-13` | **301** | — | → `/gcc-jobs/program-manager-13` |
| `` (empty) | **404** | none | |
| `../../etc/passwd` | **404** | none | `parseJobParam` requires a trailing `-<digits>` |

And on the served document: our mount point present, our hashed bundle
present, **no `_next` reference**, exactly one `</head>`, markup inside it.

**The one thing that cannot be verified without deploying** is whether
`includeFiles` puts `dist/app.html` where the function can read it. If it does
not, every job page answers **503** and nothing else on the site is affected —
loud, bounded, and caught by step 1. The fallback would then be to have
`scripts/prerender.mjs` write the shell into a module the function imports
statically.

#### A 404 that still serves a working page

A role that is not public answers **404**, which is how Google drops a closed
listing — **but the 404 is served with the app shell as its body.** A browser
renders it normally: React boots, fetches the role with whatever session is in
the browser, and a recruiter still sees their own closed or pending posting
exactly as before. **The status code is for crawlers; the body is for people.**

That matters because the recruiter preview is signed-off stage 4 behaviour —
`src/lib/publicJobs.js` calls it *"a preview, not a leak"*. A 404 that served
Vercel's own error page would have broken it. This way nothing a human does
changes, and Rishi's instruction ("404 for a role that isn't public") is met
exactly.

#### A database error must NOT 404 a live role

Google treats 404 as *gone*, and getting a listing back afterwards is slow and
not in our hands. So on a Supabase error the function serves the shell
untouched, `no-store`, with **no robots meta of its own** — the page still
works, React fetches the role itself, and nothing has told Google anything.
Fail-closed is right for the promo card and wrong here; the directions are
opposite because the costs are.

#### The markup is injected server-side and NOT rendered by React

`src/components/Seo.jsx` already takes a `jsonLd` prop. It is deliberately not
used on this page: two `JobPosting` objects on one page is worse than none,
because Google's rule is one job per page. The title and description come from
the **same helpers** the function uses, so the tags React hoists on hydration
say exactly what the served HTML already said.

#### The publishable key, not the service key

The function must see exactly what a stranger sees, and the "anyone reads
public jobs" policy already applies `private.job_is_public()` — status, expiry
and recruiter suspension. The service key would mean re-deciding in JavaScript
what the database already decides.

#### TWO EXTENSIONLESS IMPORTS WOULD HAVE BROKEN THE FUNCTION

`src/lib/jobDisplay.js` and `src/lib/jobPosting.js` both did
`import { ... } from "./jobOptions"`. Vite resolves that; **plain Node ESM does
not.** Both now carry the `.js`, and the whole chain was imported from plain
Node to prove it rather than assume the bundler would cover it.

#### Migration 023 had to be `NOT VALID`, and the measurement is why

Measured before writing it: **24 of the 25 rows in `public.jobs` are under 400
characters**, the shortest 197 — and all 24 are the `[T5]` test jobs queued for
deletion. The one genuine posting is 7,085. `alter table ... add constraint`
validates existing rows, so the plain version **fails on the first of those 24
and changes nothing.**

Two intended consequences: editing one of the 24 short test jobs is now
refused until its description reaches 400 (which is what carried item 18's
posting-form retest exercises), and the constraint stays marked NOT VALID
until the pre-merge clearout, after which it is validated — **carried item 26**.

`c2` inserts a 399-character row and a 400-character row and removes both.
The columns were read off the table first rather than guessed: **`apply_mode`
is NOT NULL with no default**, and omitting it would have raised
`not_null_violation`, which the 399 branch would not have recognised as a
`check_violation` — so the check would have failed for a reason unrelated to
400 characters. The fixture recruiter also excludes suspended accounts, so
`private.jobs_cap_guard()` cannot refuse the row for its own reasons.

#### MIGRATION 023 FAILED ON ITS FIRST RUN — 24 Nov 2026

```
ERROR: 22P02: invalid input syntax for type bigint:
       "4b7a0c43-eac2-4e52-9e9c-ea3226bf03e9"
CONTEXT: PL/pgSQL function inline_code_block line 12 at SQL statement
```

**The database was unchanged.** A multi-statement script in the Supabase SQL
editor runs as one implicit transaction, so the `ALTER TABLE` above the
failing block rolled back with it. Verified rather than assumed: the
constraint still read `>= 50` with `convalidated: true`, and there were zero
`check023-boundary` rows and zero `[CHECK023]` titles left behind.

**The fault:** `v_company` was declared `bigint`. **`jobs.id` is a bigint, and
I generalised from it** — but `companies.id` is a **uuid**, so
`jobs.company_id` is one too. The `select ... into` tried to put a uuid in a
bigint. Rishi's own guess from the error text ("jobs.id is a bigint and
posted_by is a uuid, so I'd look there first") was one column away.

Fixed by declaring `v_company uuid`.

**RISHI'S STANDING INSTRUCTION, and he is right to insist:** *"This is the
second migration in two days that failed on its first real run — 017 had the
round(double precision) error you caught by dry-running it. You caught that
one before handing it to me; this one you didn't. Whatever you did for 017
that you skipped here, do it every time: execute the checks against the live
database before giving me the file."*

Recorded in the project memory as a standing rule. What the read-only MCP
connection can and cannot do, since that is what made it tempting to skip:

| | |
|---|---|
| **can** | run every pure-`SELECT` check and read the figures |
| **can** | execute a `DO` block's `select ... into` read-only, to prove the assignments bind |
| **can** | **type-check every column of an `INSERT`** against the live table with `pg_typeof` + `information_schema.columns` — no write permission needed |
| **can** | read actual constraints, defaults and nullability |
| **cannot** | `CREATE TABLE`, even temporary — "cannot execute CREATE TABLE in a read-only transaction", so the temp-table harness itself cannot be rehearsed |
| **cannot** | `EXPLAIN` an `INSERT` — that needs insert permission, "permission denied for table jobs" |

**What was done before handing 023 over the second time:** the failing
`select ... into` executed read-only with the corrected declarations; **all
14 columns of both inserts type-checked against the live table** (all ok);
and c1 and c3 run as bare queries. The worked type-check query is in the
migration's own header, so the next person writing a `DO` block has it to
hand.

#### A FINDING FROM TESTING AGAINST A REAL ROW, NOT A FIXTURE

Job 13's description is **pasted Markdown** — `# Job Description`,
`**Job Title:**`. The detail page renders it with `whitespace-pre-wrap` and
deliberately never parses HTML, so a candidate sees those asterisks and
hashes literally. The markup therefore matches the page, which is the
visibility rule satisfied — but it means **Google's snippet will begin
"# Job Description – Finance | Record to Report"**, and the meta description
carries the same.

**Rishi corrected the severity, and he was right.** I logged this as an SEO
snippet problem. It is not: *"a candidate reading job 13 right now sees
`# Job Description` and `**bold**` on screen, so item 27 is a live defect on a
signed-off page, not just a snippet problem."* The thing a candidate reads is
the defect; the snippet is the same cause showing up somewhere else.

Still not fixed **in this stage**, because rendering Markdown changes a
signed-off page and reintroduces the HTML parsing that page was explicitly
built to avoid — but it is now **carried item 27, due before merge**, not a
wording-review item. Recruiters pasting from JD tools will keep doing this.

#### How it was proved before handover

| | |
|---|---|
| `scripts/stage10-head-test.mjs` | **103 assertions.** Seven attack titles — attribute breakout, element breakout, `</title>`, `</script>`, single-quote breakout, comment escape, a pre-escaped entity — each asserted to leave **no stray `<` or `>`** anywhere in the head, with the JSON-LD then **re-parsed** to prove it is still JSON and still carries the title intact |
| The other three suites | 116 SEO + 111 saved roles + 62 promo, all still passing — **392 assertions in total** |
| A real production row | job 13 run through the builders: all required properties present, `jobLocation` with `addressCountry: IN`, `FULL_TIME`, `monthsOfExperience: 24` from `experience_min: 2`, **no `baseSalary` because none is disclosed**, no `totalJobOpenings` because `openings` is null |
| Node ESM | the function's whole import chain loaded by plain `node`, which is what the `.js` extensions were for |
| The build | 87 pages, `dist/gcc-jobs` absent so the rewrite fires, `sitemap.xml` still a real file so it is served ahead of any rewrite |

**Two assertions in the head test were wrong on the first run and were
corrected rather than the code.** The `>` inside the JSON body is legitimate —
`descriptionToHtml`'s `<p>` and `<br>` come through as `\u003cp>`, because only
`<` needs escaping to stop an element closing early — and a description cut at
a word boundary does legitimately end with a letter before the ellipsis. Both
assertions now test the real property instead.

### Stage 10 cleanup — created while testing in production

| What | Where | Removed? |
|---|---|---|
| `job_saves` rows made while testing the Save button | `public.job_saves` | Add to the pre-merge clearout. Harmless if missed — they are bookmarks on test jobs that are themselves being deleted, and the FK cascades. |

Migration 020's own check `c7` inserts three saves, reads them back and deletes
them **before** judging the result, so a failed check cleans up after itself as
well as a passing one does. `c8` then asserts the table is empty.

## Stage 12 — recruiter password reset (SCOPED 24 Nov 2026, NOT BUILT)

Found by Rishi while testing stage 10: **there is no "forgot password" on
recruiter sign-in.** A recruiter who forgets their password has no way back
into their account. Today that means emailing `jobs@iworkatgcc.com` and Rishi
fixing it by hand — *"which works at two recruiters and doesn't at twenty."*

### THE ONE-EMAIL RULE IS RESTATED, NOT BROKEN

The old rule: *"Brevo sends exactly ONE email in this entire project: the
recruiter signup email. Nothing else."*

The new rule, Rishi's decision 24 Nov 2026: **"transactional account-access
emails only, both user-initiated."**

**ANYONE READING THE OLD WORDING LATER SHOULD NOT CONCLUDE THE RESET BROKE
IT.** The rule was never about a count. Its purpose is to stop this project
growing an email notification system — digests, application alerts,
saved-search pings. A password reset is not that: it is user-initiated, one
per request, carries no content but a link, and goes to an address that
already received the signup email. It creates no channel; it answers a
request.

The sharper form of the argument, and the one Rishi accepted: **the signup
email and the reset email are the same mechanism doing the same job** —
proving control of an email address. One proves it at the start, the other
proves it again later. And `/post-a-job` already re-sends the signup email
through `supabase.auth.resend`, so the project has always sent that one email
more than once. The rule is about **kinds** of email, not sends.

Permitted, exhaustively: the recruiter signup confirmation, and the recruiter
password reset. Nothing else, ever, without a new decision.

### WHY IT IS A LAUNCH BLOCKER

Rishi's instinct, and I agreed. But the reason is stronger than "an account
people can be locked out of":

**A locked-out recruiter still has live roles, and candidates keep applying to
them.** Those applications pile up unread, for the role's full 30 days, and
the candidates have no way of knowing. So the cost of this gap does not land
on the recruiter who forgot their password — **it lands on candidates who
applied in good faith and are waiting on someone who cannot get in.** That
argument survives "we only have two recruiters, I'll handle it by hand."

It is not a stage 10 item, and it does not belong on the launch checklist
below either: those are things that can only be *verified* in production, and
this is code to write. So: **its own stage, after stage 11, before the
merge.**

### SCOPE

- The reset request page and the reset landing page.
- **The change-password box** for a signed-in recruiter — Rishi's decision,
  *"since it's the same code"*. The last step of a reset is
  `updateUser({ password })`, so the dashboard box reuses it.
  `@supabase/supabase-js` is **2.112.3**, past the 2.102.0 that added
  `current_password` verification, so the box can require the old password.
- **The admin-set-password tool is LOGGED, NOT BUILT** — carried item 22.
  Rishi: *"Revisit when a recruiter actually loses their mailbox."*

### THE CONSTRAINTS, AND HOW THEY WILL BE ENFORCED

Rishi's conditions, 24 Nov 2026:

1. Send a reset **only if the email belongs to an account with the recruiter
   role**. Explicitly NOT "only if the account has a password" — he plans to
   let community members join by email later, at which point the password test
   stops distinguishing anything. **Role is the condition that stays true.**
2. Everything else — a community member's email, an unknown address, no
   account at all — gets **no email and the same reply**. No "email not
   found". *"I don't want this page to become a way of discovering which
   emails are registered here."*
3. The deeper reason: a community member who received a reset link could **set
   a password on a Google account**, giving it a second sign-in method nobody
   asked for — the identity-linking risk investigated in stage 3.
4. **Role-aware, not hardcoded to recruiters**, so community email sign-up is
   a case to add rather than a flow to rewrite.

#### Supabase's own client call cannot be used

`supabase.auth.resetPasswordForEmail()` runs in the browser with the
publishable key and sends to **any** existing account. It has no notion of a
role. So the gate has to sit in front of it, server-side.

#### public.user_roles is the right gate, and it fails closed

Checked against the live database, 24 Nov 2026:

| role | rows | with a password | Google |
|---|---|---|---|
| recruiter | 2 | 2 | 0 |
| admin | 1 | 0 | 1 |
| candidate | 1 | 0 | 1 |
| *(no user_roles row)* | **2,622** | 0 | 0 |

`user_roles` is `PRIMARY KEY (user_id)` with `role in ('candidate',
'recruiter', 'admin')`, and it is **sparse** — 2,622 of 2,626 accounts have no
row at all. That sparseness is the feature: **absence means ineligible**, so
every community member is refused by default rather than by a rule someone
has to remember to write.

Recruiters reliably have a row: `private.handle_new_recruiter()` fires on
`recruiter_profiles` insert and writes it, and `recruiter_profiles` is created
by `RecruiterRoute` on the recruiter's first signed-in visit — which is where
the confirmation email lands (`emailRedirectTo` is `/recruiter`).

#### TWO gates, not one — and this is where Rishi's framing needs a correction

He is right that role is the policy test. But role alone does not prevent the
outcome he named in point 3. Once community email sign-up exists and
`candidate` joins the eligible list, **the one existing Google-only account
that already has a `candidate` row would become eligible** — and handing it a
reset link is exactly the identity-linking risk.

So the predicate is two conditions from the start, with two different jobs:

| Gate | Question | Why |
|---|---|---|
| **role** | is this role allowed to reset? | the policy, extended by adding a case |
| **identity** | does this account have an email/password identity at all? | stops a password being created on an OAuth-only account |

Today both gates agree for all 2,626 accounts, so the second costs nothing
now and is the one that still holds when the first is widened.

#### A USABILITY TRAP THE ENUMERATION-SAFE DESIGN CREATES

A recruiter who signed up but **never confirmed** has no `recruiter_profiles`
row, so no `user_roles` row, so no reset email — correct, because their real
problem is confirmation, not the password. But the identical-reply rule means
they are told "if that email has a recruiter account, we've sent a reset
link", and then nothing arrives, with no hint of why.

Fix, which gives nothing away: the success message also names the other path
— *"If you signed up but never confirmed your email, use Resend confirmation
instead."* One sentence, no information disclosure.

#### THE GATE IS NOT AIRTIGHT, AND THAT IS A DELIBERATE CHOICE

Supabase's `/auth/v1/recover` endpoint is open to anyone holding the
publishable key, which is in our JavaScript bundle. **So a direct call to
Supabase bypasses our endpoint entirely.** The honest accounting:

- **No enumeration is gained.** Supabase's own endpoint already returns the
  same response whether or not the account exists.
- **No privilege is gained.** To use a reset link sent to a community member,
  an attacker needs that person's mailbox — and with their mailbox they could
  already take the Google account directly.
- **What is actually risked is confusion**, not compromise: a community member
  receiving an unexpected password email from our domain.

The only true closure is a **Send Email Hook**, which the docs confirm is
available on the **Free** plan, can see `email_action_type` (`recovery` is one
of its values), and sits in the Auth server's own send path. **Rejected, and
the reason matters:** the docs also say *"The Send Email Hook replaces
Supabase's built-in email sending"* — with it enabled, *"SMTP not used"*. So
turning it on makes us responsible for delivering **every** auth email,
including the signup confirmation that already works and is signed off. That
trades a confusion risk for rewriting the one email path in the project that
is finished. Not worth it.

Mitigation instead, on our side of the line: **the landing page is ours**, and
it refuses to set a password for an ineligible account — telling a confused
community member "this account signs in with Google, no password is needed"
rather than silently giving them one. That protects the realistic case; the
adversarial case stays Supabase's surface, documented here rather than
pretended away.

#### A timing side channel, and the floor that mitigates it

The eligible path does a lookup and sends an email (hundreds of milliseconds);
the ineligible path can return at once. **That difference is itself an
enumeration oracle**, regardless of the identical response body. The endpoint
will do the same lookup on every path and pad every response to a fixed floor.
Mitigation, not elimination — stated as such.

### HOW IT WILL BE PROVED

**Migration checks** (result-table form, per the standing rule):

| | Check |
|---|---|
| c1 | the eligibility function is `security definer`, `search_path` pinned, and granted to **service_role only** — not anon, not authenticated. *If anon can call it, the function IS the enumeration oracle the design exists to prevent.* |
| c2 | a recruiter's address returns eligible |
| c3 | a community member's address returns ineligible — a real Google account, read-only |
| c4 | an address with no account returns "none", distinctly from "ineligible" |
| c5 | `  Recruiter@Example.COM  ` behaves identically to the stored address (case and whitespace normalised) |
| c6 | the **admin's** address returns ineligible, proving the eligible set is a list rather than "any account that exists" |
| c7 | exactly one role is eligible today, read from the single list, so widening it later is one line in one place |

**Node test** (pure, enumerated): the response is byte-identical across
eligible / ineligible / unknown / malformed / empty input, and the eligibility
decision enumerated over every role × identity combination.

**On the preview**: a real end-to-end reset for a test recruiter; a community
address returning the same message with **nothing arriving**; an unknown
address the same; the landing page refusing an ineligible account; mixed-case
addresses; and the change-password box refusing a wrong current password.

**The one proof no code can give him: Brevo's transactional log.** The claim
under test is an absence — that nothing was sent — and absence is proved at
the sender, not at an inbox that may simply be slow.

## Stage 11 (analytics) — DEFERRED TO v2, 24 Nov 2026

Recorded 24 Nov 2026, because Rishi is weighing deferring it to v2 and asked
to be told exactly what is in it and what would be left.

**RISHI'S DECISION, 24 Nov 2026, verbatim:** *"Stage 11 is deferred to v2.
GA4 already records per-role page views, so what I'd be deferring is a number
shown inside the product, not the ability to measure."*

### WHAT IS BEING GIVEN UP: THE DATA IS NOT RETROACTIVE

Views not collected in v1 **cannot be recovered in v2**. If the board runs for
six months without stage 11, there is no view history for those six months —
not in the product, and not reconstructible from anything else, because no
table is recording it. GA4 will hold its own page-view history for the
retention period configured on that property, which is a different thing from
per-role counts the product can read and show a recruiter.

Everything else about the work gets *easier* by waiting, not harder: there will
be real roles and real traffic to measure instead of a board with none. The
non-retroactivity is the whole of the cost, and it is recorded here so it is a
known trade rather than a surprise.

### WHAT IT CONTAINED

**Analytics and nothing else.** Four events through a serverless
function, so the visitor hash can use the real IP while the salt stays
server-side, and no raw IP is stored. There is no migration, no policy, no
page and no cleanup bundled into it.

**Nothing launch-critical is inside it.** The merge, the test-data clearout,
the policy date, the second admin and the constraint validation are all
carried items with their own due points, none of which is "stage 11". Stage 12
(recruiter password reset) is now the last stage before the merge, so dropping
11 does not move the merge at all.

**NOTHING IN STAGES 1–10 DEPENDS ON IT.** Checked rather than recalled:

| Checked | Result |
|---|---|
| A views table, or any table named for analytics or events | **none exists** |
| A `view_count` column, or any UI reading one | **none anywhere** in `src/`, `api/` or the migrations |
| Job-board analytics already shipped | exactly one call — `exclusive_jobs_promo_clicked` in `BoardPromoCard.jsx` |
| What `trackEvent` is | GA4 only (`window.gtag`), no server and no database, and guarded to `www.iworkatgcc.com` so previews never pollute it |

**And the funnel already excludes views on purpose.** Stage 9b recorded it:
*"all of these come from existing tables plus the audit log. Nothing needs new
collection except 'did anyone look at the role', which needs stage 11. So the
honest funnel in 9b is applications → shortlisted → not selected."* The admin
reports were built around its absence, so deferring changes nothing there.

**The one thing GA4 already gives him for free.** `src/main.jsx` fires a
global `page_view` with `page_path` on every route change, so once the board is
live, GA4 records views of `/gcc-jobs/<slug>-<id>` with no stage 11 at all.
What stage 11 would add is a **de-duplicated per-role count inside the product**
— the number a recruiter could be shown on their own dashboard — not the
existence of view data.

**The only real cost of deferring: the data is not retroactive.** Views not
collected in v1 cannot be recovered in v2. Everything else about the work gets
*easier* later, because by then there are real roles and real traffic to
measure instead of a board with no roles.

## The company seed — GENERATED 24 Nov 2026, NOT YET RUN

Rishi, 24 Nov 2026: *"The company seed was never run. Typing 'walmart' offers
to create it as a new company — the 1,814-name list is still just a file on
disk. You said generating companies.sql was a one-command step independent of
stage 9, and then it never happened."*

He is right, and it was mine to do. `scripts/build-company-seed.mjs` has
existed since stage 4; it had simply never been run against
`supabase/seed/gcc-companies.txt`.

```
read       1815 lines
kept       1814 companies
collisions 0
rejected   0
wrote      supabase/seed/companies.sql
```

**Zero collisions and zero rejections**, which is the result worth noting: no
two names in that list slugify the same way, so nothing had to be chosen by
hand and no name was silently dropped.

**Dry-run before handing it over** (the rule from migration 023, applied):

| Checked | Result |
|---|---|
| `on conflict (slug)` has something to conflict on | `companies_slug_key :: UNIQUE (slug)` exists |
| Columns the insert must satisfy | only `name` and `slug` — `id` defaults to `gen_random_uuid()`, `created_at` to `now()`, `logo_url` is nullable |
| Apostrophe escaping | `Hudson''s Bay`, `L''Oréal`, `Lowe''s`, `Moody''s Analytics`, `Sonny''s Enterprises` all doubled correctly |
| Existing rows that could be overwritten | 2 — `Test Co A` and `Test Co B`. Neither slug appears in the list, and `do nothing` would protect them anyway |
| Size | 61 KB, 1,839 lines — one statement, well inside what the SQL editor takes |
| `walmart` | present at line 1,764 as `('Walmart', 'walmart')`, which is the case he reported |

**What it does to the picker.** `CompanyPicker` searches on two characters,
debounced 250ms, `ilike` on both name and slug, capped at 8 results. Today
every search returns nothing and the only option offered is "Add … as a new
company". After the seed, a recruiter typing `walm` gets `Walmart` to click,
and the create-new option appears **only when the search comes back empty** —
which is the behaviour it was built for and has never been able to show.

**Note, not a blocker:** `public.companies` is readable by anon, so all 1,814
names are on the public API the moment this runs. They are company names, not
anyone's data, but it is not a private staging area.

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
| 27 | **LIVE DEFECT ON A SIGNED-OFF PAGE: pasted Markdown is rendered literally to candidates.** Rishi's correction, 24 Nov 2026: *"a candidate reading job 13 right now sees `# Job Description` and `**bold**` on screen, so item 27 is a live defect on a signed-off page, not just a snippet problem."* He is right, and I had filed it a category too low. **The defect is what a candidate reads**; the Google snippet beginning `# Job Description` is a symptom of the same cause, not the problem. Job 13's description opens `# Job Description – Finance | Record to Report (R2R)` with `**bold**` markers throughout, and `/gcc-jobs/:slugId` renders it with `whitespace-pre-wrap`, which deliberately never parses HTML. Options: render a safe Markdown subset; strip the markers for display and for the meta description; or change the field hint and let recruiters paste plain text. Whichever is chosen, note that the markup must keep matching the page — Google requires everything in the markup to be visible on it — so display and markup have to change together. | Found 24 Nov 2026 testing against a real row; severity corrected by Rishi the same day | **Before merge** |
| 26 | **`alter table public.jobs validate constraint jobs_description_check;` after the pre-merge clearout.** Migration 023 added it `NOT VALID` because 24 of 25 existing rows are under 400 characters — all of them `[T5]` test jobs deleted by carried item 13. Once those are gone, validate it, and confirm `convalidated` is true. The statement is at the bottom of the migration file. It fails loudly if anything short remains, which is the point. | Migration 023 | **After carried item 13, before merge** |
| 25 | **DESIGN PASS: two items from stage 10's sign-off.** (a) The `/post-a-job` recruiter panel has a lot of empty white space under the sign-up button. (b) The promo card's illustration keeps its yellow sparks — decided, not outstanding; recorded so the design pass does not reopen it. | Rishi, 24 Nov 2026 | Design pass |
| 24 | **The "Password changed" security notification must be confirmed OFF before stage 12 ships.** Supabase can send a `Password changed` notification, which would be a THIRD email the day the reset flow goes live. The docs name no dashboard control for it — the only on/off mechanism they show is the Management API flag `mailer_notifications_password_changed_enabled`. Recommended setting: **off**, with the compensating control being `current_password` on the change-password box (a session hijacker cannot rotate the password without knowing the old one). Revisit as an explicit decision at stage 12. | Rishi, 24 Nov 2026 | **Before stage 12** |
| 23 | **Add a second admin account that Rishi alone controls.** `public.user_roles` has exactly one `admin` row, on a Google-only account. Losing that Google account loses the admin role, with no second admin to grant it back. A data change, not a migration. **The real break-glass is the Supabase dashboard**, from which an admin row can always be inserted — so the higher-value action is hardening his Supabase account (2FA, recovery), and the second admin covers the narrower case of losing the Google account. Note both admins would share one failure mode (Google suspending him) but not the common ones. The second account sees all applications, so it must be an account only he controls, never a shared mailbox. | Rishi, 24 Nov 2026 | **Now** |
| 22 | **An admin-set-password tool, LOGGED NOT BUILT.** `auth.admin.updateUserById(uid, { password })` sets a password with no email — the docs say *"Changes are applied directly without confirmation flows"* — service-role and server-side only. Paired with the phone number already collected and validated at recruiter signup, it is a reset with zero emails. Rishi's decision, 24 Nov 2026: *"log it, don't build it. Revisit when a recruiter actually loses their mailbox."* It is the only thing that helps a recruiter whose **mailbox** is gone, which a reset email by definition cannot fix. | Rishi, 24 Nov 2026 | Deferred |
| 21 | **`/post-a-job` NEEDS RETESTING — decision 29 touches a signed-off page.** `src/Pages/PostAJob.jsx` now shows a signed-in community member a notice that recruiter accounts are separate. The page is stage 3/4 work and signed off. Retest: the recruiter sign-up still works signed out, an already-signed-in recruiter still sees "Your recruiter account is ready", and the new notice appears only for a signed-in non-recruiter. | Rishi, 24 Nov 2026 | **Stage 10 round two** |
| 20 | **Set `NEW_FEATURE_UNTIL` in `src/lib/boardPromo.js` to eight weeks after the real launch date.** Shipped as a placeholder (`2027-01-19`, eight weeks from the day it was written) so the badge is visible on the preview. Eight weeks can only honestly be measured from launch, so this is set at merge **alongside `LAST_UPDATED`** in carried item 1 — same edit, same moment. No code change is needed to remove the badge: it compares the date at render. | Rishi, 24 Nov 2026 | Before merge |
| 19 | **STAGE 4 CHANGE, TO BE DECIDED SEPARATELY: tell recruiters that a 100% remote role must say so in the description.** Google requires `jobLocationType: TELECOMMUTE` *and* that the description clearly states the role is remote. v1 does not ask recruiters for that, so a "remote" role whose description never says the word gets markup Google may disregard. Logged rather than built, because it changes a signed-off form. | Rishi, 23 Nov 2026 | **Stage 4 change** |
| 18 | **THE POSTING FORM NEEDS RETESTING AS PART OF STAGE 10.** Raising the description minimum from 50 to 400 characters touches signed-off stage 4: `src/lib/jobFormModel.js`, the field hint, and the CHECK constraint on `jobs.description`. Rishi, 23 Nov 2026: "Raising it touches signed-off stage 4, so record that the posting form needs retesting as part of stage 10." | Rishi, 23 Nov 2026 | **Stage 10 round two** |
| 17 | ~~**STAGE 9 SCOPE: `purge_expired_applications()` writes an audit row.**~~ **DONE in stage 9** — verified against the live database 24 Nov 2026: the function's body writes an audit row. Was still shown as open. Originally: A nightly retention purge is an administrative action, and on Hobby a log line is unreadable an hour later. An audit row turns "did the sweep run" into a SQL query that is answerable forever rather than within the hour after 02:00 UTC. | Rishi, 23 Nov 2026 | **Stage 9** |
| 16 | ~~**STAGE 9 SCOPE: a global orphan sweep in the admin queue, reporting before it deletes.**~~ **DONE in stage 9** — verified 24 Nov 2026 while answering what remains before launch: `AdminReports.jsx` shows `orphaned_files` with a risk tone, and `api/admin-delete-orphan.js` does the deleting, so it reports first and deletes second as decided. Was still shown as open, which would have made the pre-launch list two items longer than it is. Originally: Stage 8's folder-clearing covers everyone who *asks* to be deleted. It does nothing about files belonging to people who never ask — which is what the three 19 Nov orphans were. The sweep compares `storage.objects` against `candidate_resumes` across every folder. Rishi's decision, 22 Nov 2026: **it reports first and deletes second**, reviewed by a human for the first few runs, rather than being trusted straight into the nightly cron. | Rishi, 22 Nov 2026 | **Stage 9** |
| 15 | **DONE, BUT NOT AS BUILT — see "the board's placement changed, 24 Nov 2026".** Shipped in round one as an "Apply Directly" nav item and a homepage card; **both removed 24 Nov 2026** and replaced by a single promo card at the top of `/jobs`. The item's requirement — the board must be findable in the same stage that makes it public — is met by that card. D1 (the label) is closed by removal. Originally recorded as: *STAGE 10 SCOPE, RECORDED SO IT IS NOT ASSUMED: link `/gcc-jobs` in the navigation.* The board going public and the board being findable must happen in the same stage. Today `/gcc-jobs` is linked from exactly one place in the whole app — the empty state of `/my-applications`. "Explore GCC Jobs" in the header goes to `/jobs`, the collated page of external listings, and always has. Stage 10 makes the board indexable; if it does not also link it, the board is public to Google and invisible to a visitor. The two nav labels need settling at the same time, because "Explore GCC Jobs" is taken. | Rishi, 22 Nov 2026 | **Stage 10** |
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
