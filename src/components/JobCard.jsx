import { useState } from "react";

function Badge({ children }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
      {children}
    </span>
  );
}

function JobCard({ job, normalizeLocation }) {
  const isNew = (job.days_old ?? 999) <= 3;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 md:p-8">

      {/* ===========================
          DESKTOP LAYOUT
      =========================== */}

      <div className="hidden md:flex justify-between gap-6">

        <div className="flex-1">

          <div className="flex items-center gap-3 flex-wrap">

            <h2 className="text-2xl font-semibold text-slate-900">
              {job.title}
            </h2>

            {isNew && (
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                NEW
              </span>
            )}

          </div>

          <p className="mt-2 text-lg font-medium text-blue-600">
            {job.company}
          </p>

          <div className="flex flex-wrap gap-2 mt-5">

            <Badge>📍 {normalizeLocation(job.location)}</Badge>

            {job.function && (
              <Badge>💼 {job.function}</Badge>
            )}

            {job.schedule_type && (
              <Badge>🕒 {job.schedule_type}</Badge>
            )}

            {job.posted_at && (
              <Badge>📅 {job.posted_at}</Badge>
            )}

          </div>

        </div>

        <a
          href={job.apply_link}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 self-start px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
        >
          Apply →
        </a>

      </div>

      <div className="hidden md:block mt-6 border-t border-gray-100 pt-6">

        <p
          className="text-gray-700 leading-7"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {job.summary}
        </p>

      </div>

      {/* ===========================
          MOBILE LAYOUT
      =========================== */}

      <div className="md:hidden">

        <div className="flex items-center gap-3 flex-wrap">

          <h2 className="text-2xl font-semibold text-slate-900">
            {job.title}
          </h2>

          {isNew && (
            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
              NEW
            </span>
          )}

        </div>

        <p className="mt-2 text-lg font-medium text-blue-600">
          {job.company}
        </p>

        <div className="flex flex-wrap gap-2 mt-5">

          <Badge>📍 {normalizeLocation(job.location)}</Badge>

          {job.function && (
            <Badge>💼 {job.function}</Badge>
          )}

          {job.schedule_type && (
            <Badge>🕒 {job.schedule_type}</Badge>
          )}

          {job.posted_at && (
            <Badge>📅 {job.posted_at}</Badge>
          )}

        </div>

        <div className="mt-6 border-t border-gray-100 pt-6">
                  <p
            className="text-gray-700 leading-7"
            style={
              expanded
                ? {}
                : {
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }
            }
          >
            {job.summary}
          </p>

          {job.summary && job.summary.length > 20 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 text-blue-600 font-medium hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}

        </div>

        <a
          href={job.apply_link}
          target="_blank"
          rel="noreferrer"
          className="mt-6 w-full flex justify-center px-5 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
        >
          Apply →
        </a>

      </div>

    </div>
  );
}

export default JobCard;