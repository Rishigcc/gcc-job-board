import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/delete-my-resume   ->   { deleted: true, path }
//
// Deletes the caller's own resume: the file from the private bucket, and the
// row from public.candidate_resumes. Nothing else. Applications already sent
// keep their row and simply stop having a resume attached, which is what the
// recruiter card already renders as "No resume on file".
//
// WHY A SERVER FUNCTION AT ALL
//   The `resumes` bucket has no policies on storage.objects, so only the
//   service key can delete the object. And the database half
//   (public.delete_resume_for) is granted to service_role ONLY, so there is
//   no way to do one without the other from a browser -- which is the point.
//   A row claiming the resume is gone while the file remains is the one
//   outcome the privacy policy forbids.
//
// ORDER: FILE, THEN ROW.
//   A failed file delete changes nothing and can be retried. The other order
//   makes "permanently deleted" untrue with nothing left to notice it.
//
// THE PATH IS NOT ACCEPTED FROM THE CLIENT.
//   It is read from the caller's own row, and then checked against the
//   verified user id before anything is deleted. Even though that path was
//   pinned to `^<uid>/` by a trigger when it was written, it is checked
//   again here: this function can delete any object in the bucket, so it
//   should be the thing that refuses rather than trusting history.
// ===========================================================================

const BUCKET = "resumes";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("delete-my-resume: missing Supabase configuration");
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

  const { data: userData, error: userError } = await admin.auth.getUser(token);

  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }

  const userId = userData.user.id;

  const { data: row, error: readError } = await admin
    .from("candidate_resumes")
    .select("resume_path")
    .eq("candidate_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("delete-my-resume: read failed", readError);
    return res.status(502).json({ error: "We could not read your resume record. Try again." });
  }

  if (!row) {
    // Nothing to do, and saying so is not an error: the end state the caller
    // asked for is the state they are already in.
    return res.status(200).json({ deleted: false, path: null });
  }

  if (!row.resume_path.startsWith(`${userId}/`)) {
    console.error("delete-my-resume: path outside the caller's folder", userId, row.resume_path);
    return res.status(500).json({ error: "That resume could not be deleted. Write to jobs@iworkatgcc.com." });
  }

  const { error: removeError } = await admin.storage.from(BUCKET).remove([row.resume_path]);

  if (removeError) {
    // Nothing has changed. The row still points at a file that still exists,
    // so a retry is clean.
    console.error("delete-my-resume: storage remove failed", row.resume_path, removeError);
    return res.status(502).json({ error: "Your resume file could not be deleted. Nothing was changed — please try again." });
  }

  const { error: rowError } = await admin.rpc("delete_resume_for", { p_user: userId });

  if (rowError) {
    // The file is gone and the row is not. The next upload replaces the row
    // anyway, and /api/resume-url returns a path whose object no longer
    // exists, which the recruiter page already shows as unavailable. Logged
    // loudly because it needs cleaning up, but the file -- the thing the
    // caller asked to be destroyed -- is destroyed.
    console.error("delete-my-resume: row delete failed AFTER file removal", userId, rowError);
    return res.status(502).json({ error: "Your resume file was deleted but your record was not fully cleared. Write to jobs@iworkatgcc.com." });
  }

  return res.status(200).json({ deleted: true, path: row.resume_path });
}
