import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/my-resume-url   ->   { url }
//
// Hands the CALLER their own resume as a short-lived signed URL, so they can
// see the file a recruiter is being given. Same shape as /api/resume-url:
// the service key signs, because the `resumes` bucket has no policies on
// storage.objects and nothing else can read it.
//
// "PASSING SOMEONE ELSE'S ID MUST NOT WORK" -- IT CANNOT, BECAUSE THERE IS
// NO ID TO PASS.
//   This endpoint takes no identity input of any kind. Not in the body, not
//   in the query string. The only thing it reads is the bearer token, which
//   it verifies with the service key, and the only row it looks up is the one
//   keyed by that verified id. A request body is ignored entirely.
//
//   That is a stronger guarantee than validating an id would be. There is no
//   parameter to tamper with, so there is no comparison to get wrong -- the
//   recruiter endpoint has to ask the database whether the caller owns an
//   application, because it is reaching for someone else's data on purpose.
//   Here the caller IS the answer.
//
//   The path is checked against the verified id anyway before signing. It was
//   pinned to `^<uid>/` by a trigger when it was written, but this function
//   can sign any object in the bucket, so it should be the thing that
//   refuses rather than trusting that history held.
//
// THE URL
//   60 seconds, never stored. Content-Disposition is built here from the
//   resume's own updated_at, so the saved file is identifiable and no part of
//   the header comes from the client.
// ===========================================================================

const SIGNED_URL_SECONDS = 60;
const BUCKET = "resumes";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("my-resume-url: missing Supabase configuration");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in again and retry." });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The one and only source of identity. Anything in req.body is ignored.
  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }

  const userId = userData.user.id;

  const { data: row, error: readError } = await admin
    .from("candidate_resumes")
    .select("resume_path, updated_at")
    .eq("candidate_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("my-resume-url: read failed", readError);
    return res.status(502).json({ error: "We could not find your resume. Try again." });
  }

  if (!row) {
    return res.status(404).json({ error: "There is no resume on file." });
  }

  if (!row.resume_path.startsWith(`${userId}/`)) {
    console.error("my-resume-url: path outside the caller's folder", userId, row.resume_path);
    return res.status(500).json({ error: "That resume could not be opened. Write to jobs@iworkatgcc.com." });
  }

  // Derived from the row, never from the request.
  const stamp = new Date(row.updated_at).toISOString().slice(0, 10);

  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.resume_path, SIGNED_URL_SECONDS, {
      download: `my-resume-${stamp}.pdf`,
    });

  if (signError || !signed?.signedUrl) {
    console.error("my-resume-url: could not sign", row.resume_path, signError);
    return res.status(502).json({ error: "That resume could not be opened. Try again." });
  }

  return res.status(200).json({ url: signed.signedUrl, expiresIn: SIGNED_URL_SECONDS });
}
