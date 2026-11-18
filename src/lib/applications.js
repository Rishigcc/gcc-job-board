import { supabase } from "./supabase";
export { MAX_RESUME_BYTES, validateApplication } from "./applicationModel";

// ===========================================================================
// Applying to a job.
//
// Two writes, in this order, and the order matters: the resume is uploaded
// first and the application row is written second. If the row fails, an
// orphaned file sits in the bucket costing nothing and visible to nobody.
// If it were the other way round, a failed upload would leave an application
// pointing at a resume that does not exist -- which a recruiter would see as
// a candidate who applied with no CV.
// ===========================================================================

// ---------------------------------------------------------------------------
// The upload goes through our own endpoint rather than straight to Supabase
// Storage, because the bucket has no policies and nothing but the service key
// can write to it -- and because the endpoint reads the file's first bytes
// instead of believing its name. See api/upload-resume.js.
// ---------------------------------------------------------------------------
async function uploadResume(file) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: { message: "Your session has expired. Sign in and try again." } };
  }

  let response;
  try {
    response = await fetch("/api/upload-resume", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/pdf",
      },
      body: file,
    });
  } catch {
    return { error: { message: "The upload could not reach us. Check your connection and try again." } };
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means something upstream failed; the status still tells
    // us enough to say something true.
  }

  if (!response.ok) {
    return { error: { message: payload.error || "The resume could not be uploaded." } };
  }

  return { path: payload.path };
}

export async function submitApplication({ job, values, userId }) {
  const upload = await uploadResume(values.resume);
  if (upload.error) return { error: upload.error };

  const { error } = await supabase.from("applications").insert({
    job_id: job.id,
    candidate_id: userId,
    full_name: values.full_name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim() || null,
    notice_period: values.notice_period,
    resume_path: upload.path,
    // consent_at and status are not granted columns. The server clock
    // records when consent was given; the default status is 'applied'.
  });

  if (!error) return { ok: true };

  if (error.code === "23505") {
    return { error: { message: "You have already applied to this role. Only one application per role is kept." } };
  }

  if (error.code === "42501") {
    return {
      error: {
        message:
          "This role is no longer accepting applications. It may have been " +
          "closed or filled while this page was open.",
      },
    };
  }

  if (error.code === "P0001") {
    return { error: { message: error.message } };
  }

  return {
    error: {
      message: "The application could not be sent. Please try again.",
      detail: error.message,
    },
  };
}

// Has this person already applied? One row at most, by the unique
// constraint on (job_id, candidate_id).
export async function fetchMyApplication(jobId, userId) {
  const { data } = await supabase
    .from("applications")
    .select("id, status, created_at, notice_period")
    .eq("job_id", jobId)
    .eq("candidate_id", userId)
    .maybeSingle();

  return data || null;
}
