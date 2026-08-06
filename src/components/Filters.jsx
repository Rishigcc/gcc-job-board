function Filters({
  search,
  setSearch,
  location,
  setLocation,
  locations,
  company,
  setCompany,
  companies,
  jobFunction,
  setJobFunction,
  functions,
}) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 mb-10">

      <input
        type="text"
        placeholder="Search jobs, companies or locations..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-6 py-4 text-lg rounded-2xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Location
          </label>

          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-5 py-3 rounded-xl border border-gray-300 bg-white hover:border-blue-400 transition"
          >
            {locations.map((loc) => (
              <option key={loc}>{loc}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Company
          </label>

          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full px-5 py-3 rounded-xl border border-gray-300 bg-white hover:border-blue-400 transition"
          >
            {companies.map((comp) => (
              <option key={comp}>{comp}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Function
          </label>

          <select
            value={jobFunction}
            onChange={(e) => setJobFunction(e.target.value)}
            className="w-full px-5 py-3 rounded-xl border border-gray-300 bg-white hover:border-blue-400 transition"
          >
            {functions.map((func) => (
              <option key={func}>{func}</option>
            ))}
          </select>
        </div>

      </div>

    </div>
  );
}

export default Filters;