import { supabase } from "./supabase";

// ===========================================================================
// The candidate's own side: what they applied to, and the two destructive
// actions on their own data.
//
// WHY THE DESTRUCTIVE ONES GO THROUGH OUR OWN ENDPOINTS AND NOT AN RPC
//   Deleting a resume is two things that must both happen: a database row
//   goes, and a file in a private bucket goes. Only the service key can
//   delete the file -- the `resumes` bucket has no policies on
//   storage.objects at all.
//
//   So the database halves, delete_resume_for() and anonymise_job_data_for(),
//   are granted to service_role ONLY and take a user id. There is no
//   client-callable path to either. If there were, a hand-written RPC call
//   from the console would anonymise the row and leave the file behind, and
//   the privacy policy's "permanently deleted" would be quietly false.
//
//   The endpoints verify the bearer token with the service key and pass the
//   verified id, which is the same shape /api/upload-resume already uses.
//
// ORDER OF OPERATIONS: FILE FIRST, THEN THE DATABASE.
//   A failed file delete then changes nothing and can be retried. The other
//   way round leaves a row saying the resume is gone while the file is still
//   sitting in storage, which is the one outcome the policy forbids.
// ===========================================================================

async function postAsUser(path, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: { message: "Your session has expired. Sign in and try again." } };
  }

  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });
  } catch {
    return { error: { message: "We could not reach the server. Check your connection and try again." } };
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The status still says something true even with no body.
  }

  if (!response.ok) {
    return { error: { message: payload.error || "That did not work. Please try again." } };
  }

  return { data: payload };
}

// ---------------------------------------------------------------------------
// The list. A definer function rather than a direct read, because an
// application to a role that has since closed or expired must still be
// visible and private.job_is_public() hides exactly those.
// ---------------------------------------------------------------------------
export async function fetchMyApplications() {
  const { data, error } = await supabase.rpc("my_applications");

  if (error) {
    return {
      error: {
        message: "Your applications could not be loaded.",
        detail: error.message,
      },
    };
  }

  return { rows: data || [] };
}

export async function deleteMyResume() {
  // One function, two actions -- api/my-data.js.
  return postAsUser("/api/my-data", { action: "delete-resume" });
}

// `confirmation` is checked on the server as well as in the form. A typed
// confirmation that only the browser verifies is decoration.
export async function deleteMyJobData(confirmation) {
  return postAsUser("/api/delete-my-data", { confirmation });
}

// ---------------------------------------------------------------------------
// The candidate's own resume, as a short-lived signed URL.
//
// Sends NO identity of any kind -- not a user id, not an empty object with a
// field the server might read. The endpoint derives the caller from the
// bearer token, so there is no parameter to tamper with and no comparison on
// the server that could be got wrong.
// ---------------------------------------------------------------------------
export async function fetchMyResumeUrl() {
  const result = await postAsUser("/api/my-data", { action: "resume-url" });

  if (result.error) return result;
  return { url: result.data?.url };
}
