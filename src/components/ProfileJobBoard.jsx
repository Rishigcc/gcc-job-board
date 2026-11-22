import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyResume, uploadResume } from "../lib/applications";
import { MAX_RESUME_BYTES } from "../lib/applicationModel";
import { fetchMyApplications, fetchMyResumeUrl } from "../lib/candidateData";
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
// DELIBERATELY PLAIN, AND DELIBERATELY NOT DESTRUCTIVE
//   Rishi's instruction, 22 Nov 2026: no explanatory paragraph and no warning
//   box on the resting page, and no red panel on a page the whole community
//   opens every day. So the resume block is a date and a button, and the only
//   route to anything destructive is one quiet text link at the bottom.
//
//   The one fact that could not simply be dropped is that there is ONE resume
//   and replacing it reaches back into applications already sent. It is not
//   standing page text; it appears once a file has been chosen, next to the
//   button that would do it. That keeps the resting page clean without making
//   a replacement silent.
// ===========================================================================

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

  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);
  const fileRef = useRef(null);

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

  const pick = (event) => {
    const file = event.target.files?.[0] || null;
    setError(null);
    setNotice(null);

    if (!file) {
      setChosen(null);
      return;
    }

    if (file.size > MAX_RESUME_BYTES) {
      setChosen(null);
      setError("That file is larger than 2 MB. Most resumes are well under that.");
      return;
    }

    setChosen(file);
  };

  const send = async () => {
    setBusy(true);
    setError(null);

    const result = await uploadResume(chosen);

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    setChosen(null);
    if (fileRef.current) fileRef.current.value = "";
    setNotice("Saved.");
    setReloadKey((k) => k + 1);
    setBusy(false);
  };

  const download = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await fetchMyResumeUrl();

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    // Valid for 60 seconds and used immediately. An anchor click rather than
    // window.open, so the browser treats it as the download it is instead of
    // leaving a blank tab behind.
    const link = document.createElement("a");
    link.href = result.url;
    link.rel = "noopener";
    link.click();

    setBusy(false);
  };

  const cancel = () => {
    setChosen(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
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
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700">
              {resume ? (
                <>Updated on <strong>{formatApplicationDate(resume.updated_at)}</strong></>
              ) : (
                "No resume on file."
              )}
            </p>

            {/* Hidden, so the resting state is a line and a button. */}
            <input
              ref={fileRef}
              id="profile-resume"
              type="file"
              accept="application/pdf,.pdf"
              onChange={pick}
              className="sr-only"
            />

            {chosen ? (
              <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">
                  {chosen.name} · {(chosen.size / 1024).toFixed(0)} KB
                </p>

                {/* Said here, at the moment it would happen, rather than as
                    standing text on the page. */}
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  This becomes your resume for every role, including ones you
                  have already applied to.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {busy ? "Uploading…" : "Upload"}
                  </button>

                  <button
                    type="button"
                    onClick={cancel}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {/* Only when there is a file. Without this a candidate can
                    replace their resume but never see which one a recruiter
                    is actually being given. */}
                {resume ? (
                  <button
                    type="button"
                    onClick={download}
                    disabled={busy}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {busy ? "Opening…" : "Download"}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {resume ? "Upload a new resume" : "Upload a resume"}
                </button>
              </div>
            )}

            {error ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}

            {notice ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p>
            ) : null}
          </>
        )}
      </Block>

      {/* ------------------------------------------- the quiet way out */}
      <p className="mt-8 text-center text-sm">
        <Link to="/profile/delete-data" className="text-slate-500 underline hover:text-slate-700">
          Delete my job board data
        </Link>
      </p>
    </>
  );
}

export default ProfileJobBoard;
