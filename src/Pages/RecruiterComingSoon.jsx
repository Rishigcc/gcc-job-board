import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";

// Placeholder for /recruiter/jobs and /recruiter/jobs/new so the two buttons
// on the recruiter home are real and clickable while stage 3 is being tested.
// Both are replaced by the real screens in stage 4.
function RecruiterComingSoon({ title }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo title={`${title} — iWorkAtGCC`} description={title} path="/recruiter" noindex />

      <SiteHeader />

      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>

          <p className="mt-3 text-[15px] text-slate-600">
            This screen is built in the next step. The button works — there's
            just nothing behind it yet.
          </p>

          <Link
            to="/recruiter"
            className="mt-6 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default RecruiterComingSoon;
