import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import {
  jobDisplayStatus,
  countsTowardCap,
  liveSlotsLabel,
  RECRUITER_JOB_SORTS,
  sortRecruiterJobs,
} from "../lib/jobOptions";
import { setJobStatus } from "../lib/jobMutations";
import { fetchApplicationCounts } from "../lib/recruiterApplications";
import { applicationCountLabel } from "../lib/applicationDisplay";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/jobs — everything this recruiter has posted.
//
// Expiry is NOT stored. A job whose expires_at has passed still has
// status = 'live' in the database; jobDisplayStatus() derives "Expired" at
// read time. That is why no cron job is needed and why this table can never
// disagree with the public page: both call the same function.
// ===========================================================================

const SELECT =
  "id, title, slug, city, job_function, work_mode, status, expires_at, " +
  "published_at, apply_mode, openings, companies(name)";

function toneClass(tone) {
  if (tone === "good") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (tone === "wait") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (tone === "risk") return "bg-red-50 text-red-800 ring-red-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RecruiterJobs() {
  const { profile, user } = useRecruiter();
  const [searchParams, setSearchParams] = useSearchParams();
  const justPosted = searchParams.get("posted");
  const justSaved = searchParams.get("saved");

  const [jobs, setJobs] = useState(null);
  // job_id -> { count, latestAt }. Allowed before verification: a number and
  // a date say nothing about who applied. Loaded alongside the jobs rather
  // than per card, so one call covers the whole page.
  const [counts, setCounts] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Bumped after a close or reopen, to refetch rather than patch local state.
  // The server is the authority on derived status, so re-reading is both
  // simpler and less likely to drift than editing the row in place.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const [{ data, error }, countResult] = await Promise.all([
        supabase
          .from("jobs")
          .select(SELECT)
          .eq("posted_by", user.id)
          .order("published_at", { ascending: false }),
        fetchApplicationCounts(),
      ]);

      if (!active) return;

      if (error) {
        setLoadError(error.message);
        setJobs([]);
        return;
      }
      setLoadError(null);
      setJobs(data || []);
      // A failed count is not a failed page. The jobs are the point; the
      // badge just goes quiet.
      setCounts(countResult.byJob || {});
    };

    run();
    return () => {
      active = false;
    };
  }, [user.id, reloadKey]);

  const changeStatus = useCallback(async (jobId, status) => {
    setBusyId(jobId);
    setActionError(null);

    const { error } = await setJobStatus({ jobId, status });

    if (error) {
      setActionError(error);
      setBusyId(null);
      return;
    }

    setReloadKey((k) => k + 1);
    setBusyId(null);
  }, []);

  const isVerified = Boolean(profile?.is_verified);
  const liveCount = (jobs || []).filter(countsTowardCap).length;

  // In the URL, so a sorted list survives a reload and can be linked to. An
  // unrecognised value falls through to newest rather than showing nothing.
  const sort = RECRUITER_JOB_SORTS.some((s) => s.value === searchParams.get("sort"))
    ? searchParams.get("sort")
    : "newest";

  const sortedJobs = jobs === null ? null : sortRecruiterJobs(jobs, counts, sort);

  const changeSort = (value) => {
    const merged = new URLSearchParams(searchParams);
    if (value === "newest") merged.delete("sort");
    else merged.set("sort", value);
    setSearchParams(merged, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="My jobs — iWorkAtGCC"
        description="Roles you have posted on iWorkAtGCC."
        path="/recruiter/jobs"
        noindex
      />
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link to="/recruiter" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Recruiter home
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              My jobs
            </h1>
            <p className="mt-1.5 text-slate-600">
              {isVerified
                ? "Your company is verified, so there is no limit on live roles."
                : `${liveSlotsLabel(liveCount)} Closing a role, or letting one expire, frees a slot.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {jobs && jobs.length > 1 ? (
              <>
                <label className="sr-only" htmlFor="sort">
                  Sort roles
                </label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(event) => changeSort(event.target.value)}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  {RECRUITER_JOB_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <Link
              to="/recruiter/jobs/new"
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Post a new job
            </Link>
          </div>
        </div>

        {justPosted ? (
          <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Your role is live.
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Candidates can see it and apply from now on.{" "}
              {isVerified
                ? "You will see applicant details as they come in."
                : "Until your company is verified you will see how many people applied and when, but not who they are."}
            </p>
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className="mt-2 text-sm font-semibold text-emerald-900 underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {justSaved ? (
          <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Your changes are saved and live.
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              The public link and the expiry date are unchanged — editing a
              role never moves either.
            </p>
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className="mt-2 text-sm font-semibold text-emerald-900 underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {actionError ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">{actionError.message}</p>
            {actionError.detail ? (
              <p className="mt-1.5 font-mono text-xs text-red-700">{actionError.detail}</p>
            ) : null}
          </div>
        ) : null}

        {loadError ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">
              Your jobs could not be loaded.
            </p>
            <p className="mt-1.5 font-mono text-xs text-red-700">{loadError}</p>
          </div>
        ) : null}

        {sortedJobs === null ? (
          <p className="mt-8 text-slate-500">Loading…</p>
        ) : sortedJobs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="text-lg font-bold text-slate-900">No roles yet</h2>
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              Post your first role and it will be live immediately. Nothing is
              reviewed first, and posting is free.
            </p>
            <Link
              to="/recruiter/jobs/new"
              className="mt-5 inline-block rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Post a role
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {sortedJobs.map((job) => {
              const display = jobDisplayStatus(job);
              const applications = counts[job.id] || null;
              const busy = busyId === job.id;
              const canClose = display.key === "live";
              const canReopen = display.key === "closed" && new Date(job.expires_at) > new Date();
              const canEdit = job.status === "live" || job.status === "closed";

              return (
                <li
                  key={job.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-base font-bold text-slate-900">
                          {job.title}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${toneClass(display.tone)}`}
                        >
                          {display.label}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-600">
                        {job.companies?.name || "Company removed"} · {job.city} ·{" "}
                        {job.job_function}
                      </p>

                      <p className="mt-1.5 text-xs text-slate-500">
                        Posted {formatDate(job.published_at)} ·{" "}
                        {display.key === "expired"
                          ? `Expired ${formatDate(job.expires_at)}`
                          : `Expires ${formatDate(job.expires_at)}`}
                        {job.apply_mode === "external"
                          ? " · Applications go to your own site"
                          : null}
                      </p>

                      {/* The count is shown whether or not the company is
                          verified -- it is the honest number, and it is the
                          reason to verify. Who applied is a different
                          question, answered on the other page. */}
                      <p className="mt-2 text-sm">
                        {applications ? (
                          <Link
                            to={`/recruiter/jobs/${job.id}/applications`}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            {applicationCountLabel(applications.count)}
                          </Link>
                        ) : (
                          <span className="text-slate-500">
                            {applicationCountLabel(0)}
                          </span>
                        )}
                        {applications && !isVerified ? (
                          <span className="text-slate-500">
                            {" "}— verify your company to see who
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {canEdit ? (
                        <Link
                          to={`/recruiter/jobs/${job.id}/edit`}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Edit
                        </Link>
                      ) : null}

                      {canClose ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(job.id, "closed")}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busy ? "Closing…" : "Close early"}
                        </button>
                      ) : null}

                      {canReopen ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(job.id, "live")}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busy ? "Reopening…" : "Reopen"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {display.key === "expired" ? (
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Expired roles stop appearing to candidates and no longer
                      count against your limit. The expiry date cannot be
                      extended — post the role again to run it for another 30
                      days.
                    </p>
                  ) : null}

                  {display.key === "hidden" ? (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                      This role was hidden by iWorkAtGCC and cannot be edited or
                      reopened. Write to jobs@iworkatgcc.com if you think that
                      is a mistake.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default RecruiterJobs;
