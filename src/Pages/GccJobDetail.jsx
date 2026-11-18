import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import ApplyPanel from "../components/ApplyPanel";
import { WORK_MODES, EMPLOYMENT_TYPES } from "../lib/jobOptions";
import { fetchJob } from "../lib/publicJobs";
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
// noindex until stage 10 renders these server-side.
//
// WHAT IS NOT HERE: applying. That is stage 6. The panel at the bottom says
// so rather than showing a button that does nothing.
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
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link to="/gcc-jobs" className="text-sm font-semibold text-blue-700 hover:underline">
          ← All roles
        </Link>
        {children}
      </main>
      <Footer />
    </div>
  );
}

function GccJobDetail() {
  const { slugId } = useParams();
  const [params] = useSearchParams();
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

  if (state.status === "loading") {
    return (
      <Shell>
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
      <Shell>
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
      <Shell>
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
    return <Navigate to={jobPath(job)} replace />;
  }

  const salary = formatSalary(job);
  const experience = formatExperience(job.experience_min, job.experience_max);
  const company = job.companies?.name || "";

  return (
    <div className="min-h-screen bg-slate-100">
      <Seo
        title={`${job.title}${company ? ` at ${company}` : ""} — iWorkAtGCC`}
        description={job.description.slice(0, 160)}
        path={jobPath(job)}
        noindex
      />

      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link to="/gcc-jobs" className="text-sm font-semibold text-blue-700 hover:underline">
          ← All roles
        </Link>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {job.title}
              </h1>
              {company ? (
                <p className="mt-1 text-lg font-semibold text-slate-700">{company}</p>
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

          <p className="mt-3 text-sm text-slate-500">
            {formatPosted(job.published_at)} · {formatCloses(job.expires_at)}
          </p>

          {/* The grid stretches both columns to the taller of the two, but
              the panel INSIDE the sidebar was only as tall as its own
              content, leaving a block of empty card below it. h-full on the
              dl is what closes that gap. */}
          <div className="mt-6 grid items-stretch gap-8 md:grid-cols-[1fr_260px]">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">About the role</h2>

              {/* Plain text from the recruiter, rendered as text. Line breaks
                  are preserved by CSS; nothing here is ever parsed as HTML. */}
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                {job.description}
              </p>

              {job.skills?.length ? (
                <>
                  <h2 className="mt-7 text-base font-bold text-slate-900">Skills</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {job.skills.map((skill) => (
                      <li
                        key={skill}
                        className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <aside>
              <dl className="h-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-1">
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
