import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import GccJobCard from "../components/GccJobCard";
import Pagination from "../components/Pagination";
import { fetchFacets, fetchJobs, JOBS_PER_PAGE } from "../lib/publicJobs";
import { supabase } from "../lib/supabase";
import { useJobSaves } from "../lib/useJobSaves";

// ===========================================================================
// /gcc-jobs -- roles posted directly on iWorkAtGCC by recruiters.
//
// Separate from /jobs, which lists roles collated from elsewhere. Candidates
// can apply to these; the collated ones send them off-site.
//
// noindex until stage 10, which renders job pages server-side. A page whose
// content arrives after JavaScript has run is worth nothing to a crawler, and
// a half-indexed job board is worse than an unindexed one.
//
// FILTER AND SEARCH STATE LIVES IN THE URL, not in useState. That makes a
// filtered list a link someone can send, and makes the browser Back button
// step back through filters instead of leaving the page.
// ===========================================================================

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

function GccJobs() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  const search = params.get("q") || "";
  const city = params.get("city") || "";
  const jobFunction = params.get("function") || "";
  const band = params.get("exp") || "";
  const page = Math.max(1, Number(params.get("page") || 1));

  // The box is a separate piece of state from the URL so that typing does not
  // fire a query per keystroke. The URL is updated on submit.
  const [draft, setDraft] = useState(search);

  const [facets, setFacets] = useState({ cities: [], functions: [], bands: [] });

  // The result carries the query it answers. "Loading" is then derived from
  // whether that matches the query on screen, rather than being a second
  // piece of state set at the top of an effect -- which both avoids a
  // cascading render and makes it impossible for the spinner and the list to
  // disagree about which search they belong to.
  const [result, setResult] = useState({ key: null, jobs: [], total: 0, error: null });

  const queryKey = JSON.stringify({ search, city, jobFunction, band, page });
  const loading = result.key !== queryKey;
  const error = result.error;

  useEffect(() => {
    let active = true;

    fetchFacets().then((f) => {
      if (active) setFacets(f);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchJobs({ search, city, jobFunction, band, page }).then((r) => {
      if (!active) return;
      setResult({ key: queryKey, jobs: r.jobs, total: r.total, error: r.error });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => {
      active = false;
    };
  }, [search, city, jobFunction, band, page, queryKey]);

  // Any change to a filter resets to page 1: staying on page 4 of a result
  // set that now has one page shows an empty list and looks broken.
  const update = (changes) => {
    const next = new URLSearchParams(params);

    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }

    if (!("page" in changes)) next.delete("page");
    setParams(next);
  };

  const clearAll = () => {
    setDraft("");
    setParams(new URLSearchParams());
  };

  // Who is looking, for the Save control only. The list itself is public and
  // identical either way -- nothing here waits on the session, so a signed-in
  // candidate sees the roles at the same moment a visitor does and the
  // bookmarks fill in when the session resolves.
  // undefined = not known yet, null = signed out, string = signed in.
  // The save controls treat undefined and null alike, but the empty state
  // says something different to each, and showing a signed-in member "join
  // our community" for half a second before correcting it is worse than
  // waiting half a second to say anything.
  const [userId, setUserId] = useState(undefined);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data?.user?.id || null);
    });

    return () => {
      active = false;
    };
  }, []);

  const jobIds = result.jobs.map((job) => job.id);
  const saves = useJobSaves(userId, jobIds);

  // The full path, so signing in from the Save button returns someone to the
  // filtered list they were looking at rather than to an unfiltered /gcc-jobs.
  const redirectPath = location.pathname + location.search;

  const filtered = Boolean(search || city || jobFunction || band);
  const totalPages = Math.max(1, Math.ceil(result.total / JOBS_PER_PAGE));
  const first = result.total === 0 ? 0 : (page - 1) * JOBS_PER_PAGE + 1;
  const last = Math.min(page * JOBS_PER_PAGE, result.total);

  return (
    <div className="min-h-screen bg-slate-100">
      <Seo
        title="Roles posted on iWorkAtGCC"
        description="Roles posted directly by recruiters hiring into India's Global Capability Centres."
        path="/gcc-jobs"
        noindex
      />

      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Roles posted on iWorkAtGCC
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Posted directly by the people hiring for GCC roles.
        </p>

        {/* ------------------------------------------------------------- */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: draft.trim() });
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Job title, skill or company"
              aria-label="Search roles"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />

            <button
              type="submit"
              className="shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Search
            </button>
          </form>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <select
              aria-label="Filter by location"
              className={selectClass}
              value={city}
              onChange={(event) => update({ city: event.target.value })}
            >
              <option value="">All locations</option>
              {facets.cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              aria-label="Filter by function"
              className={selectClass}
              value={jobFunction}
              onChange={(event) => update({ function: event.target.value })}
            >
              <option value="">All functions</option>
              {facets.functions.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>

            {/* Experience, not work mode. GCC roles are overwhelmingly
                on-site or hybrid so that filter barely splits the set, and
                most of this audience is early to mid career, where
                experience is the first thing they screen on. */}
            <select
              aria-label="Filter by experience"
              className={selectClass}
              value={band}
              onChange={(event) => update({ exp: event.target.value })}
            >
              <option value="">Any experience</option>
              {facets.bands.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          {filtered ? (
            <button
              type="button"
              onClick={clearAll}
              className="mt-3 text-sm font-semibold text-blue-700 hover:underline"
            >
              Clear search and filters
            </button>
          ) : null}
        </div>

        {/* ------------------------------------------------------------- */}
        <p className="mt-5 text-sm text-slate-600">
          {loading
            ? "Loading roles…"
            : result.total === 0
              ? "No roles"
              : `Showing ${first}–${last} of ${result.total} role${result.total === 1 ? "" : "s"}`}
        </p>

        {error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-5">
            <p className="font-semibold text-red-900">These roles could not be loaded.</p>
            <p className="mt-1 font-mono text-xs text-red-700">{error.message}</p>
          </div>
        ) : null}

        {!loading && !error && result.total === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center sm:p-10">
            <h2 className="text-lg font-bold text-slate-900">
              {filtered ? "Nothing matches that" : "No roles posted yet"}
            </h2>

            {filtered ? (
              /* A filtered miss is a different question and gets a different
                 answer. Someone who searched for a Pune finance role and
                 found none is not asking to be told about the feature -- they
                 want their filters back. Rishi's wording below is for the
                 board having nothing at all, which is what it describes. */
              <>
                <p className="mx-auto mt-2 max-w-md text-slate-600">
                  Try a broader search, or clear the filters to see everything
                  that is open.
                </p>
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-4 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Clear search and filters
                </button>
              </>
            ) : (
              /* MOSTLY UNREACHABLE BY DESIGN, AND KEPT ON PURPOSE. The promo
                 card on /jobs only renders when the board has live roles, so
                 nobody is sent here to an empty board. This is the fallback
                 for a direct URL, a bookmark, or a search result that
                 outlived the roles it was indexed from -- Rishi's decision,
                 24 Nov 2026. */
              <div className="mx-auto mt-2 max-w-xl text-slate-600">
                <p>
                  We've added this new feature because many of our GCC
                  community members asked for it. We're working directly with
                  recruiters and GCCs to bring you job openings they're
                  actively hiring for.{" "}
                  {userId === undefined ? null : userId ? (
                    <>
                      You're already in the community, so you'll be among the
                      first to know when these direct opportunities go live.
                    </>
                  ) : (
                    <>
                      Meanwhile you can join our GCC community, and we'll
                      announce it there as soon as these direct opportunities
                      go live.
                    </>
                  )}
                </p>

                {/* Nothing until we know who is looking: the first link
                    differs, and /signup bounces a signed-in person to
                    /welcome, so offering it to them would not just read
                    oddly -- it would not work. */}
                {userId === undefined ? null : (
                  <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    {userId ? (
                      <Link
                        to="/jobs"
                        className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Browse all GCC jobs
                      </Link>
                    ) : (
                      <Link
                        to="/signup"
                        className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Join the community
                      </Link>
                    )}

                    {/* The first link to the recruiter sign-up from anywhere
                        a candidate can reach. Supply is the bottleneck, and
                        this audience works at the GCCs doing the hiring. */}
                    <Link
                      to="/post-a-job"
                      className="text-sm font-semibold text-blue-700 hover:underline"
                    >
                      Are you a recruiter or GCC leader?
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {result.jobs.map((job) => (
            <GccJobCard
              key={job.id}
              job={job}
              save={{
                saved: saves.savedIds.has(job.id),
                justSaved: saves.justSavedId === job.id,
                showPopup: saves.popupFor === job.id,
                onToggle: saves.handleToggle,
                onClosePopup: () => saves.setPopupFor(null),
                redirectPath,
              }}
            />
          ))}
        </div>

        {/* THE LAST PAGE ONLY. Below page 1 of 3 it would say "coming soon"
            directly above a button that goes to twenty more roles. Dashed
            and quiet, so it does not read as a role with no title. */}
        {!loading && !error && result.total > 0 && page >= totalPages ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center">
            <p className="text-sm font-semibold text-slate-600">
              More direct GCC jobs coming soon
            </p>
          </div>
        ) : null}

        {/* Numbered pages, reusing the component the collated /jobs page
            already uses -- it collapses to 1 … 4 5 6 … 20 past a handful of
            pages, and two job lists on one site should not paginate in two
            different shapes. */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={(next) => update({ page: String(next) })}
        />

      </main>

      <Footer />
    </div>
  );
}

export default GccJobs;
