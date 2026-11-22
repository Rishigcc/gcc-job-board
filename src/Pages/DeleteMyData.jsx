import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";
import { fetchMyResume } from "../lib/applications";
import { deleteMyResume, deleteMyJobData } from "../lib/candidateData";
import { formatApplicationDate } from "../lib/applicationDisplay";

// ===========================================================================
// /profile/delete-data
//
// WHY THIS IS ITS OWN PAGE
//   Rishi's instruction, 22 Nov 2026: no red panel on /profile, which the
//   whole community opens every day, but the feature stays because the
//   privacy policy promises it. So /profile carries one quiet text link and
//   everything destructive lives here, where arriving is already a decision.
//
// IT ALSO HOLDS "DELETE MY RESUME ONLY"
//   That used to sit on /profile. The policy says a resume can be deleted on
//   its own "without deleting anything else", so the action could not simply
//   disappear when the profile block was stripped back to a date and an
//   upload button. It belongs with the other destructive action rather than
//   on the resting page.
//
// THE WORDING IS THE APPROVED WORDING
//   The three paragraphs and the typed confirmation are unchanged from what
//   was signed off. The only thing this page changes is where they live.
// ===========================================================================

const CONFIRMATION = "DELETE MY DATA";

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Delete my job board data — iWorkAtGCC"
        description="Permanently delete your resume and anonymise your applications."
        path="/profile/delete-data"
        noindex
      />
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <Link to="/profile" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Your profile
        </Link>
        {children}
      </main>
      <Footer />
    </div>
  );
}

function DeleteMyData() {
  const [resume, setResume] = useState(undefined);

  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const confirmRef = useRef(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;

      // Only needed to read the resume row; the endpoints derive identity
      // from the bearer token themselves, so nothing else here needs it.
      const id = data?.user?.id || null;

      if (!id) {
        setResume(null);
        return;
      }

      fetchMyResume(id).then((row) => {
        if (active) setResume(row);
      });
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleDeleteResume = async () => {
    setBusy("resume");
    setError(null);
    setNotice(null);

    const result = await deleteMyResume();

    if (result.error) {
      setError(result.error.message);
      setBusy(null);
      return;
    }

    setNotice(
      result.data?.deleted
        ? "Your resume file has been permanently deleted."
        : "There was no resume on file."
    );
    setReloadKey((k) => k + 1);
    setBusy(null);
  };

  const handleDeleteAll = async () => {
    setBusy("all");
    setError(null);
    setNotice(null);

    const result = await deleteMyJobData(typed.trim());

    if (result.error) {
      setError(result.error.message);
      setBusy(null);
      return;
    }

    setDone({
      applications: result.data?.applications_anonymised ?? 0,
      resume: Boolean(result.data?.resume_deleted),
    });
    setTyped("");
    setBusy(null);
  };

  if (done) {
    return (
      <Shell>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          Done
        </h1>

        <div className="mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
          <p className="text-[15px] leading-relaxed text-emerald-900">
            {done.resume
              ? "Your resume file has been permanently deleted. "
              : "There was no resume on file. "}
            {done.applications === 0
              ? "You had no applications to anonymise."
              : `${done.applications} ${done.applications === 1 ? "application has" : "applications have"} been anonymised — your name, email, phone number, notice period and the link to your account are erased.`}
          </p>

          <p className="mt-3 text-[15px] leading-relaxed text-emerald-900">
            Your community account, questions and answers are untouched.
          </p>
        </div>

        <Link
          to="/profile"
          className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Back to your profile
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Delete my job board data
      </h1>

      {/* --------------------------------------------- resume only */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7">
        <h2 className="text-base font-bold text-slate-900">
          Delete my resume only
        </h2>

        {resume === undefined ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : resume ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Deletes the PDF on file, updated{" "}
              {formatApplicationDate(resume.updated_at)}, and nothing else.
              Applications you have already sent stay exactly as they are — the
              recruiter keeps them and will see <strong>No resume on file</strong>{" "}
              against them. This does not withdraw anything.
            </p>

            <button
              type="button"
              onClick={handleDeleteResume}
              disabled={busy === "resume"}
              className="mt-4 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "resume" ? "Deleting…" : "Delete my resume"}
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No resume on file.</p>
        )}

        {notice ? (
          <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p>
        ) : null}
      </div>

      {/* --------------------------------------------- everything */}
      <div className="mt-6 rounded-2xl border border-red-300 bg-white px-5 py-6 shadow-sm sm:px-7">
        <h2 className="text-base font-bold text-slate-900">
          Delete everything
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Permanently deletes your resume file and strips your name, email,
          phone number and notice period from every application you have sent.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          <strong>This does not touch your community account.</strong> Your
          questions, your answers and your display name all stay exactly as
          they are.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          This cannot be undone, and your applications will disappear from your
          own list too.
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
          <label
            htmlFor="delete-confirmation"
            className="block text-sm font-semibold text-red-900"
          >
            Type {CONFIRMATION} to confirm
          </label>

          <input
            id="delete-confirmation"
            ref={confirmRef}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
          />

          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={busy === "all" || typed.trim() !== CONFIRMATION}
            className="mt-3 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy === "all" ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        To have your community account, questions and answers removed as well,
        email{" "}
        <a href="mailto:jobs@iworkatgcc.com" className="font-semibold text-blue-700 underline">
          jobs@iworkatgcc.com
        </a>{" "}
        and say you want both.{" "}
        <Link to="/privacy" className="font-semibold text-blue-700 underline">
          What happens to your data
        </Link>
      </p>
    </Shell>
  );
}

export default DeleteMyData;
