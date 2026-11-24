import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import { jobDisplayStatus, noticePeriodLabel } from "../lib/jobOptions";
import {
  statusLabel,
  statusTone,
  formatApplicationDate,
  applicationCountLabel,
  summariseStatuses,
} from "../lib/applicationDisplay";
import {
  fetchApplications,
  fetchApplicationCounts,
  setApplicationStatus,
  fetchResumeUrl,
} from "../lib/recruiterApplications";
import Pagination from "../components/Pagination";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/jobs/:id/applications
//
// THE VERIFICATION GATE IS NOT A UI STATE
//   An unverified recruiter is not shown a list with the names blurred out.
//   public.recruiter_applications() returns them zero rows, so the names were
//   never in the response. What this page does with that is decide WHICH
//   empty it is looking at -- a gate, or genuinely nobody -- and it decides
//   from is_verified on the recruiter's own profile row plus the counts
//   function, never by reading meaning into an empty array.
//
//   That is why there are two separate loads: counts, which an unverified
//   recruiter is allowed, and applications, which they are not.
//
// PAGING IS CLIENT-SIDE, ON PURPOSE
//   A role has tens of applications, not thousands, and the function already
//   returns only the nine columns a recruiter is entitled to. Paging in SQL
//   would mean a second round trip per page to show a list that fits in one
//   response. If a role ever draws hundreds, this is the thing to change.
// ===========================================================================

const PER_PAGE = 25;

const SELECT =
  "id, title, slug, city, job_function, status, expires_at, published_at, companies(name)";

function toneClass(tone) {
  if (tone === "good") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (tone === "new") return "bg-blue-50 text-blue-800 ring-blue-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

// One status, one button, and pressing it again undoes it. aria-pressed is
// what tells a screen reader this is a toggle rather than an action that
// fires every time.
function StatusButton({ row, value, idle, active, busy, onChange, tone }) {
  const on = row.status === value;

  const onClass =
    tone === "good"
      ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
      : "border-slate-700 bg-slate-700 text-white hover:bg-slate-800";

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={busy}
      title={
        on
          ? `Undo — put this application back to Applied`
          : `Mark this application ${active.toLowerCase()}`
      }
      onClick={() => onChange(row.id, on ? "applied" : value)}
      className={
        "rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 " +
        (on ? onClass : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
      }
    >
      {on ? `${active} ✓` : idle}
    </button>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Applications — iWorkAtGCC"
        description="People who applied to a role you posted."
        path="/recruiter/jobs"
        noindex
      />
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link
          to="/recruiter/jobs"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← My jobs
        </Link>
        {children}
      </main>
      <Footer />
    </div>
  );
}

function RecruiterApplications() {
  const { profile, user } = useRecruiter();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  const isVerified = Boolean(profile?.is_verified);
  const jobId = Number(id);

  const [state, setState] = useState({ status: "loading" });
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // A url that does not name a number cannot name a job, and that is known at
  // render time -- no request, and no state set from inside an effect.
  const resolved = Number.isInteger(jobId) && jobId > 0 ? state : { status: "missing" };

  useEffect(() => {
    if (!Number.isInteger(jobId) || jobId <= 0) return undefined;

    let active = true;

    const run = async () => {
      const [jobResult, counts, applications] = await Promise.all([
        supabase
          .from("jobs")
          .select(SELECT)
          .eq("id", jobId)
          .eq("posted_by", user.id)
          .maybeSingle(),
        fetchApplicationCounts(),
        fetchApplications(jobId, isVerified),
      ]);

      if (!active) return;

      if (jobResult.error) {
        setState({ status: "error", message: jobResult.error.message });
        return;
      }
      if (!jobResult.data) {
        setState({ status: "missing" });
        return;
      }
      if (applications.error) {
        setState({ status: "error", message: applications.error.message });
        return;
      }

      setState({
        status: "ready",
        job: jobResult.data,
        rows: applications.rows,
        gated: Boolean(applications.gated),
        count: counts.byJob?.[jobId]?.count ?? 0,
        latestAt: counts.byJob?.[jobId]?.latestAt ?? null,
      });
    };

    run();
    return () => {
      active = false;
    };
  }, [jobId, user.id, isVerified]);

  const changeStatus = useCallback(async (applicationId, status) => {
    setBusyId(applicationId);
    setActionError(null);

    const result = await setApplicationStatus(applicationId, status);

    if (result.error) {
      setActionError(result.error);
      setBusyId(null);
      return;
    }

    // Patch the one row rather than refetching the list: the server has told
    // us the value it stored, so there is nothing left to find out.
    setState((prev) =>
      prev.status === "ready"
        ? {
            ...prev,
            rows: prev.rows.map((row) =>
              row.id === applicationId ? { ...row, status: result.status } : row
            ),
          }
        : prev
    );
    setBusyId(null);
  }, []);

  const openResume = useCallback(async (applicationId) => {
    setBusyId(applicationId);
    setActionError(null);

    const result = await fetchResumeUrl(applicationId);

    if (result.error) {
      setActionError(result.error);
      setBusyId(null);
      return;
    }

    // The URL is valid for 60 seconds and is used immediately. An anchor
    // click rather than window.open, so the browser treats it as the
    // download it is instead of leaving a blank tab behind.
    const link = document.createElement("a");
    link.href = result.url;
    link.rel = "noopener";
    link.click();

    setBusyId(null);
  }, []);

  if (resolved.status === "loading") {
    return (
      <Shell>
        <p className="mt-8 text-slate-500">Loading…</p>
      </Shell>
    );
  }

  if (resolved.status === "missing") {
    return (
      <Shell>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-7">
          <h1 className="text-xl font-bold text-slate-900">Role not found</h1>
          <p className="mt-2 text-slate-600">
            Either this role does not exist, or it was posted by a different
            account. You can only see applications to roles posted by this
            account.
          </p>
        </div>
      </Shell>
    );
  }

  if (resolved.status === "error") {
    return (
      <Shell>
        <div role="alert" className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-7">
          <h1 className="text-xl font-bold text-red-900">
            These applications could not be loaded.
          </h1>
          <p className="mt-2 break-all font-mono text-xs text-red-700">{resolved.message}</p>
        </div>
      </Shell>
    );
  }

  const { job, rows, gated, count, latestAt } = resolved;
  const display = jobDisplayStatus(job);

  const page = Math.max(1, Number(params.get("page")) || 1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const goToPage = (next) => {
    const merged = new URLSearchParams(params);
    if (next <= 1) merged.delete("page");
    else merged.set("page", String(next));
    setParams(merged);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Shell>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Applications
          </h1>
          <p className="mt-1.5 break-words text-slate-700">
            <strong>{job.title}</strong>
            {job.companies?.name ? <> · {job.companies.name}</> : null} · {job.city}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {applicationCountLabel(count)}
            {latestAt ? <> · most recent {formatApplicationDate(latestAt)}</> : null}
            {" · "}
            {display.label.toLowerCase()}
          </p>
        </div>

        <Link
          to={`/gcc-jobs/${job.slug}-${job.id}`}
          className="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
        >
          View the public page
        </Link>
      </div>

      {actionError ? (
        <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">{actionError.message}</p>
          {actionError.detail ? (
            <p className="mt-1.5 font-mono text-xs text-red-700">{actionError.detail}</p>
          ) : null}
        </div>
      ) : null}

      {/* THE GATE. Not a filtered list -- the names were never sent. */}
      {gated ? (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 sm:p-7">
          <h2 className="text-lg font-bold text-amber-950">
            {count > 0
              ? `${applicationCountLabel(count)}, waiting for you`
              : "No applications yet"}
          </h2>

          <p className="mt-2 text-[15px] leading-relaxed text-amber-900">
            Please verify your company to see candidate details. For security,
            candidate details are not shared with unverified accounts.
          </p>

          <p className="mt-3 text-[15px] leading-relaxed text-amber-900">
            <strong>To get verified:</strong> reply to your signup email with
            your company website and GSTIN. We verify within two working days.
          </p>

          <p className="mt-3 text-[15px] leading-relaxed text-amber-900">
            Nothing expires while you wait — applications keep arriving and
            will all be here.
          </p>

          <p className="mt-3 text-sm text-amber-900">
            Problems? Write to{" "}
            <a
              href="mailto:jobs@iworkatgcc.com"
              className="font-semibold underline"
            >
              jobs@iworkatgcc.com
            </a>
            .
          </p>
        </div>
      ) : null}

      {!gated && rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900">No applications yet</h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            Your company is verified, so the moment someone applies their name,
            email, phone number and resume appear here.
          </p>
        </div>
      ) : null}

      {!gated && rows.length > 0 ? (
        <>
          <p className="mt-6 text-sm font-semibold text-slate-600">
            {summariseStatuses(rows)}
          </p>

          <ul className="mt-3 space-y-3">
            {visible.map((row) => {
              const busy = busyId === row.id;

              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-base font-bold text-slate-900">
                          {row.is_anonymised ? "Details removed" : row.full_name}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${toneClass(statusTone(row.status))}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </div>

                      {row.is_anonymised ? (
                        <p className="mt-1.5 text-sm text-slate-600">
                          This candidate asked us to delete their data, so their
                          name, contact details and resume are gone. The
                          application is kept so your shortlist stays intact.
                        </p>
                      ) : (
                        <>
                          {/* An email address is one unbreakable token, so
                              min-w-0 alone would not stop a long one pushing
                              the card wider than the screen. */}
                          <p className="mt-1 break-words text-sm text-slate-700">
                            <a
                              href={`mailto:${row.email}`}
                              className="font-medium text-blue-700 hover:underline"
                            >
                              {row.email}
                            </a>
                            {row.phone ? (
                              <>
                                {" · "}
                                <a
                                  href={`tel:${row.phone.replace(/[^\d+]/g, "")}`}
                                  className="font-medium text-blue-700 hover:underline"
                                >
                                  {row.phone}
                                </a>
                              </>
                            ) : null}
                          </p>

                          <p className="mt-1.5 text-xs text-slate-500">
                            Applied {formatApplicationDate(row.created_at)} ·
                            Notice period{" "}
                            {noticePeriodLabel(row.notice_period).toLowerCase()}
                          </p>
                        </>
                      )}
                    </div>

                    {/* OVERFLOWED AT 375px, AND shrink-0 WAS THE CAUSE.
                        With shrink-0 this column takes its max-content width,
                        so the flex-wrap inside it had nothing to wrap
                        against: the three buttons sat on one 433px-wide line
                        inside a 303px card and pushed the whole page
                        sideways. Measured, not reasoned about.

                        So the column is full width below sm -- which gives
                        the buttons a real constraint to wrap against -- and
                        takes its natural width only from sm up, where the
                        desktop layout is unchanged. min-w-0 stops a long
                        word doing the same thing again. */}
                    {!row.is_anonymised ? (
                      <div className="flex w-full min-w-0 flex-col items-start gap-1.5 sm:w-auto sm:shrink-0 sm:items-end">
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                          {/* Buttons, not a dropdown. Marking someone "Not
                              selected" is a judgement about a person, and on
                              a dropdown that is one stray scroll away. These
                              also make the common action a single click.
                              Pressing the active one puts the application
                              back to Applied, so nothing here is one-way. */}
                          <StatusButton
                            row={row}
                            value="shortlisted"
                            idle="Shortlist"
                            active="Shortlisted"
                            busy={busy}
                            onChange={changeStatus}
                            tone="good"
                          />

                          <StatusButton
                            row={row}
                            value="not_selected"
                            idle="Not selected"
                            active="Not selected"
                            busy={busy}
                            onChange={changeStatus}
                            tone="muted"
                          />

                          <button
                            type="button"
                            disabled={busy || !row.resume_updated_at}
                            onClick={() => openResume(row.id)}
                            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {busy ? "Working…" : "Download resume"}
                          </button>
                        </div>

                        {/* The mitigation for one-resume-per-candidate, in
                            the one place it matters: the file may be newer
                            than the application. */}
                        <p className="text-xs text-slate-500">
                          {row.resume_updated_at
                            ? `Resume updated on ${formatApplicationDate(row.resume_updated_at)}`
                            : "No resume on file"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={goToPage}
          />

          <p className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
            Candidates agreed to share these details with you for this role.
            Use them for this role and nothing else: do not add them to a
            mailing list, and do not pass them to another company. A candidate
            can ask us to delete their data at any time, and when they do their
            name and resume disappear from this page.
            {" "}
            <Link to="/recruiter-terms" className="font-semibold text-blue-700 underline">
              Recruiter terms
            </Link>
          </p>
        </>
      ) : null}
    </Shell>
  );
}

export default RecruiterApplications;
