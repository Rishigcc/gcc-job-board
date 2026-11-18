import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import JobForm from "../components/JobForm";
import { EMPTY_JOB } from "../lib/jobFormModel";
import { createJob, resolveCompany } from "../lib/jobMutations";
import { companySlug, countsTowardCap } from "../lib/jobOptions";
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

  const [slotsUsed, setSlotsUsed] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // The recruiter's own company is the usual answer for an in-house
  // recruiter, so the NAME is prefilled. The id is not: it is filled in below
  // only if that name already exists as a company. If it does not, the
  // recruiter has to confirm "add as a new company" like anyone else -- the
  // first role they post is exactly when a typo in their own employer's name
  // would become permanent.
  const [initialValues, setInitialValues] = useState(() => ({
    ...EMPTY_JOB,
    company_name: profile?.company_name || "",
  }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const ownSlug = companySlug(profile?.company_name || "");

    const load = async () => {
      const [{ data: ownCompany }, { data: jobRows }] = await Promise.all([
        ownSlug
          ? supabase.from("companies").select("id, name").eq("slug", ownSlug).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("jobs").select("id, status, expires_at").eq("posted_by", user.id),
      ]);

      if (!active) return;

      if (ownCompany) {
        setInitialValues((v) => ({
          ...v,
          company_id: ownCompany.id,
          company_name: ownCompany.name,
        }));
      }

      setSlotsUsed((jobRows || []).filter(countsTowardCap).length);
      setReady(true);
    };

    load();
    return () => {
      active = false;
    };
  }, [user.id, profile?.company_name]);

  const handleSubmit = useCallback(
    async (values) => {
      setSubmitting(true);
      setServerError(null);

      const company = await resolveCompany({
        companyId: values.company_id,
        name: values.company_name,
        isNew: values.company_is_new,
      });
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
          You will see a summary before anything is published. There is no review queue at our end \u2014 once you confirm, the role is live.
        </p>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {/* Held back until the prefill lookup lands. Remounting the form
              afterwards would have thrown away anything already typed. */}
          {!ready ? (
            <p className="text-slate-500">Loading…</p>
          ) : (
          <JobForm
            mode="create"
            initialValues={initialValues}
            onSubmit={handleSubmit}
            submitting={submitting}
            serverError={serverError}
            slotsUsed={slotsUsed}
            isVerified={Boolean(profile?.is_verified)}
          />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default RecruiterJobNew;
