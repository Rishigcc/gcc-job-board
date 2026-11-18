import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import JobForm from "../components/JobForm";
import { EMPTY_JOB } from "../lib/jobFormModel";
import { createJob, resolveCompanyId } from "../lib/jobMutations";
import { countsTowardCap } from "../lib/jobOptions";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/jobs/new
//
// Posting is immediate: no review queue, no notification, live on save. The
// only gate is the 10-live-roles cap for an unverified company, which is
// enforced by the insert policy in the database and explained by the trigger
// from migration 004.
// ===========================================================================

function RecruiterJobNew() {
  const { profile, user } = useRecruiter();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [slotsUsed, setSlotsUsed] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // The recruiter's own company is the usual answer for an in-house recruiter,
  // so it is prefilled. An agency recruiter overwrites it with their client.
  const [initialValues] = useState(() => ({
    ...EMPTY_JOB,
    company_name: profile?.company_name || "",
  }));

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [{ data: companyRows }, { data: jobRows }] = await Promise.all([
        supabase.from("companies").select("id, name").order("name").limit(500),
        supabase.from("jobs").select("id, status, expires_at").eq("posted_by", user.id),
      ]);

      if (!active) return;
      setCompanies(companyRows || []);
      setSlotsUsed((jobRows || []).filter(countsTowardCap).length);
    };

    load();
    return () => {
      active = false;
    };
  }, [user.id]);

  const handleSubmit = useCallback(
    async (values) => {
      setSubmitting(true);
      setServerError(null);

      const company = await resolveCompanyId(values.company_name);
      if (company.error) {
        setServerError(company.error);
        setSubmitting(false);
        return;
      }

      const { job, error } = await createJob({
        values,
        companyId: company.companyId,
        userId: user.id,
      });

      if (error) {
        setServerError(error);
        setSubmitting(false);
        return;
      }

      navigate(`/recruiter/jobs?posted=${job.id}`, { replace: true });
    },
    [navigate, user.id]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Post a role — iWorkAtGCC"
        description="Post a role to professionals working at India's Global Capability Centres."
        path="/recruiter/jobs/new"
        noindex
      />
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/recruiter/jobs" className="text-sm font-semibold text-blue-700 hover:underline">
          ← My jobs
        </Link>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Post a role
        </h1>
        <p className="mt-2 text-slate-600">
          It goes live as soon as you save. Nothing is reviewed first.
        </p>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <JobForm
            mode="create"
            initialValues={initialValues}
            companies={companies}
            onSubmit={handleSubmit}
            submitting={submitting}
            serverError={serverError}
            slotsUsed={slotsUsed}
            isVerified={Boolean(profile?.is_verified)}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default RecruiterJobNew;
