import { createClient } from "@supabase/supabase-js";
import { clearResumeFolder } from "./_lib/resumeStorage.js";

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
// DELETION MEANS THE FOLDER IS EMPTY, NOT THAT THE NAMED FILE IS GONE.
//   Nothing here deletes by the path in candidate_resumes. It clears every
//   object under the caller's own folder, because a file can exist with no
//   row pointing at it for reasons no error handling prevents -- see
//   api/_lib/resumeStorage.js. Deleting by row name would leave exactly those
//   files behind, and the privacy policy says the resume is permanently
//   deleted.
//
//   The folder is derived from the verified user id, never from the request,
//   so there is no path to tamper with.
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

  // Read only to report what the caller will think happened. It is NOT used
  // to decide what to delete.
  const { data: row, error: readError } = await admin
    .from("candidate_resumes")
    .select("resume_path")
    .eq("candidate_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("delete-my-resume: read failed", readError);
    return res.status(502).json({ error: "We could not read your resume record. Try again." });
  }

  // Files first, every file, then the row. A failed removal changes nothing
  // and can be retried; the other order would make "permanently deleted"
  // untrue with nothing left to notice it.
  const cleared = await clearResumeFolder(admin, BUCKET, userId);

  if (cleared.error) {
    console.error("delete-my-resume: folder clear failed", userId, cleared.error);
    return res.status(502).json({ error: "Your resume file could not be deleted. Nothing was changed — please try again." });
  }

  if (cleared.removed.length > 1) {
    // Expected to be rare and worth seeing when it happens: the extras were
    // orphans that deleting by row name would have left behind.
    console.log(`delete-my-resume: removed ${cleared.removed.length} objects for ${userId}`);
  }

  if (!row && cleared.removed.length === 0) {
    // The end state the caller asked for is the state they are already in.
    return res.status(200).json({ deleted: false, filesRemoved: 0 });
  }

  if (row) {
    const { error: rowError } = await admin.rpc("delete_resume_for", { p_user: userId });

    if (rowError) {
      // The files are gone and the row is not. The next upload replaces the
      // row anyway, and the recruiter page already renders a missing object
      // as unavailable. Logged loudly because it needs clearing up by hand,
      // but the thing the caller asked to be destroyed is destroyed.
      console.error("delete-my-resume: row delete failed AFTER file removal", userId, rowError);
      return res.status(502).json({ error: "Your resume file was deleted but your record was not fully cleared. Write to jobs@iworkatgcc.com." });
    }
  }

  return res.status(200).json({
    deleted: true,
    filesRemoved: cleared.removed.length,
  });
}
