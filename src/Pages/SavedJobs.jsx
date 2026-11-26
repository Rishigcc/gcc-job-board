import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import LoadingCard from "../components/LoadingCard";
import GccJobCard from "../components/GccJobCard";
import Pagination from "../components/Pagination";
import { supabase } from "../lib/supabase";
import { fetchSavedJobs, removeSavedJob } from "../lib/savedJobs";
import {
  OPEN,
  isWithheld,
  availabilityLabel,
  availabilityNote,
  savedJobToCard,
  savedSummary,
} from "../lib/savedJobsDisplay";

// ===========================================================================
// /profile/saved-jobs
//
// THE PAGE ACCOUNTS FOR EVERY SAVE, INCLUDING THE ONES THAT CAN NO LONGER BE
// APPLIED TO. The counter on /profile counts rows in public.job_saves, so a
// page that silently dropped the closed ones would show four cards under a
// number reading six. Worse, it would look like the save had failed.
//
// So public.my_saved_jobs() returns all of them with an availability, and
// each state gets its own treatment:
//
//   open        the ordinary job card, unchanged, with a filled bookmark
//   closed      a flattened card: which role it was, and that it has closed
//   withdrawn   no title and no link, because an admin took it down
//
// Removing is immediate in the list and then confirmed by the database. It
// is a bookmark: the cost of being wrong is one row, so making someone wait
// for a round trip to see the button respond would be the worse trade.
// ===========================================================================

const PER_PAGE = 10;

// A role that has closed, or one that was taken down. Deliberately not the
// job card: a card invites a click, and there is nothing to click through to.
function InactiveRow({ row, onRemove }) {
  const withheld = isWithheld(row.availability);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-base font-bold leading-snug text-slate-600">
            {withheld ? "A role you saved" : row.title}
          </h2>

          {!withheld && row.company_name ? (
            <p className="mt-0.5 break-words text-sm font-semibold text-slate-500">
              {row.company_name}
            </p>
          ) : null}

          {!withheld && row.city ? (
            <p className="mt-0.5 text-sm text-slate-500">{row.city}</p>
          ) : null}
        </div>

        <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {availabilityLabel(row.availability)}
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {availabilityNote(row.availability)}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/gcc-jobs"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          Find roles that are open
        </Link>

        <button
          type="button"
          onClick={() => onRemove(row.job_id)}
          className="rounded-full px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function SavedJobs() {
  const [userId, setUserId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      // ProtectedRoute has already proved there is a session; this is only
      // how the id is obtained for the delete.
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { rows: saved, error: fetchError } = await fetchSavedJobs();

      if (!active) return;

      if (fetchError) {
        console.error("Error loading saved roles:", fetchError);
        setError("Your saved roles could not be loaded. Reload the page to try again.");
      } else {
        setRows(saved);
      }

      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  // Optimistic. If the delete fails the row comes back, which is the honest
  // outcome -- the save still exists.
  const handleRemove = async (jobId) => {
    if (!userId) return;

    const previous = rows;
    setRows((prev) => prev.filter((r) => r.job_id !== jobId));

    const { error: removeError } = await removeSavedJob(jobId, userId);

    if (removeError) {
      console.error("Error removing saved role:", removeError);
      setRows(previous);
      setError("That role could not be removed. Try again.");
    }
  };

  // Pressing the filled bookmark on a card is the same action as Remove.
  const handleCardToggle = (e, jobId) => {
    e.preventDefault();
    e.stopPropagation();
    handleRemove(jobId);
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const start = (page - 1) * PER_PAGE;
  const visible = rows.slice(start, start + PER_PAGE);

  const handlePageChange = (next) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Seo
        title="Saved roles | iWorkAtGCC"
        description="Roles you have saved on iWorkAtGCC."
        path="/profile/saved-jobs"
        noindex
      />

      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">
        <Link
          to="/profile"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          ← Profile
        </Link>

        <div className="mt-4 text-center">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Roles You've Saved
          </h1>

          {!loading && rows.length > 0 ? (
            <p className="mt-2 text-sm text-slate-500">{savedSummary(rows)}</p>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          {loading ? (
            <LoadingCard
              title="Loading your saved roles..."
              subtitle="Fetching the roles you've saved."
            />
          ) : rows.length > 0 ? (
            visible.map((row) =>
              row.availability === OPEN ? (
                <GccJobCard
                  key={row.job_id}
                  job={savedJobToCard(row)}
                  save={{
                    saved: true,
                    justSaved: false,
                    showPopup: false,
                    onToggle: handleCardToggle,
                    onClosePopup: () => {},
                    redirectPath: "/profile/saved-jobs",
                  }}
                />
              ) : (
                <InactiveRow
                  key={row.job_id}
                  row={row}
                  onRemove={handleRemove}
                />
              )
            )
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
              <div className="mb-4 text-5xl">🔖</div>

              <h2 className="text-2xl font-bold text-slate-800">
                You haven't saved any roles yet
              </h2>

              <p className="mt-3 text-slate-500">
                Save a role to come back to it later. Saving is not applying —
                the recruiter is not told.
              </p>

              <Link
                to="/gcc-jobs"
                className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
              >
                Browse Roles
              </Link>
            </div>
          )}
        </div>

        {!loading && rows.length > PER_PAGE ? (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        ) : null}
      </section>

      <Footer />
    </div>
  );
}

export default SavedJobs;
