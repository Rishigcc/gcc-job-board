import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  JOB_FUNCTIONS,
  CITY_GROUPS,
  WORK_MODES,
  EMPLOYMENT_TYPES,
  SALARY_CURRENCIES,
  SALARY_PERIODS,
  DAYS_LIVE,
  slugify,
} from "../lib/jobOptions";
import { EMPTY_JOB, DESCRIPTION_MIN, DESCRIPTION_MAX, validateJob } from "../lib/jobFormModel";

// ===========================================================================
// The posting form, shared by /recruiter/jobs/new and the edit page.
//
// Every rule below mirrors a CHECK constraint or column grant from migration
// 001. The point is that a recruiter sees "Experience: the maximum cannot be
// below the minimum" instead of
// "new row for relation jobs violates check constraint experience_range".
//
// The database remains the enforcement. This is the explanation.
// ===========================================================================

function Field({ label, htmlFor, error, hint, children, required }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-sm font-medium text-red-700">{error}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

function JobForm({
  mode = "create",
  initialValues = EMPTY_JOB,
  companies = [],
  onSubmit,
  submitting = false,
  serverError = null,
  slotsUsed = null,
  isVerified = false,
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);

  const set = (key) => (event) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const descriptionLength = (values.description || "").trim().length;
  const previewSlug = useMemo(() => slugify(values.title), [values.title]);
  const salaryTouched = values.salary_min !== "" || values.salary_max !== "";

  const handleSubmit = (event) => {
    event.preventDefault();
    const found = validateJob(values);
    setErrors(found);
    setTouched(true);

    if (Object.keys(found).length > 0) {
      const first = document.querySelector("[data-invalid='true']");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onSubmit(values);
  };

  const fieldProps = (key) => ({
    error: touched ? errors[key] : undefined,
    "data-invalid": touched && errors[key] ? "true" : "false",
  });

  const atCap = !isVerified && slotsUsed !== null && slotsUsed >= 10;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-7">

      {/* The cap, stated before they start typing rather than after they submit. */}
      {!isVerified && slotsUsed !== null ? (
        <div
          className={
            atCap
              ? "rounded-xl border border-amber-300 bg-amber-50 p-4"
              : "rounded-xl border border-slate-200 bg-slate-50 p-4"
          }
        >
          <p className="text-sm text-slate-800">
            <strong>
              {slotsUsed} of 10 role{slotsUsed === 1 ? "" : "s"} live.
            </strong>{" "}
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
          ) : null}
        </div>
      ) : null}

      {serverError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-900">
            {serverError.message}
          </p>
          {serverError.detail ? (
            <p className="mt-1.5 font-mono text-xs text-red-700">
              {serverError.detail}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <fieldset className="space-y-5">
        <legend className="text-base font-bold text-slate-900">The role</legend>

        <Field
          label="Job title"
          htmlFor="title"
          required
          hint="How a candidate would search for it. No company name, no requisition code."
          {...fieldProps("title")}
        >
          <input
            id="title"
            className={inputClass}
            value={values.title}
            onChange={set("title")}
            maxLength={200}
            placeholder="Senior Financial Analyst"
          />
          {previewSlug && mode === "create" ? (
            <p className="mt-1 text-xs text-slate-500">
              Public link: <code className="text-slate-700">/gcc-jobs/{previewSlug}-…</code>
            </p>
          ) : null}
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
          hint="Who the candidate would be working for. If you are an agency, this is your client, not you — your own company is shown separately as the posting agency."
          {...fieldProps("company_name")}
        >
          <input
            id="company_name"
            className={inputClass}
            value={values.company_name}
            onChange={set("company_name")}
            list="known-companies"
            placeholder="Target Corporation"
          />
          <datalist id="known-companies">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-slate-500">
            Check the spelling. Company names cannot be edited afterwards —
            write to jobs@iworkatgcc.com if one needs fixing.
          </p>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Function" htmlFor="job_function" required {...fieldProps("job_function")}>
            <select id="job_function" className={inputClass} value={values.job_function} onChange={set("job_function")}>
              <option value="">Choose…</option>
              {JOB_FUNCTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>

          <Field label="Employment type" htmlFor="employment_type" required {...fieldProps("employment_type")}>
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
            {...fieldProps("city")}
          >
            <select id="city" className={inputClass} value={values.city} onChange={set("city")}>
              <option value="">Choose…</option>
              {CITY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Work mode" htmlFor="work_mode" required {...fieldProps("work_mode")}>
            <select id="work_mode" className={inputClass} value={values.work_mode} onChange={set("work_mode")}>
              <option value="">Choose…</option>
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
            {...fieldProps("experience_min")}
          >
            <input id="experience_min" type="number" inputMode="numeric" min="0" max="50" step="1"
              className={inputClass} value={values.experience_min} onChange={set("experience_min")} />
          </Field>

          <Field label="Experience to (years)" htmlFor="experience_max" required {...fieldProps("experience_max")}>
            <input id="experience_max" type="number" inputMode="numeric" min="0" max="50" step="1"
              className={inputClass} value={values.experience_max} onChange={set("experience_max")} />
          </Field>
        </div>

        <Field
          label="About the role"
          htmlFor="description"
          required
          hint="What the person will do, who they report to, what the team owns. Paste from your JD if you have one."
          {...fieldProps("description")}
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
          <p className="mt-1 text-xs text-slate-500">
            {descriptionLength < DESCRIPTION_MIN
              ? `${DESCRIPTION_MIN - descriptionLength} more characters needed`
              : `${descriptionLength.toLocaleString()} characters`}
          </p>
        </Field>

        <Field
          label="Skills"
          htmlFor="skills"
          hint="Optional. Comma separated, up to 20."
          {...fieldProps("skills")}
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
          <Field label="Salary from" htmlFor="salary_min" {...fieldProps("salary_min")}>
            <input id="salary_min" type="number" inputMode="numeric" min="0" step="1"
              className={inputClass} value={values.salary_min} onChange={set("salary_min")} placeholder="1800000" />
          </Field>

          <Field label="Salary to" htmlFor="salary_max" {...fieldProps("salary_max")}>
            <input id="salary_max" type="number" inputMode="numeric" min="0" step="1"
              className={inputClass} value={values.salary_max} onChange={set("salary_max")} placeholder="2600000" />
          </Field>

          {salaryTouched ? (
            <>
              <Field label="Currency" htmlFor="salary_currency" required {...fieldProps("salary_currency")}>
                <select id="salary_currency" className={inputClass} value={values.salary_currency} onChange={set("salary_currency")}>
                  {SALARY_CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Period" htmlFor="salary_period" required {...fieldProps("salary_period")}>
                <select id="salary_period" className={inputClass} value={values.salary_period} onChange={set("salary_period")}>
                  {SALARY_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          <Field label="Number of openings" htmlFor="openings" hint="Optional." {...fieldProps("openings")}>
            <input id="openings" type="number" inputMode="numeric" min="1" max="999" step="1"
              className={inputClass} value={values.openings} onChange={set("openings")} placeholder="1" />
          </Field>
        </div>
      </fieldset>

      {/* ---------------------------------------------------------------- */}
      <fieldset className="space-y-5 border-t border-slate-200 pt-6">
        <legend className="text-base font-bold text-slate-900">
          How candidates apply
        </legend>

        <div className="space-y-2">
          <label className="flex items-start gap-2.5 text-sm text-slate-800">
            <input type="radio" name="apply_mode" value="in_platform" className="mt-1"
              checked={values.apply_mode === "in_platform"} onChange={set("apply_mode")} />
            <span>
              <strong>On iWorkAtGCC.</strong> Candidates apply with a resume and
              you see the applications here. Recommended — it is why most people
              use the site.
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm text-slate-800">
            <input type="radio" name="apply_mode" value="external" className="mt-1"
              checked={values.apply_mode === "external"} onChange={set("apply_mode")} />
            <span>
              <strong>On your own site.</strong> Candidates are sent to a link
              you provide. You will not receive applications here, and we cannot
              tell you who applied.
            </span>
          </label>
        </div>

        {values.apply_mode === "external" ? (
          <Field label="Application link" htmlFor="external_url" required
            hint="Must start with https://" {...fieldProps("external_url")}>
            <input id="external_url" type="url" className={inputClass}
              value={values.external_url} onChange={set("external_url")}
              placeholder="https://careers.example.com/role/12345" />
          </Field>
        ) : null}
      </fieldset>

      {/* ---------------------------------------------------------------- */}
      <div className="border-t border-slate-200 pt-6">
        <p className="text-sm text-slate-600">
          {mode === "create"
            ? `The role goes live immediately and stays live for ${DAYS_LIVE} days. There is no review queue. You can close it early at any time.`
            : "Changes are live as soon as you save. The expiry date does not move when you edit."}
        </p>

        {touched && Object.keys(errors).length > 0 ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
            {Object.keys(errors).length === 1
              ? "One field needs attention — see above."
              : `${Object.keys(errors).length} fields need attention — see above.`}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting || atCap}
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting
              ? "Saving…"
              : mode === "create"
                ? "Post this role"
                : "Save changes"}
          </button>

          <Link
            to="/recruiter/jobs"
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}

export default JobForm;
