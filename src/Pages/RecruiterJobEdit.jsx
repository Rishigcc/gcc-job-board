import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import JobForm from "../components/JobForm";
import { resolveCompany, updateJob } from "../lib/jobMutations";
import { jobDisplayStatus } from "../lib/jobOptions";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";

// ===========================================================================
// /recruiter/jobs/:id/edit
//
// Two things deliberately cannot be changed here, both enforced by the column
// grants in migration 001 rather than by this page:
//
//   slug        a link a candidate saved must keep working, so the public URL
//               is frozen at posting time even if the title changes
//   expires_at  otherwise editing a job would extend it indefinitely
//
// A job an admin has hidden cannot be loaded for editing at all: the update
// policy excludes 'hidden' on both sides.
// ===========================================================================

const SELECT =
  "id, title, city, work_mode, job_function, employment_type, experience_min, " +
  "experience_max, description, apply_mode, external_url, salary_min, " +
  "salary_max, salary_currency, salary_period, openings, skills, status, " +
  "expires_at, company_id, companies(name)";

// A job row as the database holds it -> the strings the form edits.
function toFormValues(job) {
  return {
    title: job.title || "",
    company_name: job.companies?.name || "",
    // Already resolved: the role is attached to a real company row, so the
    // picker opens in its confirmed state and nothing is created unless the
    // recruiter deliberately changes it.
    company_id: job.company_id || "",
    company_is_new: false,
    city: job.city || "",
    work_mode: job.work_mode || "",
    job_function: job.job_function || "",
    employment_type: job.employment_type || "full_time",
    experience_min: job.experience_min === null ? "" : String(job.experience_min),
    experience_max: job.experience_max === null ? "" : String(job.experience_max),
    description: job.description || "",
    apply_mode: job.apply_mode || "in_platform",
    external_url: job.external_url || "",
    salary_min: job.salary_min === null ? "" : String(job.salary_min),
    salary_max: job.salary_max === null ? "" : String(job.salary_max),
    salary_currency: job.salary_currency || "INR",
    salary_period: job.salary_period || "year",
    openings: job.openings === null ? "" : String(job.openings),
    skills: (job.skills || []).join(", "),
  };
}

function RecruiterJobEdit() {
  const { profile, user } = useRecruiter();
  const { id } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [values, setValues] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const { data: row, error } = await supabase
        .from("jobs")
        .select(SELECT)
        .eq("id", id)
        .eq("posted_by", user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setLoadState("error");
        setServerError({ message: "This role could not be loaded.", detail: error.message });
        return;
      }
      if (!row) {
        setLoadState("missing");
        return;
      }
      if (row.status === "hidden") {
        setJob(row);
        setLoadState("hidden");
        return;
      }

      setJob(row);
      setValues(toFormValues(row));
      setLoadState("ready");
    };

    run();
    return () => {
      active = false;
    };
  }, [id, user.id]);

  const handleSubmit = useCallback(
    async (submitted) => {
      setSubmitting(true);
      setServerError(null);

      // Only touch companies if the name actually changed, so a plain
      // description edit never creates a company row.
      let companyId = job.company_id;
      const companyChanged = submitted.company_id !== job.company_id;

      if (companyChanged) {
        const company = await resolveCompany({
          companyId: submitted.company_id,
          name: submitted.company_name,
          isNew: submitted.company_is_new,
        });
        if (company.error) {
          setServerError(company.error);
          setSubmitting(false);
          return;
        }
        companyId = company.companyId;
      }

      const { error } = await updateJob({ jobId: job.id, values: submitted, companyId });

      if (error) {
        setServerError(error);
        setSubmitting(false);
        return;
      }

      navigate("/recruiter/jobs?saved=1", { replace: true });
    },
    [job, navigate]
  );

  const shell = (children) => (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo title="Edit role — iWorkAtGCC" description="Edit a role you posted." path="/recruiter/jobs" noindex />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/recruiter/jobs" className="text-sm font-semibold text-blue-700 hover:underline">
          ← My jobs
        </Link>
        {children}
      </main>
      <Footer />
    </div>
  );

  if (loadState === "loading") {
    return shell(<p className="mt-8 text-slate-500">Loading…</p>);
  }

  if (loadState === "missing") {
    return shell(
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-7">
        <h1 className="text-xl font-bold text-slate-900">Role not found</h1>
        <p className="mt-2 text-slate-600">
          Either this role does not exist, or it was posted by a different
          account. You can only edit roles posted by this account.
        </p>
      </div>
    );
  }

  if (loadState === "hidden") {
    return shell(
      <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-7">
        <h1 className="text-xl font-bold text-red-900">This role is hidden</h1>
        <p className="mt-2 text-red-800">
          It was hidden by iWorkAtGCC and cannot be edited or reopened. Write to
          jobs@iworkatgcc.com if you think that is a mistake.
        </p>
      </div>
    );
  }

  if (loadState === "error") {
    return shell(
      <div role="alert" className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-7">
        <h1 className="text-xl font-bold text-red-900">{serverError?.message}</h1>
        {serverError?.detail ? (
          <p className="mt-2 font-mono text-xs text-red-700">{serverError.detail}</p>
        ) : null}
      </div>
    );
  }

  const display = jobDisplayStatus(job);

  return shell(
    <>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Edit role
      </h1>
      <p className="mt-2 text-slate-600">
        Currently <strong>{display.label.toLowerCase()}</strong>. Changes are
        live as soon as you save.
      </p>

      <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <JobForm
          mode="edit"
          initialValues={values}
          onSubmit={handleSubmit}
          submitting={submitting}
          serverError={serverError}
          slotsUsed={null}
          isVerified={Boolean(profile?.is_verified)}
        />
      </div>
    </>
  );
}

export default RecruiterJobEdit;
