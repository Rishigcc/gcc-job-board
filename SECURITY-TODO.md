# Security TODO

Status of the security audit work on iWorkAtGCC. Last updated: 2026-09-12.

**All Critical and High findings are resolved and verified live in production.**
No outstanding item permits unauthorized data access, privilege escalation, or
code execution. The remaining work is hardening and privacy. The one availability
consideration is K3 (no rate limiting) — see that entry.

---

## Resolved (verified in production)

| # | Fix | Verified |
|---|-----|----------|
| 1 | Dropped the blanket `USING (true)` SELECT policy on `public.profiles`. Member emails are no longer readable by signed-in users (**353 → 1** rows visible). | `pg_policies` shows only `auth.uid() = id` for SELECT; anon read of `profiles` returns 401. |
| 2 | Escaped `<` to `\u003c` in the JSON-LD output of `src/components/Seo.jsx`. Stored XSS in prerendered pages closed. | Live pages return 2 `ld+json` blocks each with **0** raw `</script>` breakouts. |
| 3 | Added the `questions_slug_format` CHECK constraint, plus the slug filter and sitemap XML-escaping in `scripts/prerender.mjs`. Build-time path traversal and sitemap XML injection closed. | Constraint exists with `convalidated: true`; `SLUG_RE` + `escapeXml` present in the build script. |
| 4 | Added four security headers to `vercel.json`. | All four present on `https://www.iworkatgcc.com/`, alongside Vercel's default HSTS. |

Details:

- **#1** — `DROP POLICY "Anyone can view public profiles" ON public.profiles;`
  Cross-user display names are served by the `question_authors` view, which
  bypasses RLS as a definer view, so no UI path regressed.
- **#2** — `src/components/Seo.jsx:39` → `{JSON.stringify(entry).replace(/</g, "\\u003c")}`
  Output was byte-identical before/after (no current content contains `<`).
- **#3** — `CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`; `scripts/prerender.mjs:15,74,182,207`.
  `slugify()` was fuzzed over 20,000+ inputs and always satisfies the pattern.
- **#4** — `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
  `clipboard-write` is deliberately **not** disabled — the copy/share buttons need it.

---

## Open items (hardening & privacy, none Critical/High)

Priority order.

### B1 — `question_authors` exposes all members, not just authors

**Severity:** Medium · **Location:** view `public.question_authors`

The view is `SELECT id, display_name FROM profiles` with no `WHERE`, and it is a
definer view (owner `postgres`, `rolbypassrls`), so it bypasses the RLS added in
#1. It returns **353 rows** to anyone with the publishable key, of whom only
**10** are real authors — roughly **343 non-posting members** have their user
UUID and display name exposed. No emails leak.

**Fix — Option A (behavior-preserving). Scope to authors + hearters:**

```sql
CREATE OR REPLACE VIEW public.question_authors AS
SELECT p.id, p.display_name
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM public.questions q       WHERE q.user_id  = p.id)
   OR EXISTS (SELECT 1 FROM public.answers a         WHERE a.user_id  = p.id)
   OR EXISTS (SELECT 1 FROM public.question_hearts h WHERE h.user_id  = p.id)
   OR EXISTS (SELECT 1 FROM public.answer_hearts ah  WHERE ah.user_id = p.id);
```

Result: **11 rows instead of 353** (97% reduction), covering every ID any call
site can pass.

**Do NOT use the strict author-only version.** `NotificationsBell.jsx:213-217`
builds `actorIds` from question hearters, answerers, and answer hearters. Two of
those three are hearters, who need not have posted anything — an author-only
view makes their notifications read "Someone hearted your question" instead of
their name. 8 members currently have a display name and have never posted, so
this would surface as soon as any of them hearts something.

The other 6 of 7 `fetchAuthorNames` call sites only ever pass author IDs and are
safe either way: `Questions.jsx:77`, `QuestionDetail.jsx:338`,
`QuestionDetail.jsx:378`, `SavedQuestions.jsx:65`, `AskedQuestions.jsx:49`,
`TrendingQuestionCard.jsx:129`.

**Rollback (exact original definition):**

```sql
CREATE OR REPLACE VIEW public.question_authors AS
SELECT id, display_name FROM public.profiles;
```

`CREATE OR REPLACE VIEW` preserves grants and ownership in both directions, so
no `GRANT` statements are needed after a restore.

**Longer-term (Option B):** keep an author-only view and move notification actor
names to a `SECURITY DEFINER` function that reveals a name only to the owner of
the hearted/answered content. Better privacy; requires changing
`NotificationsBell.jsx` and deserves its own plan.

### K1 — No Content-Security-Policy

**Severity:** Medium · **Location:** `vercel.json`

Part 1 headers are deployed; CSP was deliberately deferred. Roll out in
report-only first (logs violations without blocking), then enforce. The origin
list below was gathered empirically by driving a browser over `/`, `/questions`,
a question page, `/jobs` and `/signup` — `scripts.clarity.ms` and `c.bing.com`
do not appear anywhere in `index.html` and would be missed by reading source
alone.

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://c.clarity.ms https://c.bing.com https://www.google-analytics.com https://www.googletagmanager.com;
  connect-src 'self' https://uynsvjpgeuxzndtniwrw.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://script.google.com;
  font-src 'self';
  base-uri 'self';
  object-src 'none';
  frame-ancestors 'none';
  form-action 'self'
```

Notes:
- `'unsafe-inline'` is currently unavoidable: 2 inline `<script>` blocks in
  `index.html` (gtag bootstrap, Clarity) and 9 React `style={}` attributes.
  Replacing it with hashes for the two inline blocks is the real hardening step.
- `script.google.com` is needed for the newsletter POST (`EmailSignup.jsx:22`);
  it only fires on submit so it will not appear in a passive crawl.
- No `wss:` needed — there are no Supabase Realtime subscriptions.
- No external font hosts — `index.css` uses `Inter, system-ui, sans-serif` with
  no `@font-face` and no Google Fonts link.
- No Google avatar host needed — `google_avatar_url` is stored but never
  rendered; there is no `<img>` tag anywhere in `src/`.
- `'unsafe-eval'` is omitted on purpose; report-only will reveal if GTM needs it.
- Without a `report-to` endpoint, violations appear in the browser console only.
  That is fine for manual evaluation.

### K4 — `console.log` of full user object

**Severity:** Low · **Location:** `src/Pages/Signup.jsx:46` and `:58`

Logs the complete Supabase user object (including email and provider metadata)
to the browser console in production builds.

**Fix:** delete both lines. Easiest win on this list.

### K3 — No rate limiting on content writes

**Severity:** Medium · **Location:** RLS / database layer

Nothing throttles question or answer inserts — RLS authorizes but does not meter.
A single account can flood the board. This is also the only outstanding
**availability** consideration: every new question adds a prerendered route, so
content spam inflates build time and could eventually fail the build.

**Fix:** a per-user insert-rate trigger on `questions` and `answers`.

### K2 — Session tokens in `localStorage`

**Severity:** Medium · **Location:** `src/lib/supabase.js:6-9`

`createClient` sets no `auth.storage`, so supabase-js defaults to `localStorage`,
readable by any injected script. This is what would escalate an XSS to full
account takeover — relevant again if a new XSS is ever introduced (#2 closed the
known one).

**Fix:** evaluate cookie-based session storage.

### B3 — `apply_link` rendered as `href` without scheme validation

**Severity:** Low · **Location:** `src/components/JobCard.jsx:75` and `:174`

`href={job.apply_link}` renders straight from `public/data/jobs.json` with no
scheme check. All 348 current entries are `https` and `rel="noreferrer"` is set,
so there is no current risk — but the data is externally sourced (linkedin.com,
apna.co, bebee.com, glassdoor) via a pipeline outside this repo, and a
`javascript:` URL would be a latent XSS vector.

**Fix:** validate at render, e.g.
`const href = /^https:\/\//.test(job.apply_link) ? job.apply_link : "#"`,
or enforce it wherever `jobs.json` is generated.

### B2 — Heart tables anon-readable with `user_id`

**Severity:** Low · **Location:** `question_hearts`, `answer_hearts` (`USING (true)`)

Both are anon-readable including `user_id` and `created_at`, so anyone can dump
who hearted what and when, and join to display names via `question_authors`. The
UI only ever shows aggregate counts. Small today (17 + 8 rows, 4 distinct users)
but grows with engagement.

**Fix:** serve counts through a view or RPC and restrict raw-row SELECT to the
user's own rows — mirroring how `question_saves` is already correctly locked.

---

## Remaining low items

| # | Severity | Location | Issue / fix |
|---|----------|----------|-------------|
| K5 | Low | `api/send-digest.js:348`, `:331` | Digest response body and logs enumerate member emails. Return counts and user IDs instead. |
| K6 | Low | `api/rebuild.js:19`, `api/send-digest.js:140` | Cron secret compared with `!==`. Use `crypto.timingSafeEqual` on equal-length buffers. |
| K7 | Low (scored High) | transitive via `vite` → `postcss` | `nanoid <3.3.18` (GHSA-2v37-7h3g-55p8). Build-time only, not in the served bundle. `npm audit fix`. |
| K8 | Low | `public.rls_auto_enable()` | `SECURITY DEFINER` function callable via RPC by `anon`/`authenticated`. It is an event-trigger function so a direct call errors, but `REVOKE EXECUTE` anyway. |
| K9 | Low | `questions`, `answers` | No length limits on `title`, `description`, `body`. Add CHECK constraints to prevent storage abuse. |
| K10 | Low | table ACLs | `anon` and `authenticated` hold `TRUNCATE` on public tables (Supabase default-grant artifact). Not reachable via PostgREST, but untidy — revoke. |
| K11 | Low | `update_updated_at`, `prevent_slug_change`, `mark_answer_edited` | Mutable `search_path`. Add `SET search_path = public`. |
| B4 | Low | `package.json` | Dependencies behind current (react 19.2.8→19.3.0, vite 8.2.0→8.3.0, supabase-js 2.112.3→2.116.0, react-router-dom 7.18.2→7.18.3). No advisories; routine refresh. |

---

## Verified clean (re-checked)

- No secrets in git history (59 commits); `.env` untracked and gitignored;
  service-role key, Brevo key and cron secret all absent from the client bundle.
- No SQL/NoSQL/command injection. Exactly one template literal reaches a query
  filter (`src/lib/slug.js:30`), and its input is `slugify()` output.
- No `dangerouslySetInnerHTML`, `eval`, `innerHTML`, or `document.write`.
- No IDOR — all mutations key on row id and rely on RLS (`auth.uid() = user_id`);
  the UI additionally gates on `isOwner`.
- `question_saves`, `user_activity`, `feature_interest` and
  `resume_preparer_interest` correctly refuse anonymous reads.
- `/api/send-digest` and `/api/rebuild` return 401 unauthenticated;
  `/api/send-welcome-email` returns 405 on GET.
- No SSRF (every outbound fetch targets a hardcoded host) and no file uploads.
- Passwords N/A — Google OAuth only, no password storage.
- HTTPS enforced (308 redirect) with HSTS `max-age=63072000`.
