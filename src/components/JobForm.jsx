import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  JOB_FUNCTIONS,
  CITY_GROUPS,
  WORK_MODES,
  EMPLOYMENT_TYPES,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  DAYS_LIVE,
  liveSlotsLabel,
} from "../lib/jobOptions";
import { EMPTY_JOB, DESCRIPTION_MIN, DESCRIPTION_MAX, validateJob } from "../lib/jobFormModel";
import CompanyPicker from "./CompanyPicker";
import { useUnsavedChanges } from "../lib/useUnsavedChanges";

// ===========================================================================
// The posting form, shared by /recruiter/jobs/new and the edit page.
//
// Every rule below mirrors a CHECK constraint or column grant from migration
// 001. The point is that a recruiter sees "Experience: the maximum cannot be
// below the minimum" instead of
// "new row for relation jobs violates check constraint experience_range".
//
// The database remains the enforcement. This is the explanation.
//
// Posting is a two-step: fill in, then confirm on a review panel. The panel
// exists for one field in particular. A mistyped hiring company creates a
// public company row that the recruiter cannot edit and only an admin can
// fix, so the review screen is the last moment anyone sees it before it is
// permanent.
// ===========================================================================

// The hint sits BELOW the control, not between the label and it. Hints are
// one line on some fields and absent on others, so putting them above the
// input pushed paired fields in a two-column grid to different heights.
// Labels are one line everywhere, so controls now line up by construction.
function Field({ label, htmlFor, error, hint, children, required }) {
  return (
    <div data-invalid={error ? "true" : "false"}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-sm font-medium text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

// A select's placeholder has to be `disabled`, not merely empty-valued.
// Browsers' built-in type-ahead walks option TEXT, so an enabled "Choose…"
// is the first match for the letter C -- which is why pressing "c" on the
// Function or Location dropdown appeared to do nothing instead of jumping to
// Cybersecurity or Coimbatore. Disabled options are skipped by type-ahead and
// by the arrow keys.
function Placeholder({ children }) {
  return (
    <option value="" disabled>
      {children}
    </option>
  );
}

function ReviewRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-200 py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function JobForm({
  mode = "create",
  initialValues = EMPTY_JOB,
  onSubmit,
  submitting = false,
  serverError = null,
  slotsUsed = null,
  isVerified = false,
}) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState("form");
  const topRef = useRef(null);

  // "Something has actually been typed." An untouched form that is opened
  // and left alone must never prompt, so this is a comparison against the
  // values the form started with -- not a flag set by the first keystroke,
  // which would stay set after the field was cleared again.
  const isDirty = useMemo(
    () =>
      Object.keys(initialValues).some(
        (key) => String(values[key] ?? "") !== String(initialValues[key] ?? "")
      ),
    [values, initialValues]
  );

  // Off while saving: the redirect that follows a successful save is not
  // someone abandoning their work.
  const { pending, leave, stay } = useUnsavedChanges(isDirty && !submitting);

  // Derived, not stored. Keeping errors in state meant a message stayed on
  // screen after the field was fixed, because nothing recomputed it until the
  // next submit. validateJob is pure and cheap, so this is always in step
  // with what is on screen.
  const errors = touched ? validateJob(values) : {};
  const errorCount = Object.keys(errors).length;

  const set = (key) => (event) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const setCompany = (patch) => setValues((v) => ({ ...v, ...patch }));

  const descriptionLength = (values.description || "").trim().length;
  const salaryTouched = values.salary_min !== "" || values.salary_max !== "";

  const companyChanged =
    values.company_id !== initialValues.company_id ||
    values.company_name.trim() !== (initialValues.company_name || "").trim();

  // Posting always gets a review step. Editing only gets one when the hiring
  // company has been touched, because that is the only edit that can create
  // a permanent row; fixing a typo in a description should not cost two
  // clicks.
  const needsReview = mode === "create" || companyChanged;

  useEffect(() => {
    if (stage === "review") {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stage]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const found = validateJob(values);
    setTouched(true);

    if (Object.keys(found).length > 0) {
      // Field renders data-invalid on its own wrapper, so this finds the
      // first field with a message rather than nothing at all.
      requestAnimationFrame(() => {
        const first = document.querySelector("[data-invalid='true']");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    if (needsReview) {
      setStage("review");
      return;
    }

    onSubmit(values);
  };

  // Enter anywhere in a form submits it. On a form this long that means a
  // live job published by a stray keystroke. Enter is allowed only in the
  // description, where it is a newline, and on an actual button.
  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;

    const el = event.target;
    const tag = (el.tagName || "").toLowerCase();

    if (tag === "textarea" || tag === "button") return;
    event.preventDefault();
  };

  const atCap = !isVerified && slotsUsed !== null && slotsUsed >= 10;

  const cityLabel = values.city;
  const functionLabel = values.job_function;

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate className="space-y-7">
      <div ref={topRef} />

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={stay} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-heading"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 id="leave-heading" className="text-lg font-bold text-slate-900">
              {mode === "create"
                ? "This role has not been posted yet"
                : "These changes have not been saved"}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {mode === "create"
                ? "You have started filling this in but nothing has been published. If you leave now, what you have typed is gone."
                : "You have changed this role but not saved it. If you leave now, the changes are gone and the live role stays as it was."}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={stay}
                className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Keep editing
              </button>

              <button
                type="button"
                onClick={leave}
                className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Discard and leave
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* The cap, stated before they start typing rather than after they submit. */}
      {!isVerified && slotsUsed !== null && stage === "form" ? (
        <div
          className={
            atCap
              ? "rounded-xl border border-amber-300 bg-amber-50 p-4"
              : "rounded-xl border border-slate-200 bg-slate-50 p-4"
          }
        >
          <p className="text-sm text-slate-800">
            <strong>{liveSlotsLabel(slotsUsed)}</strong>{" "}
            Until your company is verified you can keep 10 live at a time.
            Closing a role, or letting one expire, frees a slot.
          </p>

          {atCap ? (
            <p className="mt-2 text-sm text-slate-800">
              You are at the limit, so this role cannot be posted yet. To lift
              it, reply to your signup email with your company website and
              GSTIN — we verify within two working days. Or{" "}
              <Link to="/recruiter/jobs" className="font-semibold text-blue-700 underline">
                close a role you have finished with
              </Link>
              .
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-800">
              Verifying your company removes the limit entirely. Reply to your
              signup email with your company website and GSTIN and we will
              verify you within two working days.
            </p>
          )}
        </div>
      ) : null}

      {serverError ? (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">{serverError.message}</p>
          {serverError.detail ? (
            <p className="mt-1.5 font-mono text-xs text-red-700">{serverError.detail}</p>
          ) : null}
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* REVIEW                                                            */}
      {/* ================================================================= */}
      {stage === "review" ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h2 className="text-base font-bold text-blue-950">
              {mode === "create" ? "Check this before it goes live" : "Check the hiring company"}
            </h2>
            <p className="mt-1 text-sm text-blue-900">
              {mode === "create"
                ? `There is no review queue. Once you confirm, this role is public immediately and stays live for ${DAYS_LIVE} days.`
                : "You have changed the hiring company, so this change is worth a second look."}
            </p>
          </div>

          <dl className="rounded-xl border border-slate-200 bg-white px-4">
            <ReviewRow label="Job title">{values.title.trim()}</ReviewRow>

            <ReviewRow label="Hiring company">
              <span className="font-semibold">{values.company_name.trim()}</span>
              {values.company_is_new ? (
                <span className="mt-1 block text-xs font-semibold text-amber-800">
                  New company — this name will be created on iWorkAtGCC and
                  cannot be edited afterwards. If it is misspelt, go back now.
                </span>
              ) : (
                <span className="mt-1 block text-xs text-slate-500">
                  Existing company — no new company record is created.
                </span>
              )}
            </ReviewRow>

            <ReviewRow label="Location">{cityLabel}</ReviewRow>
            <ReviewRow label="Function">{functionLabel}</ReviewRow>
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onSubmit(values)}
              disabled={submitting || atCap}
              className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting
                ? "Saving…"
                : mode === "create"
                  ? "Confirm and publish"
                  : "Confirm and save"}
            </button>

            <button
              type="button"
              onClick={() => setStage("form")}
              disabled={submitting}
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Back to the form
            </button>
          </div>
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* FORM                                                              */}
      {/* ================================================================= */}
      <div className={stage === "review" ? "hidden" : "space-y-7"}>

        <fieldset className="space-y-5">
          <legend className="text-base font-bold text-slate-900">The role</legend>

          <Field
            label="Job title"
            htmlFor="title"
            required
            hint="How a candidate would search for it. No company name, no requisition code."
            error={errors.title}
          >
            <input
              id="title"
              className={inputClass}
              value={values.title}
              onChange={set("title")}
              maxLength={200}
              placeholder="Senior Financial Analyst"
            />
            {mode === "edit" ? (
              <p className="mt-1 text-xs text-slate-500">
                Editing the title does not change the public link. That is
                deliberate — a link a candidate has already saved must keep
                working.
              </p>
            ) : null}
          </Field>

          <Field
            label="Hiring company"
            htmlFor="company_name"
            required
            error={errors.company_name}
          >
            <CompanyPicker value={values} onChange={setCompany} />
            <p className="mt-1.5 text-xs text-slate-500">
              Who the candidate would be working for. If you are an agency,
              this is your client, not you — your own company is shown
              separately as the posting agency.
            </p>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Function" htmlFor="job_function" required error={errors.job_function}>
              <select id="job_function" className={inputClass} value={values.job_function} onChange={set("job_function")}>
                <Placeholder>Choose…</Placeholder>
                {JOB_FUNCTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>

            <Field label="Employment type" htmlFor="employment_type" required error={errors.employment_type}>
              <select id="employment_type" className={inputClass} value={values.employment_type} onChange={set("employment_type")}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Location"
              htmlFor="city"
              required
              hint="Post a role in a suburb under its city — Thane is Mumbai."
              error={errors.city}
            >
              <select id="city" className={inputClass} value={values.city} onChange={set("city")}>
                <Placeholder>Choose…</Placeholder>
                {CITY_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.cities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            <Field label="Work mode" htmlFor="work_mode" required error={errors.work_mode}>
              <select id="work_mode" className={inputClass} value={values.work_mode} onChange={set("work_mode")}>
                <Placeholder>Choose…</Placeholder>
                {WORK_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Experience from (years)"
              htmlFor="experience_min"
              required
              hint="Use 0 for a fresher role."
              error={errors.experience_min}
            >
              <input id="experience_min" type="number" inputMode="numeric" min="0" max="50" step="1"
                className={inputClass} value={values.experience_min} onChange={set("experience_min")} />
            </Field>

            <Field
              label="Experience to (years)"
              htmlFor="experience_max"
              required
              hint="The top of the band, not a hard ceiling."
              error={errors.experience_max}
            >
              <input id="experience_max" type="number" inputMode="numeric" min="0" max="50" step="1"
                className={inputClass} value={values.experience_max} onChange={set("experience_max")} />
            </Field>
          </div>

          <Field
            label="About the role"
            htmlFor="description"
            required
            hint="What the person will do, who they report to, what the team owns. Paste from your JD if you have one — a full description is what gets the role into Google's job results."
            error={errors.description}
          >
            <textarea
              id="description"
              rows={12}
              className={inputClass}
              value={values.description}
              onChange={set("description")}
              maxLength={DESCRIPTION_MAX}
              placeholder="Describe the role…"
            />
            {/* The requirement, and only the requirement. The reason this
                number matters is in the field hint above, stated ONCE --
                Rishi, 24 Nov 2026: "The reason belongs in the hint, stated
                once." Google states no number anyway; 400 is our floor,
                roughly 60 words, chosen to catch the one-liner rather than
                to measure completeness. */}
            <p className="mt-1 text-xs text-slate-500">
              {descriptionLength < DESCRIPTION_MIN
                ? `${(DESCRIPTION_MIN - descriptionLength).toLocaleString()} more characters needed`
                : `${descriptionLength.toLocaleString()} characters`}
            </p>
          </Field>

          <Field
            label="Skills"
            htmlFor="skills"
            hint="Optional. Comma separated, up to 20."
            error={errors.skills}
          >
            <input id="skills" className={inputClass} value={values.skills} onChange={set("skills")}
              placeholder="SAP FICO, IFRS, Power BI" />
          </Field>
        </fieldset>

        {/* ---------------------------------------------------------------- */}
        <fieldset className="space-y-5 border-t border-slate-200 pt-6">
          <legend className="text-base font-bold text-slate-900">
            Salary and openings
          </legend>
          <p className="-mt-2 text-sm text-slate-600">
            Both optional. Roles that show a salary get noticeably more
            applications, but an empty field is better than a wrong one.
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Salary from" htmlFor="salary_min" error={errors.salary_min}>
              <input id="salary_min" type="number" inputMode="numeric" min="0" step="1"
                className={inputClass} value={values.salary_min} onChange={set("salary_min")} placeholder="1800000" />
            </Field>

            <Field label="Salary to" htmlFor="salary_max" error={errors.salary_max}>
              <input id="salary_max" type="number" inputMode="numeric" min="0" step="1"
                className={inputClass} value={values.salary_max} onChange={set("salary_max")} placeholder="2600000" />
            </Field>

            {salaryTouched ? (
              <>
                <Field label="Currency" htmlFor="salary_currency" required error={errors.salary_currency}>
                  <select id="salary_currency" className={inputClass} value={values.salary_currency} onChange={set("salary_currency")}>
                    {SALARY_CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Period" htmlFor="salary_period" required error={errors.salary_period}>
                  <select id="salary_period" className={inputClass} value={values.salary_period} onChange={set("salary_period")}>
                    {SALARY_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}

            <Field label="Number of openings" htmlFor="openings" hint="Optional." error={errors.openings}>
              <input id="openings" type="number" inputMode="numeric" min="1" max="999" step="1"
                className={inputClass} value={values.openings} onChange={set("openings")} placeholder="1" />
            </Field>
          </div>
        </fieldset>

        {/* ---------------------------------------------------------------- */}
        <div className="border-t border-slate-200 pt-6">
          {/* Applications are in-platform only. The "send candidates to your
              own site" option was removed on Rishi's decision: an external
              link produced no application, no candidate and no funnel data,
              which is the entire reason the board exists. An agency that has
              to route into a client ATS is handled by email.

              This is a statement, not a question, so it is no longer a
              fieldset with a heading -- but it is not deleted either. A
              recruiter who came expecting to link to their own ATS needs to
              be told why there is no such option, and here is where they
              would look for it.

              jobs.apply_mode and jobs.external_url are deliberately LEFT IN
              THE SCHEMA, so bringing the choice back is a form change and
              never a migration. insertPayload() pins them. */}
          <p className="text-sm text-slate-700">
            Candidates apply here with a resume, and you see every application
            in your dashboard. There is no option to send them to your own
            site — it would mean no application, no candidate and no numbers
            for you.
          </p>

          <p className="mt-3 text-sm text-slate-600">
            {mode === "create"
              ? `Nothing is published yet. The next screen shows what you are about to post; the role goes live only when you confirm there, and stays live for ${DAYS_LIVE} days.`
              : "Changes are live as soon as you save. The expiry date does not move when you edit."}
          </p>

          {touched && errorCount > 0 ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
              {errorCount === 1
                ? "One field needs attention — see above."
                : `${errorCount} fields need attention — see above.`}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting || atCap}
              className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {mode === "create" ? "Review this role" : "Save changes"}
            </button>

            <Link
              to="/recruiter/jobs"
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}

export default JobForm;
