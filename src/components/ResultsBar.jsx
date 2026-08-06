function ResultsBar({
  jobCount,
  sortBy,
  setSortBy,
  start,
  end,
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">

      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Showing {start}–{end} of {jobCount} Jobs
        </h2>

        <p className="text-gray-500 mt-1">
          Browse the latest opportunities
        </p>
      </div>

      <div className="mt-4 md:mt-0 flex items-center gap-3">

        <span className="text-sm text-gray-500">
          Sort by
        </span>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:border-blue-400 transition"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>

      </div>

    </div>
  );
}

export default ResultsBar;