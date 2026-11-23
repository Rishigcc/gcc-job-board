import { Link } from "react-router-dom";
import SaveJobButton from "./SaveJobButton";
import { WORK_MODES, EMPLOYMENT_TYPES } from "../lib/jobOptions";
import {
  jobPath,
  formatExperience,
  formatSalary,
  formatPosted,
} from "../lib/jobDisplay";

// A card on /gcc-jobs.
//
// It does NOT name the posting agency. That is a deliberate decision, not an
// oversight: on a list, "posted by <staffing firm>" is the loudest thing on
// the card and tells a candidate nothing about the job. It is on the detail
// page, where someone has already decided they are interested.

const workModeLabel = (value) =>
  WORK_MODES.find((m) => m.value === value)?.label || value;

const employmentLabel = (value) =>
  EMPLOYMENT_TYPES.find((t) => t.value === value)?.label || value;

function Meta({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

// `save` is optional. When it is absent the card renders exactly as it did
// before stage 10 -- which is what keeps the card usable anywhere a save
// control would make no sense. Every piece of its state is owned by
// useJobSaves so that the list and the detail page cannot disagree.
function GccJobCard({ job, save }) {
  const salary = formatSalary(job);
  const experience = formatExperience(job.experience_min, job.experience_max);
  const company = job.companies?.name || "";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-snug text-slate-900">
            <Link to={jobPath(job)} className="transition hover:text-blue-700">
              {job.title}
            </Link>
          </h2>

          {company ? (
            <p className="mt-0.5 text-sm font-semibold text-slate-700">{company}</p>
          ) : null}
        </div>

        {job.companies?.logo_url ? (
          <img
            src={job.companies.logo_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-contain"
            loading="lazy"
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Meta>{job.city}</Meta>
        <Meta>{workModeLabel(job.work_mode)}</Meta>
        {experience ? <Meta>{experience}</Meta> : null}
        {job.employment_type !== "full_time" ? (
          <Meta>{employmentLabel(job.employment_type)}</Meta>
        ) : null}
        <Meta>{job.job_function}</Meta>
      </div>

      {salary ? (
        <p className="mt-3 text-sm font-semibold text-emerald-800">{salary}</p>
      ) : null}

      {job.skills?.length ? (
        <p className="mt-3 line-clamp-2 text-sm text-slate-600">
          {job.skills.slice(0, 8).join(" · ")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{formatPosted(job.published_at)}</p>

        <div className="flex items-center gap-1">
          {save ? (
            <SaveJobButton
              jobId={job.id}
              saved={save.saved}
              justSaved={save.justSaved}
              showPopup={save.showPopup}
              onToggle={save.onToggle}
              onClosePopup={save.onClosePopup}
              redirectPath={save.redirectPath}
            />
          ) : null}

          <Link
            to={jobPath(job)}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            View role
          </Link>
        </div>
      </div>
    </article>
  );
}

export default GccJobCard;
