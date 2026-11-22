import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyResume } from "../lib/applications";
import { deleteMyResume, deleteMyJobData, fetchMyApplications } from "../lib/candidateData";
import { formatApplicationDate } from "../lib/applicationDisplay";

// ===========================================================================
// The job board blocks on /profile.
//
// A SEPARATE COMPONENT ON PURPOSE
//   /profile is a page roughly 2,500 community members use, and it predates
//   the job board. Keeping this out of it means the diff to that file is one
//   import and one line, and anything that goes wrong here cannot take the
//   display-name form down with it.
//
// WHY THE DELETE CONTROL IS HERE AT ALL
//   Because the privacy policy says "There is a Delete my data option in
//   your profile", and the policy was published first. The page follows the
//   promise rather than the promise following the page.
//
// WHAT THE WORDING HAS TO CARRY
//   Two things people get wrong about a delete button, both stated before
//   it rather than after: this one does NOT touch the community account, and
//   it takes the applications out of the candidate's own list too, because
//   erasing the link is the whole point.
// ===========================================================================

const CONFIRMATION = "DELETE MY DATA";

function Block({ title, children }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function ProfileJobBoard({ userId }) {
  // undefined = still loading, null = nothing on file.
  const [resume, setResume] = useState(undefined);
  const [appCount, setAppCount] = useState(null);

  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!userId) return undefined;

    let active = true;

    Promise.all([fetchMyResume(userId), fetchMyApplications()]).then(
      ([resumeRow, applications]) => {
        if (!active) return;
        setResume(resumeRow);
        setAppCount(applications.rows ? applications.rows.length : null);
      }
    );

    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

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
    setConfirmOpen(false);
    setTyped("");
    setReloadKey((k) => k + 1);
    setBusy(null);
  };

  if (!userId) return null;

  return (
    <>
      {/* ------------------------------------------------ applications */}
      <Block title="Your applications">
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {appCount === null
            ? "Roles you have applied to, and what the recruiter has done about each one."
            : appCount === 0
              ? "You have not applied to any roles yet."
              : `You have applied to ${appCount} ${appCount === 1 ? "role" : "roles"}.`}
        </p>

        <Link
          to="/my-applications"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          See your applications
        </Link>
      </Block>

      {/* ----------------------------------------------------- resume */}
      <Block title="Your resume">
        {resume === undefined ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : resume ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              One PDF on file, updated{" "}
              <strong>{formatApplicationDate(resume.updated_at)}</strong>. Every
              role you apply to uses this file, including ones you applied to
              before you last changed it.
            </p>

            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              Deleting it does not withdraw anything. Recruiters keep the
              applications you sent and will see <strong>No resume on file</strong>{" "}
              against them. To replace it instead, upload a new one next time
              you apply.
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
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            No resume on file. You upload one the first time you apply to a
            role, and it is kept for the next time.
          </p>
        )}
      </Block>

      {/* ------------------------------------------------ delete my data */}
      <Block title="Delete my job board data">
        {done ? (
          <div className="mt-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Done.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-emerald-900">
              {done.resume
                ? "Your resume file has been permanently deleted. "
                : "There was no resume on file. "}
              {done.applications === 0
                ? "You had no applications to anonymise."
                : `${done.applications} ${done.applications === 1 ? "application has" : "applications have"} been anonymised — your name, email, phone number, notice period and the link to your account are erased.`}
            </p>
            <p className="mt-2 text-sm text-emerald-900">
              Your community account, questions and answers are untouched.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Permanently deletes your resume file and strips your name, email,
              phone number and notice period from every application you have
              sent.
            </p>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              <strong>This does not touch your community account.</strong> Your
              questions, your answers and your display name all stay exactly as
              they are.
            </p>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              This cannot be undone, and your applications will disappear from
              your own list too.
            </p>

            {error ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}

            {notice ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p>
            ) : null}

            {!confirmOpen ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(true);
                  setError(null);
                  requestAnimationFrame(() => confirmRef.current?.focus());
                }}
                className="mt-4 rounded-lg border border-red-300 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100"
              >
                Delete my job board data
              </button>
            ) : (
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

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={busy === "all" || typed.trim() !== CONFIRMATION}
                    className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {busy === "all" ? "Deleting…" : "Delete permanently"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmOpen(false);
                      setTyped("");
                      setError(null);
                    }}
                    disabled={busy === "all"}
                    className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              To have your community account, questions and answers removed as
              well, email{" "}
              <a href="mailto:jobs@iworkatgcc.com" className="font-semibold text-blue-700 underline">
                jobs@iworkatgcc.com
              </a>{" "}
              and say you want both.{" "}
              <Link to="/privacy" className="font-semibold text-blue-700 underline">
                What happens to your data
              </Link>
            </p>
          </>
        )}
      </Block>
    </>
  );
}

export default ProfileJobBoard;
