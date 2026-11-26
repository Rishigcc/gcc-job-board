import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import { metaDescription, pageTitle } from "../lib/jobPageHead";
import ApplyPanel from "../components/ApplyPanel";
import SaveJobButton from "../components/SaveJobButton";
import JobDescription from "../components/JobDescription";
import { WORK_MODES, EMPLOYMENT_TYPES } from "../lib/jobOptions";
import { fetchJob } from "../lib/publicJobs";
import { useJobSaves } from "../lib/useJobSaves";
import { useViewer, showsCandidateControls } from "../lib/useViewer";
import {
  jobPath,
  parseJobParam,
  formatExperience,
  formatSalary,
  formatPosted,
  formatCloses,
} from "../lib/jobDisplay";

// ===========================================================================
// /gcc-jobs/<slug>-<id>
//
// The id resolves the job. The slug is decoration, and an old link may carry
// a stale one because jobs.slug is frozen while the title is editable -- so a
// mismatch redirects to the canonical path rather than 404ing or, worse,
// serving the same job on two URLs.
//
// Served with its JobPosting markup by api/public.js, so this page is
// indexable. The noindex that stood here until 24 Nov 2026 was waiting on
// exactly that.
// ===========================================================================

const workModeLabel = (value) =>
  WORK_MODES.find((m) => m.value === value)?.label || value;

const employmentLabel = (value) =>
  EMPLOYMENT_TYPES.find((t) => t.value === value)?.label || value;

function Fact({ label, children }) {
  return (
    <div className="border-b border-slate-200 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

// ===========================================================================
// WHERE "BACK" GOES.
//
// Three cases now. A candidate who arrived from their own applications list
// wants to return to it; an admin who arrived from the Roles tab wants to
// return to that; anyone else -- the public list, a shared link, a refresh --
// wants the list of roles. So the first two show their origin AND a way to
// browse on, and everything else gets the single original link.
//
// IT KEYS OFF ROUTER STATE, NOT A QUERY PARAMETER, AND THAT IS THE POINT.
//   Router state belongs to a history entry, so it travels with an in-app
//   navigation and never with a URL. A pasted link, a link shared with someone
//   else, or a new tab is a fresh history entry with no state, so it falls
//   back to exactly the behaviour that was here before -- which is what makes
//   a shared link impossible to mislead with. A ?from= parameter would survive
//   being copied and would then offer a stranger a route to "My applications"
//   or to /admin, neither of which is theirs.
//
//   A RELOAD IS NOT ONE OF THOSE CASES, and an earlier version of this comment
//   said it was. The browser preserves history.state across a reload by
//   design, so reloading keeps the origin link. That is harmless -- it is the
//   same person on the same history entry they just navigated -- and the
//   property that matters is unaffected: the fallback triggers on a NEW
//   navigation, which is every way a URL reaches someone else.
//
// THE STATE IS AN ENUM MATCHED AGAINST A FIXED LIST, NOT A PATH.
//   ORIGINS below is the whole vocabulary. An unrecognised value falls through
//   to the default, and no destination ever comes out of state -- otherwise
//   state would be a way to make this page link anywhere.
// ===========================================================================
const ORIGINS = {
  applications: { to: "/my-applications", label: "My applications", onward: "Explore other roles" },
  admin: { to: "/admin?tab=jobs", label: "Admin", onward: "All roles" },
};

function BackLinks({ from }) {
  // Object.hasOwn, not a bare lookup. Router state comes from history.state,
  // which any same-origin script can write, and ORIGINS["constructor"] would
  // return an inherited function -- truthy, with no `to`, rendering a Link to
  // undefined. An own-property check is the difference between "matched
  // against a fixed list" being true and sounding true.
  const origin = typeof from === "string" && Object.hasOwn(ORIGINS, from)
    ? ORIGINS[from]
    : null;

  if (!origin) {
    return (
      <Link to="/gcc-jobs" className="text-sm font-semibold text-blue-700 hover:underline">
        ← All roles
      </Link>
    );
  }

  return (
    <p className="text-sm font-semibold">
      <Link to={origin.to} className="text-blue-700 hover:underline">
        ← {origin.label}
      </Link>
      <span className="px-2 font-normal text-slate-400">·</span>
      {/* "other" only has a referent when the first link is a candidate's own
          applications. An admin is not browsing for themselves, so from there
          it stays "All roles" -- the same words the fallback uses, because to
          someone arriving on a direct link there is nothing for "other" to be
          other than. */}
      <Link to="/gcc-jobs" className="text-blue-700 hover:underline">
        {origin.onward}
      </Link>
    </p>
  );
}

function Shell({ from, children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <BackLinks from={from} />
        {children}
      </main>
      <Footer />
    </div>
  );
}

function GccJobDetail() {
  const { slugId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();

  // Only ever present on an in-app navigation, and only ever matched against
  // the fixed list above.
  const from = location.state?.from;
  const { id, slug } = parseJobParam(slugId);

  const [fetched, setFetched] = useState({ status: "loading" });

  // A URL with no trailing "-<number>" cannot name a job, and that is known
  // at render time -- no request, and no state to set from inside an effect.
  const state = id === null ? { status: "missing" } : fetched;

  useEffect(() => {
    if (id === null) return undefined;

    let active = true;

    fetchJob(id).then(({ job, agency, error }) => {
      if (!active) return;
      if (error) setFetched({ status: "error", message: error.message });
      else if (!job) setFetched({ status: "missing" });
      else setFetched({ status: "ready", job, agency });
    });

    return () => {
      active = false;
    };
  }, [id]);

  // Who is looking, for the Save control only. Nothing about the page waits
  // on it: the role renders for a visitor and a signed-in candidate at the
  // same moment, and the bookmark fills in when the session resolves.
  //
  // This runs before the early returns below, because a hook that is called
  // on some renders and not others is not a hook.
  //
  // One hook rather than this page's own getUser(), because the same call
  // also answers whether the viewer is a recruiter. See src/lib/useViewer.js
  // for why that is resolved in one place.
  const viewer = useViewer();
  const userId = viewer.userId;

  // DECISION F, 25 Nov 2026. A recruiter is not offered Save, because
  // /profile/saved-jobs is behind blockRecruiters and a saved role would
  // have nowhere to be seen.
  const canSave = showsCandidateControls(viewer);

  const saves = useJobSaves(userId, id === null ? [] : [id]);

  if (state.status === "loading") {
    return (
      <Shell from={from}>
        <p className="mt-8 text-slate-500">Loading…</p>
      </Shell>
    );
  }

  // A job that exists but is closed, expired, hidden or posted by a suspended
  // recruiter is simply not returned: private.job_is_public() filters it in
  // the database. There is nothing to distinguish here, and deliberately so
  // -- saying "this role has closed" for one id and "not found" for another
  // would turn the id into an oracle for which jobs exist.
  if (state.status === "missing") {
    return (
      <Shell from={from}>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-xl font-bold text-slate-900">
            This role is no longer open
          </h1>
          <p className="mt-2 text-slate-600">
            It may have been filled, closed by the recruiter, or passed its
            closing date. Roles stay open for 30 days.
          </p>
          <Link
            to="/gcc-jobs"
            className="mt-5 inline-block rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            See roles that are open
          </Link>
        </div>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell from={from}>
        <div role="alert" className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-8">
          <h1 className="text-xl font-bold text-red-900">This role could not be loaded.</h1>
          <p className="mt-2 font-mono text-xs text-red-700">{state.message}</p>
        </div>
      </Shell>
    );
  }

  const { job, agency } = state;

  // Canonical URL. The slug in the link may be stale after a title edit.
  if (slug !== job.slug) {
    return <Navigate to={jobPath(job)} replace state={location.state} />;
  }

  const salary = formatSalary(job);
  const experience = formatExperience(job.experience_min, job.experience_max);
  const company = job.companies?.name || "";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* NO noindex, and NO jsonLd.
          The markup is injected into the page source by api/public.js, per
          request. Passing jsonLd here as well would put two JobPosting
          objects on one page, and Google's rule is one job per page -- two is
          worse than none. The title and description come from the same
          helpers that function uses, so the tags React hoists on hydration
          say exactly what the served HTML already said. */}
      <Seo
        title={pageTitle(job, company)}
        description={metaDescription(job.description)}
        path={jobPath(job)}
      />

      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <BackLinks from={from} />

        {/* THE SIDEBAR RUNS THE FULL HEIGHT OF THE CARD.
            The earlier attempt made the grey panel match the DESCRIPTION
            column, which still left white card above it (the title block
            spanned the full width) and white below it (the card's own
            padding). So the card itself is now the grid: its padding is
            given to each column instead, the grey is a column rather than a
            box sitting inside one, and overflow-hidden lets it meet the
            rounded corners. Grid items stretch by default, so the colour
            reaches the bottom whichever column is taller. */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid md:grid-cols-[1fr_270px]">
            <div className="min-w-0 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {/* The title has the same fault as the description and
                      the constraint allows 200 characters, so an unbroken
                      one would overflow identically. */}
                  <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {job.title}
                  </h1>
                  {company ? (
                    <p className="mt-1 break-words text-lg font-semibold text-slate-700">{company}</p>
                  ) : null}
                </div>

                {job.companies?.logo_url ? (
                  <img
                    src={job.companies.logo_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-contain"
                  />
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500">
                  {formatPosted(job.published_at)} · {formatCloses(job.expires_at)}
                </p>

                {/* The redirect is the pathname without the query string on
                    purpose. ?apply=1 is what the sign-in round trip adds when
                    someone set out to APPLY, and carrying it here would open
                    the application form for someone who only pressed Save. */}
                {canSave ? (
                  <SaveJobButton
                    jobId={job.id}
                    saved={saves.savedIds.has(job.id)}
                    justSaved={saves.justSavedId === job.id}
                    showPopup={saves.popupFor === job.id}
                    onToggle={saves.handleToggle}
                    onClosePopup={() => saves.setPopupFor(null)}
                    redirectPath={location.pathname}
                  />
                ) : null}
              </div>

              <h2 className="mt-7 text-base font-bold text-slate-900">About the role</h2>

              {/* CARRIED ITEM 27, 25 Nov 2026. Recruiters paste Markdown and
                  this printed it raw, so candidates read "# Job Description"
                  and "**bold**" on screen. It now renders a closed subset --
                  headings, bold, italic, lists, line breaks -- parsed by
                  src/lib/descriptionMarkdown.js and rendered to REACT
                  ELEMENTS by JobDescription.

                  NOTHING HERE IS EVER PARSED AS HTML, which was true before
                  and is still true: there is no dangerouslySetInnerHTML in
                  src/ at all, and the suite asserts it. A recruiter's "<" is
                  a character in a text node, not escaped markup.

                  whitespace-pre-wrap IS GONE, and that is the point: newlines
                  are now structure in the tree rather than whitespace CSS
                  happens to preserve, which is what lets the JSON-LD say the
                  same thing from the same parse.

                  break-words IS STILL LOAD-BEARING and moved INTO the
                  renderer, on every block and every list item. A pasted URL,
                  a line of dashes or a description typed without spaces ran
                  straight past the card edge; Rishi found it on 24 Nov 2026.
                  The min-w-0 on the grid column above is the other half --
                  without it the track itself widens and no amount of wrapping
                  inside helps. A 180-character word inside an <h3> is a
                  different measurement from one inside a <p>, so
                  check-overflow.mjs covers both. */}
              <JobDescription text={job.description} />

              {job.skills?.length ? (
                <>
                  <h2 className="mt-7 text-base font-bold text-slate-900">Skills</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {job.skills.map((skill) => (
                      <li
                        key={skill}
                        className="min-w-0 max-w-full break-words rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <aside className="border-t border-slate-200 bg-slate-50 px-6 py-3 sm:px-8 md:border-l md:border-t-0 md:px-6">
              <dl>
                <Fact label="Location">{job.city}</Fact>
                <Fact label="Work mode">{workModeLabel(job.work_mode)}</Fact>
                <Fact label="Experience">{experience || "Not stated"}</Fact>
                <Fact label="Function">{job.job_function}</Fact>
                <Fact label="Employment type">{employmentLabel(job.employment_type)}</Fact>
                {/* Always present here, unlike on the cards. An absent row
                    reads as an oversight on a page someone is studying; the
                    same row repeated down twenty cards is noise to someone
                    scanning. */}
                <Fact label="Salary">
                  {salary || <span className="text-slate-500">Not disclosed</span>}
                </Fact>
                {job.openings ? (
                  <Fact label="Openings">{job.openings}</Fact>
                ) : null}

                {/* The posting agency belongs here and not on the card: on a
                    list it is the loudest thing and says nothing about the
                    job; here, someone has already decided to read. It comes
                    from an RPC because recruiter_profiles is not readable by
                    candidates -- see migration 005. */}
                {agency && agency !== company ? (
                  <Fact label="Posted by">{agency}</Fact>
                ) : null}
              </dl>
            </aside>
          </div>
        </div>

        {/* ?apply=1 is what the sign-in round trip comes back with, so
            someone who signed in to apply lands on an open form rather than
            on a button they have to find and press again. */}
        <ApplyPanel
          job={job}
          agency={agency}
          openByDefault={params.get("apply") === "1"}
        />
      </main>

      <Footer />
    </div>
  );
}

export default GccJobDetail;
