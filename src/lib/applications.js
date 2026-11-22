import { supabase } from "./supabase";
export { MAX_RESUME_BYTES, validateApplication } from "./applicationModel";

// ===========================================================================
// Applying to a job.
//
// THE RESUME IS NOT PART OF THE APPLICATION ROW (migration 008)
//   It lives on the candidate, one per person, in public.candidate_resumes.
//   Applying to a sixth role does not mean finding the file a sixth time.
//   The cost of that is that a recruiter always sees the current document
//   rather than the one that was sent -- which is why the date it was last
//   updated travels with it and is shown beside the recruiter's download.
//
// WHEN A FILE IS SENT, IT IS SENT FIRST
//   The upload is a separate request to our own endpoint, and it completes
//   before the application row is written. If the row then fails, an orphan
//   sits in a private bucket costing nothing. The other order would leave an
//   application by someone with no resume at all -- which the database now
//   refuses outright, so it would simply be a worse error.
// ===========================================================================

// ---------------------------------------------------------------------------
// The upload goes through our own endpoint rather than straight to Supabase
// Storage, because the bucket has no policies and nothing but the service key
// can write to it -- and because the endpoint reads the file's first bytes
// instead of believing its name. See api/upload-resume.js.
// ---------------------------------------------------------------------------
export async function uploadResume(file) {
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

  return { path: payload.path, updatedAt: payload.updated_at };
}

// The resume on file, if there is one. Readable only by its owner: the
// select policy on candidate_resumes is candidate_id = auth.uid(), and there
// is no policy for anyone else except an admin.
export async function fetchMyResume(userId) {
  const { data } = await supabase
    .from("candidate_resumes")
    .select("resume_path, updated_at")
    .eq("candidate_id", userId)
    .maybeSingle();

  return data || null;
}

export async function submitApplication({ job, values, userId, hasResumeOnFile }) {
  // A file is only sent when one was chosen -- either because nothing is on
  // file yet, or because this is a deliberate replacement. Uploading replaces
  // the resume everywhere, which the form says before the button is pressed.
  if (values.resume) {
    const upload = await uploadResume(values.resume);
    if (upload.error) return { error: upload.error };
  } else if (!hasResumeOnFile) {
    return { error: { message: "Attach your resume as a PDF before sending this." } };
  }

  const { error } = await supabase.from("applications").insert({
    job_id: job.id,
    candidate_id: userId,
    full_name: values.full_name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim() || null,
    notice_period: values.notice_period,
    // No resume_path: the column is gone. consent_at and status are not
    // granted columns either -- the server clock records when consent was
    // given, and the default status is 'applied'.
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
