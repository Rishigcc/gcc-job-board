import { useEffect, useState } from "react";
import Header from "./components/Header";
import Filters from "./components/Filters";
import JobCard from "./components/JobCard";
import ResultsBar from "./components/ResultsBar";

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
  if (loc.includes("kolkata") || loc.includes("calcutta")) return "Kolkata";
  if (loc.includes("ahmedabad")) return "Ahmedabad";
  if (loc.includes("kochi") || loc.includes("cochin")) return "Kochi";

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

  useEffect(() => {
    fetch("/data/jobs.json")
      .then((res) => res.json())
      .then((data) => {
        const jobList = Array.isArray(data) ? data[0].jobs : data.jobs;
        setJobs(jobList);
      })
      .catch(console.error);
  }, []);

  const locations = [
    "All Locations",
    ...new Set(jobs.map((job) => normalizeLocation(job.location))),
  ].sort();

  const companies = [
    "All Companies",
    ...new Set(jobs.map((job) => job.company).filter(Boolean)),
  ].sort();

  const functions = [
    "All Functions",
    ...new Set(jobs.map((job) => job.function).filter(Boolean)),
  ].sort();

  const filteredJobs = jobs
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
        (company === "All Companies" || job.company === company) &&
        (jobFunction === "All Functions" ||
          job.function === jobFunction)
      );
    })
    .sort((a, b) => {
      const daysA = a.days_old ?? 999;
      const daysB = b.days_old ?? 999;

      if (sortBy === "newest") {
        return daysA - daysB;
      }

      return daysB - daysA;
    });

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

        <ResultsBar
          jobCount={filteredJobs.length}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />

        <div className="space-y-6">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              normalizeLocation={normalizeLocation}
            />
          ))}
        </div>

      </div>
    </div>
  );
}

export default App;