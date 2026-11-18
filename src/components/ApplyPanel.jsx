import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { setPostLoginRedirect } from "../lib/postLoginRedirect";
import { NOTICE_PERIODS, noticePeriodLabel } from "../lib/jobOptions";
import { jobPath } from "../lib/jobDisplay";
import { fetchMyApplication, fetchMyResume, submitApplication } from "../lib/applications";
import { MAX_RESUME_BYTES, validateApplication } from "../lib/applicationModel";

// ===========================================================================
// Applying, on the job detail page.
//
// INLINE SIGN-IN THAT HOLDS THE JOB
//   A signed-out visitor is sent to /signup with the job's own path stashed
//   in sessionStorage by setPostLoginRedirect -- the same mechanism the
//   community side already uses. They come back to this job with ?apply=1,
//   and the form is open and scrolled to. They do not land on a dashboard
//   and have to find the role again.
//
// WHAT IS CAPTURED, AND WHY IT IS COPIED RATHER THAN LINKED
//   Name and email are written onto the application row, not read live from
//   the profile. An application is a record of what someone said on the day.
//   Changing your display name next month must not rewrite applications you
//   already sent.
//
//   The resume is the deliberate exception. It lives on the candidate, one
//   per person, so applying to a sixth role is four fields and a button
//   rather than hunting for a file again. The consequence is stated on the
//   form before anyone presses Replace: a new upload becomes the resume for
//   every application, including ones already sent.
// ===========================================================================

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

function Field({ label, htmlFor, error, hint, children, required }) {
  return (
    <div data-invalid={error ? "true" : "false"}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

function Panel({ tone = "plain", children }) {
  const border =
    tone === "done"
      ? "border-emerald-300 bg-emerald-50"
      : tone === "quiet"
        ? "border-slate-200 bg-white"
        : "border-slate-200 bg-white";

  return (
    <div className={`mt-5 rounded-2xl border p-6 shadow-sm sm:p-7 ${border}`}>
      {children}
    </div>
  );
}

const longDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function ApplyPanel({ job, agency, openByDefault }) {
  const navigate = useNavigate();

  const [session, setSession] = useState(undefined);
  const [existing, setExisting] = useState(undefined);
  const [resumeOnFile, setResumeOnFile] = useState(undefined);
  const [replacing, setReplacing] = useState(false);
  const [open, setOpen] = useState(Boolean(openByDefault));

  const [values, setValues] = useState({
    full_name: "",
    email: "",
    phone: "",
    notice_period: "",
    resume: null,
    consent: false,
  });

  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;

      const next = data.session;
      setSession(next);

      if (!next) {
        setExisting(null);
        setResumeOnFile(null);
        return;
      }

      // Prefill from whatever the identity provider gave us. Google supplies
      // full_name and name; a password account supplies neither, so the
      // field is simply empty rather than guessed at.
      const meta = next.user.user_metadata || {};
      setValues((v) => ({
        ...v,
        full_name: v.full_name || meta.full_name || meta.name || "",
        email: v.email || next.user.email || "",
      }));

      // In parallel: have they applied to this role, and is there already a
      // resume on their account from another one?
      Promise.all([
        fetchMyApplication(job.id, next.user.id),
        fetchMyResume(next.user.id),
      ]).then(([row, resume]) => {
        if (!active) return;
        setExisting(row);
        setResumeOnFile(resume);
      });
    });

    return () => {
      active = false;
    };
  }, [job.id]);

  // A file is required only when there is nothing on file. The same rule is
  // enforced in the database by private.applications_guard().
  const hasResumeOnFile = Boolean(resumeOnFile);
  const errors = touched ? validateApplication(values, { hasResumeOnFile }) : {};
  const errorCount = Object.keys(errors).length;

  const set = (key) => (event) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched(true);

    const found = validateApplication(values, { hasResumeOnFile });
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => {
        document
          .querySelector("[data-invalid='true']")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setSubmitting(true);
    setServerError(null);

    const result = await submitApplication({
      job,
      values,
      userId: session.user.id,
      hasResumeOnFile,
    });

    if (result.error) {
      setServerError(result.error);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  // ---------------------------------------------------------------- states

  if (session === undefined || existing === undefined || resumeOnFile === undefined) {
    return (
      <Panel>
        <p className="text-slate-500">Loading…</p>
      </Panel>
    );
  }

  if (submitted) {
    return (
      <Panel tone="done">
        <h2 className="text-lg font-bold text-emerald-950">
          You have applied to this job
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-emerald-900">
          Your resume and details have gone to the recruiter for{" "}
          <strong>{job.title}</strong>
          {job.companies?.name ? <> at <strong>{job.companies.name}</strong></> : null}.
        </p>

        {/* The posting agency is named here as well as in the sidebar. If a
            staffing firm is handling this role, the candidate should know
            who actually receives their resume. */}
        {agency && agency !== job.companies?.name ? (
          <p className="mt-2 text-[15px] leading-relaxed text-emerald-900">
            This role is being handled by <strong>{agency}</strong>, so they
            will see your application as well as the hiring company.
          </p>
        ) : null}

        {/* Says only what is true today. It deliberately stops short of
            promising we will never email about an application: candidate
            email is deferred, not ruled out, and published copy should not
            have to be walked back. */}
        <p className="mt-3 text-sm text-emerald-900">
          Recruiters contact candidates directly.
        </p>
      </Panel>
    );
  }

  if (existing) {
    return (
      <Panel tone="done">
        {/* Same sentence as the confirmation panel above: this is the same
            fact, read a minute later or a week later. */}
        <h2 className="text-lg font-bold text-emerald-950">
          You have applied to this job
        </h2>
        <p className="mt-2 text-[15px] text-emerald-900">
          Sent on {longDate(existing.created_at)}, with a notice period of{" "}
          {noticePeriodLabel(existing.notice_period).toLowerCase()}. Only one
          application per role is kept.
        </p>

        {resumeOnFile ? (
          <p className="mt-2 text-sm text-emerald-900">
            The recruiter sees the resume on your account, updated{" "}
            {longDate(resumeOnFile.updated_at)}.
          </p>
        ) : null}
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel>
        <h2 className="text-lg font-bold text-slate-900">Apply for this role</h2>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-slate-700">
          You need an account to apply, so the recruiter knows who they are
          hearing from. It takes one click with Google, and you come straight
          back to this role.
        </p>

        <button
          type="button"
          onClick={() => {
            setPostLoginRedirect(`${jobPath(job)}?apply=1`);
            navigate("/signup", { state: { mode: "signin" } });
          }}
          className="mt-4 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Sign in and apply
        </button>
      </Panel>
    );
  }

  if (job.posted_by === session.user.id) {
    return (
      <Panel>
        <h2 className="text-lg font-bold text-slate-900">This is your own posting</h2>
        <p className="mt-2 text-[15px] text-slate-700">
          You posted this role, so you cannot apply to it. Applications appear
          in your recruiter dashboard.
        </p>
      </Panel>
    );
  }

  if (!open) {
    return (
      <Panel>
        <h2 className="text-lg font-bold text-slate-900">Apply for this role</h2>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-slate-700">
          {resumeOnFile
            ? "Four short answers. Your resume is already on file, so there is nothing to upload."
            : "A PDF resume and four short answers. The recruiter sees it straight away — there is no queue at our end."}
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Apply now
        </button>
      </Panel>
    );
  }

  // ----------------------------------------------------------------- form

  return (
    <Panel>
      <h2 className="text-lg font-bold text-slate-900">Apply for this role</h2>

      {serverError ? (
        <div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">{serverError.message}</p>
          {serverError.detail ? (
            <p className="mt-1.5 font-mono text-xs text-red-700">{serverError.detail}</p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name" required error={errors.full_name}>
            <input id="full_name" className={inputClass} value={values.full_name}
              onChange={set("full_name")} maxLength={120} autoComplete="name" />
          </Field>

          <Field
            label="Email"
            htmlFor="email"
            required
            hint="Where the recruiter will reply."
            error={errors.email}
          >
            <input id="email" type="email" className={inputClass} value={values.email}
              onChange={set("email")} autoComplete="email" />
          </Field>

          <Field label="Phone" htmlFor="phone" hint="Optional." error={errors.phone}>
            <input id="phone" type="tel" className={inputClass} value={values.phone}
              onChange={set("phone")} autoComplete="tel" placeholder="+91 98765 43210" />
          </Field>

          <Field label="Notice period" htmlFor="notice_period" required error={errors.notice_period}>
            <select id="notice_period" className={inputClass} value={values.notice_period}
              onChange={set("notice_period")}>
              <option value="" disabled>Choose…</option>
              {NOTICE_PERIODS.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* One resume per candidate. Someone applying to their fifth role
            should not be looking for the file again -- and the one thing
            that is NOT obvious, that replacing it changes what every
            recruiter sees, is said before the button, not after it. */}
        <Field
          label="Resume"
          htmlFor={resumeOnFile && !replacing ? undefined : "resume"}
          required
          hint={
            resumeOnFile && !replacing
              ? "This is the resume every recruiter you apply to will see."
              : resumeOnFile
                ? "PDF only, up to 2 MB. This replaces the resume on your account for every role, including ones you have already applied to."
                : "PDF only, up to 2 MB. We check the file itself, not its name — a document renamed to .pdf is refused. It is kept on your account, so you only upload it once."
          }
          error={errors.resume}
        >
          {resumeOnFile && !replacing ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
              <p className="text-sm text-slate-800">
                <strong>Resume on file</strong> — updated{" "}
                {longDate(resumeOnFile.updated_at)}.
              </p>

              <button
                type="button"
                onClick={() => setReplacing(true)}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Replace it
              </button>
            </div>
          ) : (
            <>
              <input
                id="resume"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setValues((v) => ({ ...v, resume: event.target.files?.[0] || null }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700"
              />

              {values.resume ? (
                <p className="mt-1 text-xs text-slate-500">
                  {values.resume.name} · {(values.resume.size / 1024).toFixed(0)} KB
                  {values.resume.size > MAX_RESUME_BYTES ? " — too large" : ""}
                </p>
              ) : null}

              {resumeOnFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setReplacing(false);
                    setValues((v) => ({ ...v, resume: null }));
                  }}
                  className="mt-2 text-xs font-semibold text-blue-700 underline"
                >
                  Keep the resume already on file
                </button>
              ) : null}
            </>
          )}
        </Field>

        <div data-invalid={errors.consent ? "true" : "false"}>
          <label className="flex items-start gap-2.5 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.consent}
              onChange={(event) =>
                setValues((v) => ({ ...v, consent: event.target.checked }))
              }
            />
            <span>
              I am happy for iWorkAtGCC to share my name, email, phone number
              and resume with the recruiter for this role, so they can consider
              me for it. I can ask for my data to be deleted at any time.
            </span>
          </label>
          {errors.consent ? (
            <p className="mt-1 text-sm font-medium text-red-700">{errors.consent}</p>
          ) : null}
        </div>

        {touched && errorCount > 0 ? (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {errorCount === 1
              ? "One field needs attention — see above."
              : `${errorCount} fields need attention — see above.`}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Sending…" : "Send application"}
          </button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Your resume is stored privately and is never published. Only the
          recruiter for this role can be shown it, and only once their company
          has been verified.
        </p>
      </form>
    </Panel>
  );
}

export default ApplyPanel;
