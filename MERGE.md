# The merge

**Merging `job-board` into `main`, and everything that has to be true
afterwards.** Written 26 November 2026. Every fact in it was derived from the
repository and the live database on that date, not copied from notes.

Companion to `CLEAROUT.md`, which has already run.

---

## Before you start

**You need:** a terminal in `~/Desktop/gcc-job-board`, the Vercel dashboard,
the Supabase dashboard, and a browser. **About twenty minutes**, plus one
five-minute check the next morning.

**The state this assumes, all verified 26 Nov 2026:**

| | |
|---|---|
| Branch | `job-board` at `ef0f25e`, pushed, working tree clean |
| Commits to merge | **109** on the branch that `main` does not have |
| Commits on `main` the branch lacks | **12**, all "Weekly GCC jobs update", all touching **only** `public/data/jobs.json` |
| Conflicts | **None.** Checked with `git merge-tree`, which writes nothing |
| Serverless functions after the merge | **10** of Hobby's 12. `main` adds none — its `api/` is a strict subset of the branch's |
| Clearout | run, 14 of 15 checks PASS, the fifteenth a recorded decision |
| Database | 0 jobs, 0 applications, 0 resumes, 0 storage objects |

**The merge is not a fast-forward.** `main` has moved on twelve times while
this branch was being built, so the merge makes a merge commit. That is
normal and expected here.

---

## READ THIS FIRST: the one step that makes a rollback worse

**Everything in this procedure is reversible except step 11 (item 14).**

Rolling back is easy and fast — one click in Vercel restores the previous
production deployment in seconds. It works because the database changes are
all **additive**: `main`'s old code simply ignores the new tables, functions
and columns.

**Step 11 breaks that.** It drops `public.question_authors`, and **`main`'s
old code reads that view** — `src/lib/authors.js` on `main` does
`.from("question_authors")`. The branch's code does not; it uses a function
instead. So:

> **While the view exists, a rollback is clean. Once you drop it, rolling
> back breaks author names on every question page for all 2,643 members.**

That is why item 14 is the last step and not an early one, and why its own instruction
has always been *"after the merge is deployed and verified."* **Do not drop
the view on the same day unless everything else has passed and you are
confident you are not going back.** There is no cost to waiting a week.

---

## Step 1 — confirm the ground before you move it

```sh
cd ~/Desktop/gcc-job-board
git status
```

**Expect:** `On branch job-board`, `nothing to commit, working tree clean`.
If anything is listed, stop — something is uncommitted and the merge would
either miss it or carry it in unreviewed.

```sh
git fetch origin
git log --oneline -1 job-board
git rev-list --count origin/main..job-board
git rev-list --count job-board..origin/main
```

**Expect:** `ef0f25e`, then `109`, then `12`.

> **If the last number is higher than 12,** another "Weekly GCC jobs update"
> landed since this was written. That is harmless — it only touches
> `public/data/jobs.json`, which this branch never modifies — and step 2's
> merge will take both sides cleanly.

---

## Step 2 — the merge

```sh
git checkout main
git pull origin main
```

**Expect:** `Switched to branch 'main'`, then either `Already up to date.` or
a fast-forward pulling in any new weekly commits.

```sh
git merge job-board --no-ff -m "Merge the direct job board into production

Twelve stages built on job-board since 13 September 2026, signed off one at a
time, with the pre-merge clearout completed on 26 November. Recruiters post
roles at /gcc-jobs and candidates apply with a resume.

Stage 11 (in-product analytics) is deferred to v2, as is the design pass.
Nothing in the job board is outstanding."
```

**Expect:** a summary listing many changed files, and **no mention of
conflicts**. If you see `CONFLICT`, stop and do not push — run
`git merge --abort`, which returns you exactly to where you were, and come
back to me.

```sh
git log --oneline -3
git status
```

**Expect:** your merge commit on top, and `nothing to commit, working tree
clean`.

**Nothing has reached production yet.** The merge so far is local.

---

## Step 3 — push, which is the moment it goes live

```sh
git push origin main
```

**This is the irreversible-feeling step, and it is the reversible one.**
Pushing starts a production build. If anything is wrong, "If something is
wrong" at the end of this file puts the old site back in about a second.

---

## Step 4 — watch the production build

Vercel dashboard → the project → **Deployments**. A new deployment appears
within a few seconds, marked **Production**.

**What it does:** `npm run build` — Vite, then `scripts/prerender.mjs`, which
renders **89 pages** plus `sitemap.xml` using Playwright against the live
database. Then it packages the **10** serverless functions. It takes roughly
two to four minutes.

**Expect:** status **Ready**. In the build log, near the end:
`[prerender] wrote 89 pages + sitemap.xml`.

**Deploys are atomic.** The new version only receives traffic once it has
built successfully. Members browsing during the build see the old site, then
the new one. There is no window where the site is down.

> **If the build fails,** production is untouched — the previous deployment
> keeps serving. Read the log, and see "If something is wrong".

---

## Step 5 — what could fail now that never failed on a preview

Worth reading before you start checking, because it tells you what you are
looking for.

**The build itself is the least likely thing to fail.** It is the same
command, the same Node, the same environment variables — and P4 confirmed
every variable production needs is scoped to Production. A build that works
on preview works here.

**What is genuinely new is everything production-only:**

| Risk | Why it is production-only | How it shows | Checked in |
|---|---|---|---|
| **Analytics and Clarity** | Both guards key off the hostname and take the **deny** path on every preview. The allow path has **never executed anywhere.** | Silently nothing. Looks like a run of quiet days, not an error. | **Step 6** |
| **`X-Robots-Tag`** | Vercel puts its own `noindex` on every preview, which masks ours. Production is the first place the **absence** of a header on a public page is observable. | A wrong pattern would put `noindex` on your public pages and deindex the site. Highest consequence on this list. | **Step 8** |
| **The retention sweep** | Crons **only run on production.** `api/rebuild.js` gained the sweep on this branch, so that code has never been invoked by anything. | A failed sweep returns an error in the response body and logs it. | **Step 10** |
| **Job detail pages** | They are served by a function via a rewrite, using `includeFiles: "dist/app.html"` to put the app shell on the function's filesystem. | **503 on every job page while nothing else on the site looks wrong.** | **Step 7** |
| **The nightly digest** | Runs at 03:30 against production only, and reaches about 2,500 people. | A broken digest is 2,500 wrong emails. | **The morning after** |

**On the digest, the one that would be worst:** I checked the diff rather than
trusting the note. `api/send-digest.js` differs from `main` by **comments
only** — stripping comment and blank lines leaves an empty diff. Its
behaviour is byte-for-byte what has been sending correctly for months.

### THE ORDER OF THE CHECKS MATTERS, AND NOT FOR THE REASON YOU'D THINK

You asked for these in the order P2, P5, P6, P3. **I have put P5 last of the
four, and the reason is the rollback path rather than the checks themselves.**

**On the Hobby plan, Vercel's Instant Rollback can only reach the
immediately previous deployment.** Every new production deployment pushes the
pre-merge one further back and out of reach.

**P5 fires the deploy hook, and the deploy hook creates a production
deployment.** So running P5 early would spend your one rollback slot before
you had finished looking for reasons to use it.

So: **every read-only check first, then P5.** Steps 6 to 9 are pure
observation and change nothing. Step 10 is the first thing that creates a
deployment, by which point you already know whether you want to go back.

> This also means the instant-rollback route to the pre-merge site **expires
> on its own at 02:00 UTC**, when the nightly cron fires the same deploy hook
> and creates tonight's deployment. After that, rolling back is a `git revert`
> rather than a button. See "If something is wrong".

**Three things will look wrong and are not:**

1. **The board is live and empty.** The clearout removed every test role, so
   `/gcc-jobs` shows its empty state. Correct.
2. **The promo card on `/jobs` is hidden.** It only appears when
   `live_job_count()` is above zero, which is the stage 10 decision that
   stopped you being the one person seeing a card that promised roles and led
   nowhere. With no roles, no card.
3. **`/sitemap-jobs.xml` returns an empty `<urlset>`** with a 200. That is
   the honest answer — there are no roles — and not the 503 it returns when
   something is actually broken. Search Console may note the sitemap is
   empty; ignore it until a role exists.

---

## Step 6 — P2: analytics and Clarity, firing for the first time

**Do this one first**, because it is the only check whose subject is a code
path that has never run.

1. Open **`https://www.iworkatgcc.com`** in a normal browser window — not
   the preview URL, and not with an ad blocker on.
2. Open DevTools → **Network**, and filter on `collect`.
3. Click through two or three pages — the homepage, `/questions`, `/jobs`.

**Expect:** one or more requests to `google-analytics.com/g/collect` (or
`/collect`) returning **200** or **204**. Each page change should produce one.

4. Filter the Network tab on `clarity`.

**Expect:** a script from `clarity.ms` loading, status **200**.

5. Open **GA4 → Reports → Realtime**.

**Expect:** your own session, within about thirty seconds.

> **If no `collect` request fires,** the guard is rejecting the hostname.
> Check what the address bar actually says: the guard matches
> **`www.iworkatgcc.com`** exactly. The apex `iworkatgcc.com` was verified on
> 23 November to return **308** to the `www` host, so this should be
> impossible — but if you somehow land on a bare `iworkatgcc.com` that serves
> a 200, that is the cause, and it is a redirect problem rather than a code
> problem.

**Carried item 2 belongs here**, and this is the first moment it has ever
been possible: **Clarity dashboard → Settings → confirm form-input masking is
ON.** The privacy policy promises that text typed into forms is masked.
Clarity cannot load on a preview by construction, so this could not be
checked before today.

---

## Step 7 — the job-page chain, which is one request and decisive

Read-only. This is the check for the failure mode that takes out every job
page while leaving the rest of the site looking perfect.

```sh
curl -sS -o /dev/null -w "%{http_code}\n" https://www.iworkatgcc.com/gcc-jobs/anything-1
```

**Expect `200`.** The page itself will say *"This role is no longer open"*,
because there is no role with id 1 — that is correct and is not the point.
**The point is that a 200 proves the rewrite, the function and
`includeFiles: "dist/app.html"` all work together.**

**A `503` means `includeFiles` is wrong**, and that is a rollback decision —
see "If something is wrong". It is the failure the handover warns about:
*"re-key it wrong and every job page answers 503 while nothing else on the
site looks wrong."*

> Note what this does **not** prove: there is no role, so no `JobPosting`
> structured data is emitted and none can be validated. That genuinely waits
> for the first real posting — step 9 says so again.

---

## Step 8 — P6: `X-Robots-Tag`, where Vercel's preview header is gone

On production, Vercel's own blanket `noindex` is absent, so for the first time
you can see **both** that our header is present where it should be **and
absent where it must be.** This is the highest-consequence config check on the
list: a wrong pattern here would deindex the live site.

```sh
for p in /recruiter/sign-in /recruiter/forgot-password /recruiter/reset-password /recruiter/jobs /recruiter-terms /post-a-job /gcc-jobs /jobs /; do
  printf "%-34s %s\n" "$p" "$(curl -sSI "https://www.iworkatgcc.com$p" | grep -i 'x-robots-tag' || echo '(none)')"
done
```

**Expect:**

| Path | Expected |
|---|---|
| `/recruiter/sign-in` | `x-robots-tag: noindex, nofollow` |
| `/recruiter/forgot-password` | `x-robots-tag: noindex, nofollow` |
| `/recruiter/reset-password` | `x-robots-tag: noindex, nofollow` |
| `/recruiter/jobs` | `x-robots-tag: noindex, nofollow` |
| `/recruiter-terms` | **(none)** |
| `/post-a-job` | **(none)** |
| `/gcc-jobs` | **(none)** |
| `/jobs` | **(none)** |
| `/` | **(none)** |

**You have a recorded "before".** I ran the same loop against production on
26 November, while it was still serving `main`:

```
/recruiter/sign-in             (none)
/recruiter-terms               (none)
/post-a-job                    (none)
/gcc-jobs                      (none)
/jobs                          (none)
/                              (none)
```

**Every path, no header.** So this is a before-and-after rather than a
judgement call: the four `/recruiter/*` paths should **change** to
`noindex, nofollow`, and every other path must **stay** `(none)`. Any public
page that changes from `(none)` to anything is caused by this merge and
nothing else.

**The four `(none)` rows at the bottom are the important ones.**
`/recruiter-terms` especially: it is a public page that matches
`/recruiter(.*)` but **not** `/recruiter/(.*)`, which is why there are two
patterns rather than one. On every preview this was unobservable, because
Vercel's own header was on everything.

> **If a public page carries `noindex`,** that is the one finding on this list
> worth rolling back for — see "If something is wrong" — because it tells Google to remove
> pages that have been indexed for months.

---

## Step 9 — P3: crawlability, and the honest limit of what it can mean today

Crawlability could never be tested on a preview, because a preview is
`noindex` by construction. It can be *partly* tested now, and the rest
genuinely waits for the first real role.

**Checkable now:**

```sh
curl -sS https://www.iworkatgcc.com/robots.txt
curl -sS -o /dev/null -w "%{http_code}\n" https://www.iworkatgcc.com/sitemap.xml
curl -sS https://www.iworkatgcc.com/sitemap-jobs.xml | head -5
```

**Expect:** `robots.txt` with `Allow: /`, `Disallow: /app.html` and both
sitemap lines; `sitemap.xml` returning **200**; and `sitemap-jobs.xml`
returning a valid but **empty** `<urlset>`.

Then **Google Search Console → Sitemaps**, and submit
`https://www.iworkatgcc.com/sitemap-jobs.xml` if it is not already listed.
Use **URL Inspection** on `https://www.iworkatgcc.com/gcc-jobs` and press
**Test live URL**.

**Expect:** "URL is available to Google." It will likely also say the page is
not indexed yet, which is correct — it has only just become public.

**What genuinely cannot be answered yet, and why.** Two things, both because
the board is empty:

1. **No role page exists to crawl**, so `JobPosting` structured data cannot
   be validated. When your first recruiter posts, run that role's URL through
   Search Console's **Rich Results Test**. That is the real test of stage 10's
   SEO work, and it is the first thing to do after the first posting.
2. **`/gcc-jobs` is in neither sitemap.** `sitemap.xml` lists six static paths
   plus every question; `sitemap-jobs.xml` lists individual roles. The board's
   index page is reached by **link** — the promo card on `/jobs` — and that
   card is hidden while there are no live roles. So until the first role is
   posted, the board is public but genuinely unlinked.

**That is by design rather than an oversight**, and it follows from the stage
10 decision that the card appears only when there are roles to show. But it is
worth saying plainly: **merging does not make the board findable. The first
posting does.**

---

## Step 10 — P5: the deploy hook and the retention sweep

**This is the first step that changes anything, and the first that creates a
production deployment.** Do it only once steps 6 to 9 have passed — see "the
order of the checks matters" above.

One request exercises more than anything else on this list: the function, its
authentication, the deploy hook, the Supabase service-role connection, the RPC
grant and the sweep itself.

**You need `CRON_SECRET`** — Vercel → Settings → Environment Variables →
reveal it.

```sh
curl -sS -X POST https://www.iworkatgcc.com/api/rebuild \
  -H "Authorization: Bearer PASTE_CRON_SECRET_HERE"
```

**Expect exactly:**

```json
{"triggered":true,"purged":0}
```

**What each part proves:**

- `triggered: true` — the deploy hook fired and returned OK. **That is P5
  closed**: this branch's `api/rebuild.js` has now fired the hook for real,
  which it never had.
- `purged: 0` — the sweep ran, connected, called
  `purge_expired_applications()` and deleted nothing. **Zero is the correct
  answer**: there are no applications at all, and the sweep only removes those
  past twelve months.

**Other replies and what they mean:**

| Reply | Meaning |
|---|---|
| `401 {"error":"Unauthorized"}` | Wrong or mistyped secret. Harmless — nothing ran, no deployment created. |
| `500 {"error":"Server not configured"}` | `CRON_SECRET` or `DEPLOY_HOOK_URL` missing on Production. |
| `502 {"error":"Deploy hook failed"}` | The hook URL is wrong or revoked. The sweep did **not** run. |
| `{"triggered":true,"purgeSkipped":"not configured"}` | Supabase URL or service key missing on Production — contradicts P4, so re-check the variables. |
| `{"triggered":true,"purgeError":"..."}` | The sweep reached the database and the RPC failed. Send me the message. |

**Expected side effect: a second production deployment appears** in Vercel a
moment later. That is the hook doing its job, it is idempotent, and it is not
a sign of anything wrong. **It is also what consumes the Hobby instant-rollback
slot**, which is why this step is last.

---

## Step 11 — item 14, and only once you are sure

**Do not run this on merge day.** Re-read the warning at the top of this file:
dropping this view is the single action that makes a rollback destructive.

**Two preconditions, both of which must be true:**

1. Everything above has passed.
2. You are confident you are not rolling back. A few days of the site running
   normally is the evidence for that.

**First, confirm the thing the view exists for still works** — on production,
with the new code:

- Open any question page, e.g. from `/questions`.
- **Expect author names to show** on the question and its answers.

That is the check item 14 has always been gated on: *"after a live question
page is confirmed to show author names."* The new code gets names from a
function rather than the view, so this confirms the replacement works before
the original is removed.

**Then** run `supabase/post-merge/drop_question_authors.sql` in the Supabase
SQL editor, and afterwards re-open a question page and confirm names are
**still** there.

**What this closes:** the Security Advisor's "Security Definer View" finding,
which will keep reporting until the view is gone.

---

## P1 — the morning after, and why you do not need the logs

The retention sweep runs at **02:00 UTC** via cron. Hobby keeps function logs
for about an hour, so by morning the log line is gone. **You do not need it.**

**You have already proved the sweep works** in step 10, by calling it yourself
and reading `purged: 0` out of the response. That is a stronger result than a
log line, because it is the function's own return value.

**What the cron leaves behind permanently:**

| Trace | Where | Lasts |
|---|---|---|
| **A new production deployment** around 02:00 UTC | Vercel → Deployments | Forever |
| An audit row, **only if it purged something** | `public.admin_audit` | Forever |
| The log line | Vercel → Logs | About an hour |

**So the morning-after check is one look at the Vercel deployments list.**
A deployment created around 02:00 that you did not trigger **is** the cron
having fired — the sweep and the deploy hook are the same request, so a
deployment at 02:00 proves the function ran.

**And one thing you must not misread.** The sweep writes its audit row
**only when it actually deletes something** — the function's own code is
`if v_count > 0 then perform private.audit(...)`. With **zero applications in
the database**, it will delete nothing and write **no audit row at all**, every
night, for at least the next twelve months.

> **The absence of an audit row is therefore not evidence of anything.** It
> does not distinguish "ran and found nothing to do" from "never ran". This is
> worth writing down because it is exactly the kind of check that would be
> misread a year from now. Use the deployment list, not the audit log.

If you want the audit query anyway, for when there is real data:

```sql
select created_at, action, summary, after
from public.admin_audit
where action = 'retention_purge'
order by created_at desc
limit 5;
```

**Also that same night, at 03:30 UTC: the community digest.** It reaches about
2,500 people and its code is byte-identical to what has been sending for
months — comments only. **Confirm it went out** in the **Brevo** log the next
morning, as a send to the usual recipient count. The two test Google accounts
you kept will be among the recipients from now on.

---

## If something is wrong

### The fast answer: Instant Rollback — but it has a shelf life

**Vercel dashboard → the project. The Production Deployment tile has an
Instant Rollback button**; the same option is in the `⋮` menu on any
deployment row in the Deployments list.

It reroutes traffic to the earlier deployment in about a second, needs no git,
and puts the exact previous site back. **Do this first** if the live site is
broken for members, and diagnose afterwards.

**Three things about it that matter here, and that I got wrong at first:**

1. **On Hobby, it only reaches the immediately previous deployment.** Vercel's
   docs limit Hobby to one step back; Pro and Enterprise can pick any
   deployment that was ever live. So the merge deployment is the only thing
   standing between you and the pre-merge site — **and anything that creates
   another production deployment pushes the pre-merge one out of reach.**
2. **So the window closes by itself at 02:00 UTC**, when the nightly cron
   fires the deploy hook and creates tonight's deployment. Step 10 closes it
   sooner, deliberately and only after you have finished looking. **After the
   window closes, use `git revert` below — it does not depend on the plan.**
3. **A rollback switches off auto-assignment of the production domain.** Until
   you press **Undo Rollback**, pushes to `main` will build but will *not*
   take over production. If you roll back, then push a fix and nothing seems
   to happen — this is why.

**And it does not touch the repository.** `main` still contains the merge, so
the next push would rebuild and ship the same code. A rollback buys you time;
it is not the fix.

### The always-available answer: revert the merge in git

Independent of plan, and the right move once the instant-rollback window has
closed:

```sh
cd ~/Desktop/gcc-job-board
git checkout main
git pull origin main
git log --oneline -5          # find the merge commit
git revert -m 1 <merge-commit-sha>
git push origin main
```

`-m 1` is what makes this work on a merge commit — it means "keep the first
parent", which is `main` as it was before the merge. The push triggers a
normal production build of the reverted code, so it takes the usual two to
four minutes rather than a second, and it leaves honest history: a revert
commit you can later revert in turn to bring the board back.

### What is reversible, and what is not

| | Reversible? | How |
|---|---|---|
| The code on production | **Yes, in about a second** | Instant Rollback — **but only one deployment back on Hobby, and only until 02:00 UTC** |
| The code on production, after that window | **Yes, in a few minutes** | `git revert -m 1 <merge-commit>` then push. Plan-independent and permanent |
| The database schema | **Not needed.** Every migration was additive — new tables, functions and columns. `main`'s old code ignores all of it, so rolling back the code needs no database change at all |
| Test data | Already gone, and the clearout does not need undoing |
| The validated description constraint | Harmless either way. It only governs `public.jobs`, which old code never writes |
| **Dropping `question_authors` (step 11)** | **This is the one that bites.** Once dropped, rolling back to `main`'s old code breaks author names on every question page. Recreate it from `supabase/migrations/010_author_names.sql` before rolling back, or do not drop it until you are sure |
| Analytics data once it starts flowing | Not reversible, and not a problem — it is what you wanted |
| Emails | The merge sends none. The 03:30 digest is unchanged code |

### Deciding whether to roll back

**Roll back immediately for:** the site not loading, questions or answers not
rendering for members, sign-in broken, a public page carrying `noindex`
(step 8), or a `503` on job pages (step 7). The first four affect the 2,643
people already using the site; the fifth affects the feature you just shipped.

**Decide quickly rather than carefully, if it is one of those.** The
instant-rollback window is one deployment wide and closes at 02:00 UTC. Roll
back first, diagnose second — the rollback is itself reversible with **Undo
Rollback**, so an unnecessary one costs you nothing but a minute.

**Do not roll back for:** the board being empty, the promo card being hidden,
an empty jobs sitemap, or no structured data yet. All four are the expected
state of a board with no roles in it.

**Come back to me rather than guessing for:** a `purgeError` in step 10, a
`503` on a job page, or analytics not firing in step 6. None of those harms
members, so there is no clock on them, and each has a specific cause worth
identifying rather than papering over with a rollback.

---

## After it all passes

**The first recruiter posting is the next real milestone**, and two things
wait for it:

1. Run that role's URL through Search Console's **Rich Results Test** — the
   actual test of the `JobPosting` structured data.
2. The promo card on `/jobs` appears by itself, and the board becomes
   findable.

**Deferred to v2, deliberately, and not outstanding work:** the design pass,
in-product analytics (stage 11), the second admin account, the remote-role
description guidance, the admin set-password tool, leaked-password protection
(Pro plan only), and consolidating the duplicate `SUPABASE_SERVICE_ROLE_KEY`
entry into one value scoped to both environments.
