import { createClient } from "@supabase/supabase-js";
import { clearResumeFolder } from "./_lib/resumeStorage.js";

// ===========================================================================
// POST /api/my-data   ->   a candidate's own resume, read or removed
//
//   { action: "resume-url" }      a short-lived signed URL for MY resume
//   { action: "delete-resume" }   delete MY resume and nothing else
//
// WHY THEY SHARE A FILE
//   Vercel's Hobby plan allows 12 serverless functions and the project
//   reached 14. Rishi, 25 Nov 2026: "I'm not upgrading to Pro. Consolidate."
//
// *** WHAT IS DELIBERATELY NOT IN HERE ***
//
//   api/delete-my-data.js. It was in the original plan and Rishi took it
//   out: "Leave delete-my-data alone. Landing at 10 with two spare is fine…
//   One slot isn't worth touching the file that erases people's data."
//
//   Right, and worth restating for whoever reads this next: that endpoint
//   anonymises applications, deletes saved roles and removes a resume in one
//   transaction, behind a typed confirmation. It is the most consequential
//   file in the project and it stays exactly where it is. If a thirteenth
//   function is ever needed, it is NOT the slot to take.
//
//   api/upload-resume.js is also out, for a mechanical reason rather than a
//   cautious one: it declares `export const config = { api: { bodyParser:
//   false } }` and reads the raw stream. THAT CONFIG IS PER-FILE. Merging it
//   here would switch body parsing off for both actions below and force them
//   to parse raw streams themselves -- a change to working, signed-off
//   security code bought for one slot.
//
//   api/resume-url.js is out too, and this is the one worth being careful
//   about: it looks like it belongs here and does not. That endpoint is a
//   RECRUITER reading a CANDIDATE'S resume, and its design is two clients --
//   the database decides whether, the service key only decides how. The two
//   actions below are a candidate reading their OWN. Putting both
//   authorisation models in one file is how they eventually get confused for
//   each other.
//
// EACH ACTION STILL VERIFIES ITS OWN BEARER TOKEN. The handlers are spliced
// in unchanged apart from their names; the dispatcher verifies nothing. The
// identity is derived from the token inside each action, so neither can act
// on an id supplied by the caller.
//
// NEITHER ACTION HAS AN AUTOMATED TEST. stage8-candidate-test.mjs covers
// _lib/resumeStorage.js and applicationDisplay.js, not these handlers -- see
// "KNOWN GAP" in JOB-BOARD-TEST-DATA.md. This merge needs a human.
// ===========================================================================

const BUCKET = "resumes";


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

async function myResumeUrl(req, res) {
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


async function deleteMyResume(req, res) {
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


// ===========================================================================
// The dispatcher. It verifies nothing and decides nothing.
//
// An unknown action is a 400, not a default: silently signing a URL because
// a client forgot a field is the sort of thing nobody notices until it is a
// habit.
// ===========================================================================
export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  switch (body?.action) {
    case "resume-url":
      return myResumeUrl(req, res);
    case "delete-resume":
      return deleteMyResume(req, res);
    default:
      return res.status(400).json({ error: "Unknown action" });
  }
}
