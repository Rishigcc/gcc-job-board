import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import Pagination from "../components/Pagination";
import { fetchMyApplications } from "../lib/candidateData";
import {
  candidateStatusLabel,
  candidateStatusTone,
  candidateStatusHint,
  formatApplicationDate,
  applicationCountLabel,
} from "../lib/applicationDisplay";

// ===========================================================================
// /my-applications
//
// WHAT THIS PAGE CANNOT SHOW, AND SAYS SO
//   Nothing that has been anonymised. Delete my data erases candidate_id,
//   which is what makes "neither we nor the recruiter can connect that
//   application back to you" true -- and the price is that this list cannot
//   find it either. That is explained at the bottom rather than left as a
//   list that silently gets shorter.
//
// WHY THE ROWS COME FROM AN RPC
//   An application to a role that has since closed or expired must still
//   appear, and private.job_is_public() hides exactly those, so a direct
//   join from applications to jobs would make an application vanish on the
//   day its role ended -- the moment the candidate most wants to know what
//   happened. public.my_applications() reads past that.
// ===========================================================================

const PER_PAGE = 20;

function toneClass(tone) {
  if (tone === "good") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (tone === "new") return "bg-blue-50 text-blue-800 ring-blue-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Your applications — iWorkAtGCC"
        description="Roles you have applied to on iWorkAtGCC."
        path="/my-applications"
        noindex
      />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
      <Footer />
    </div>
  );
}

function MyApplications() {
  const [state, setState] = useState({ status: "loading" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    fetchMyApplications().then(({ rows, error }) => {
      if (!active) return;
      if (error) setState({ status: "error", message: error.detail || error.message });
      else setState({ status: "ready", rows });
    });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <Shell>
        <p className="mt-8 text-slate-500">Loading…</p>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <div role="alert" className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-7">
          <h1 className="text-xl font-bold text-red-900">
            Your applications could not be loaded.
          </h1>
          <p className="mt-2 font-mono text-xs text-red-700">{state.message}</p>
        </div>
      </Shell>
    );
  }

  const { rows } = state;
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  return (
    <Shell>
      <Link to="/profile" className="text-sm font-semibold text-blue-700 hover:underline">
        ← Your profile
      </Link>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Your applications
      </h1>
      <p className="mt-1.5 text-slate-600">
        {applicationCountLabel(rows.length)}
        {rows.length > 0 ? ", newest first" : null}.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900">
            You have not applied to anything yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-slate-600">
            When you apply to a role it appears here, with whatever the
            recruiter has done about it.
          </p>
          <Link
            to="/gcc-jobs"
            className="mt-5 inline-block rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Browse roles
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {visible.map((row) => {
              const label = candidateStatusLabel(row);

              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 break-words text-base font-bold text-slate-900">
                          {row.job_title}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${toneClass(candidateStatusTone(row))}`}
                        >
                          {label}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-700">
                        {row.company_name || "Company removed"} · {row.city}
                      </p>

                      <p className="mt-1.5 text-xs text-slate-500">
                        Applied {formatApplicationDate(row.created_at)}
                      </p>

                      <p className="mt-2 text-sm text-slate-600">
                        {candidateStatusHint(row)}
                      </p>
                    </div>

                    {/* Only while the role is still open. A dead link to a
                        page that now says "this role is no longer open" is
                        worse than no link. */}
                    {!row.job_has_ended ? (
                      <Link
                        to={`/gcc-jobs/${row.job_slug}-${row.job_id}`}
                        /* So the role page can offer a way back here as well
                           as a way to browse on. Router state, so a refresh
                           or a shared link falls back to the public
                           behaviour instead of offering a stranger a route
                           into someone else's applications. */
                        state={{ from: "applications" }}
                        className="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        View the role
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
        <p>
          An application cannot be taken back. Once you apply, the recruiter
          has it. If you want a recruiter to stop considering you for a
          particular role, email{" "}
          <a href="mailto:jobs@iworkatgcc.com" className="font-semibold text-blue-700 underline">
            jobs@iworkatgcc.com
          </a>{" "}
          and we will pass it on.
        </p>
        <p className="mt-2">
          If you use <strong>Delete my job board data</strong> on your profile,
          applications disappear from this list as well as from the recruiter's
          — the link between them and your account is erased, so nothing can
          find them again, including us.{" "}
          <Link to="/privacy" className="font-semibold text-blue-700 underline">
            How we handle your data
          </Link>
        </p>
      </div>
    </Shell>
  );
}

export default MyApplications;
