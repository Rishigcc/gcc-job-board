import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import Filters from "./components/Filters";
import JobCard from "./components/JobCard";
import ResultsBar from "./components/ResultsBar";
import LoadingCard from "./components/LoadingCard";
import Footer from "./components/Footer";

const JOBS_PER_PAGE = 20;

function normalizeLocation(location) {
  if (!location) return "Unknown";

  const loc = location.toLowerCase();

  if (
    loc.includes("delhi") ||
    loc.includes("new delhi") ||
    loc.includes("noida") ||
    loc.includes("gurgaon") ||
    loc.includes("gurugram") ||
    loc.includes("faridabad") ||
    loc.includes("ghaziabad")
  ) {
    return "Delhi NCR";
  }

  if (loc.includes("hyderabad") || loc.includes("secunderabad"))
    return "Hyderabad";

  if (loc.includes("bengaluru") || loc.includes("bangalore"))
    return "Bengaluru";

  if (loc.includes("mumbai")) return "Mumbai";
  if (loc.includes("pune")) return "Pune";
  if (loc.includes("chennai")) return "Chennai";
  if (loc.includes("kolkata") || loc.includes("calcutta"))
    return "Kolkata";
  if (loc.includes("ahmedabad")) return "Ahmedabad";
  if (loc.includes("kochi") || loc.includes("cochin"))
    return "Kochi";

  if (loc.trim() === "india") return "Remote / India";

  return location.split(",")[0].trim();
}

function App() {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All Locations");
  const [company, setCompany] = useState("All Companies");
  const [jobFunction, setJobFunction] = useState("All Functions");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    fetch("/data/jobs.json")
      .then((res) => res.json())
      .then((data) => {
        const jobList = Array.isArray(data)
          ? data[0].jobs
          : data.jobs;

        setJobs(jobList);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, location, company, jobFunction, sortBy]);

  const locations = [
    "All Locations",
    ...new Set(
      jobs.map((job) => normalizeLocation(job.location))
    ),
  ].sort();

  const companies = [
    "All Companies",
    ...new Set(
      jobs.map((job) => job.company).filter(Boolean)
    ),
  ].sort();

  const functions = [
    "All Functions",
    ...new Set(
      jobs.map((job) => job.function).filter(Boolean)
    ),
  ].sort();

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        const text = (
          job.title +
          " " +
          job.company +
          " " +
          job.location +
          " " +
          job.summary
        ).toLowerCase();

        return (
          text.includes(search.toLowerCase()) &&
          (location === "All Locations" ||
            normalizeLocation(job.location) === location) &&
          (company === "All Companies" ||
            job.company === company) &&
          (jobFunction === "All Functions" ||
            job.function === jobFunction)
        );
      })
      .sort((a, b) => {
        const daysA = a.days_old ?? 999;
        const daysB = b.days_old ?? 999;

        return sortBy === "newest"
          ? daysA - daysB
          : daysB - daysA;
      });
  }, [
    jobs,
    search,
    location,
    company,
    jobFunction,
    sortBy,
  ]);

  const totalPages = Math.ceil(
    filteredJobs.length / JOBS_PER_PAGE
  );

  const startIndex = (currentPage - 1) * JOBS_PER_PAGE;

  const endIndex = Math.min(
    startIndex + JOBS_PER_PAGE,
    filteredJobs.length
  );

  const paginatedJobs = filteredJobs.slice(
    startIndex,
    endIndex
  );

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="max-w-6xl mx-auto px-6">

        <Header />

        <Filters
          search={search}
          setSearch={setSearch}
          location={location}
          setLocation={setLocation}
          locations={locations}
          company={company}
          setCompany={setCompany}
          companies={companies}
          jobFunction={jobFunction}
          setJobFunction={setJobFunction}
          functions={functions}
        />
<div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 px-6 py-5 text-center">

  <p className="text-slate-800 font-medium">
    📬 <strong>We update the latest GCC jobs every Tuesday.</strong>
  </p>

  <a
    href="https://www.linkedin.com/in/therishinigam/"
    target="_blank"
    rel="noreferrer"
    className="mt-2 inline-block text-blue-600 hover:underline"
  >
    Want to get instantly notified as soon as the weekly update goes live? DM me your email on LinkedIn →
  </a>

</div>
        <ResultsBar
          jobCount={filteredJobs.length}
          sortBy={sortBy}
          setSortBy={setSortBy}
          start={filteredJobs.length === 0 ? 0 : startIndex + 1}
          end={endIndex}
        />
                {loading ? (
          <LoadingCard />
        ) : (
          <div className="space-y-6">

            {paginatedJobs.length > 0 ? (
              paginatedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  normalizeLocation={normalizeLocation}
                />
              ))
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">

                <div className="text-5xl mb-4">
                  🔍
                </div>

                <h2 className="text-2xl font-bold text-slate-800">
                  No jobs found
                </h2>

                <p className="text-slate-500 mt-3">
                  We couldn't find any GCC jobs matching your search.
                </p>

                <p className="text-slate-400 mt-2">
                  Try changing your keywords or filters.
                </p>

                <button
                  onClick={() => {
                    setSearch("");
                    setLocation("All Locations");
                    setCompany("All Companies");
                    setJobFunction("All Functions");
                  }}
                  className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition"
                >
                  Clear Filters
                </button>

              </div>
            )}
                      </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-12 flex-wrap">

            <button
              onClick={() =>
                setCurrentPage((page) => Math.max(page - 1, 1))
              }
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl border bg-white disabled:opacity-40 hover:bg-slate-50"
            >
              ← Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                return (
                  page === 1 ||
                  page === totalPages ||
                  Math.abs(page - currentPage) <= 1
                );
              })
              .map((page, index, pages) => {
                const previousPage = pages[index - 1];

                return (
                  <div key={page} className="flex items-center">

                    {previousPage && page - previousPage > 1 && (
                      <span className="px-2 text-slate-500">...</span>
                    )}

                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-xl border transition ${
                        currentPage === page
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      {page}
                    </button>

                  </div>
                );
              })}

            <button
              onClick={() =>
                setCurrentPage((page) =>
                  Math.min(page + 1, totalPages)
                )
              }
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-xl border bg-white disabled:opacity-40 hover:bg-slate-50"
            >
              Next →
            </button>

          </div>
        )}
<Footer />
      </div>
    </div>
  );
}

export default App;