import { createClient } from "@supabase/supabase-js";
import { clearResumeFolder } from "./_lib/resumeStorage.js";
import { confirmed, CONFIRM_DELETE_MY_DATA } from "../src/lib/confirmations.js";

// ===========================================================================
// POST /api/delete-my-data   ->   { applications_anonymised, resume_deleted }
//
// Delete my job board data. JOB BOARD ONLY: it does not touch
// public.profiles, questions, answers, hearts, SAVED QUESTIONS, or the auth
// account. That is the decided scope, it is what the privacy policy says, and
// it is printed on the button the caller pressed.
//
// SAVED ROLES ARE IN SCOPE, AND THIS COMMENT USED TO SAY THEY WERE NOT.
//   It said "saves", which covered both kinds, and that was the behaviour
//   until 23 Nov 2026. Rishi's decision that day: "The button's name is a
//   promise, and a saved role is plainly job board data. It also reveals
//   something an application doesn't: which employers someone was interested
//   in but never approached."
//
//   That second sentence is the reason it is not merely tidiness. An
//   application tells an employer something they already know. A saved role
//   says "interested, and did not approach" -- which nobody knows, and which
//   is exactly what a delete-my-data button exists for.
//
//   Saved QUESTIONS stay untouched, and that is not an inconsistency: they
//   are community data, like a liked post, and this button says job board.
//
// WHAT IT ACTUALLY DOES, AND WHY "ERASED" IS THE RIGHT WORD
//   The policy says the name, email, phone, notice period and the reference
//   linking the application to the account are "erased from our database --
//   not hidden, erased". So this nulls the columns. It does not rely on the
//   read functions to hide them, which is what stage 7 does for an
//   unverified recruiter -- correct there, where the data must still exist;
//   wrong here, where the promise is that it does not.
//
//   candidate_id goes too, which is what makes "neither we nor the recruiter
//   can connect that application back to you" literally true. Two
//   consequences, both stated before the button: the caller loses sight of
//   the application as well, and they may apply to that role again.
//
// THE TYPED CONFIRMATION IS CHECKED HERE, NOT ONLY IN THE FORM
//   A confirmation only the browser verifies is decoration.
//
// ORDER: FILES, THEN DATABASE. A failed removal changes nothing.
//
// AND IT IS EVERY FILE UNDER THE FOLDER, NOT THE ONE NAMED IN THE ROW.
//   A file can exist with no row pointing at it for reasons no error handling
//   prevents -- see api/_lib/resumeStorage.js. Deleting by row name would
//   leave exactly those behind, while the policy says the resume is
//   permanently deleted. The folder comes from the verified user id, so there
//   is nothing in the request that could redirect it.
// ===========================================================================

const BUCKET = "resumes";
const CONFIRMATION = CONFIRM_DELETE_MY_DATA;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("delete-my-data: missing Supabase configuration");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in again and retry." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  if (!confirmed(body?.confirmation, CONFIRMATION)) {
    return res.status(400).json({
      error: `Type ${CONFIRMATION} exactly to confirm. Nothing has been deleted.`,
    });
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
  const { data: resumeRow, error: readError } = await admin
    .from("candidate_resumes")
    .select("resume_path")
    .eq("candidate_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("delete-my-data: read failed", readError);
    return res.status(502).json({ error: "We could not read your records. Nothing was changed — please try again." });
  }

  const cleared = await clearResumeFolder(admin, BUCKET, userId);

  if (cleared.error) {
    console.error("delete-my-data: folder clear failed", userId, cleared.error);
    return res.status(502).json({ error: "Your resume file could not be deleted. Nothing was changed — please try again." });
  }

  if (cleared.removed.length > 1) {
    console.log(`delete-my-data: removed ${cleared.removed.length} objects for ${userId}`);
  }

  // ONE RPC, NOT TWO. Anonymising the applications and deleting the saved
  // roles happen inside the same function so that they happen in the same
  // transaction -- see migration 021. Two calls could half-succeed, and then
  // this endpoint would have to describe a half-finished deletion to someone
  // who had just typed DELETE MY DATA.
  const { data: result, error: rpcError } = await admin.rpc("anonymise_job_data_for", {
    p_user: userId,
  });

  if (rpcError) {
    console.error("delete-my-data: anonymise failed AFTER file removal", userId, rpcError);
    return res.status(502).json({
      error:
        "Your resume file was deleted but your applications were not fully anonymised. " +
        "Write to jobs@iworkatgcc.com and we will finish it by hand.",
    });
  }

  // A set-returning function comes back as an array of one row.
  const row = Array.isArray(result) ? result[0] : result;

  console.log(
    `delete-my-data: user ${userId} anonymised ${row?.applications_anonymised ?? 0} application(s)` +
      `, removed ${row?.saved_roles_removed ?? 0} saved role(s)` +
      `, removed ${cleared.removed.length} storage object(s)`
  );

  return res.status(200).json({
    applications_anonymised: row?.applications_anonymised ?? 0,
    // True if anything was actually destroyed, which includes an orphan with
    // no row -- the case deleting by row name would have missed.
    resume_deleted: Boolean(resumeRow?.resume_path) || cleared.removed.length > 0,
    files_removed: cleared.removed.length,
    // ?? 0 rather than a bare read: the migration can be applied before or
    // after this deploy, and an older function simply does not return the
    // column. Reporting 0 is then true -- nothing was removed, because
    // nothing could be.
    saved_roles_removed: row?.saved_roles_removed ?? 0,
  });
}
