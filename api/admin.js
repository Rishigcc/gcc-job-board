import { clearResumeFolder } from "./_lib/resumeStorage.js";
import { notFound, requireAdmin, serviceClient } from "./_lib/adminGuard.js";
import {
  confirmed,
  CONFIRM_ANONYMISE,
  CONFIRM_ORPHAN_DELETE,
} from "../src/lib/confirmations.js";

// ===========================================================================
// POST /api/admin   ->   the two destructive admin actions
//
//   { action: "anonymise", ... }      anonymise one application by hand
//   { action: "delete-orphan", ... }  delete one orphaned resume object
//
// WHY THEY SHARE A FILE
//   Vercel's Hobby plan allows 12 serverless functions and the project
//   reached 14. Rishi, 25 Nov 2026: "I'm not upgrading to Pro. Consolidate."
//
// *** EACH ACTION STILL GUARDS ITSELF, AND THAT IS THE WHOLE DESIGN ***
//
//   The two handlers are spliced in UNCHANGED apart from their names. Each
//   one still does, in this order and for itself:
//
//     1. refuse anything but POST            (as notFound(), never a 405 --
//                                             the endpoint does not admit to
//                                             existing)
//     2. build its own service client
//     3. await requireAdmin(req, admin)
//     4. check its OWN typed confirmation
//     5. only then touch anything
//
//   The dispatcher below does none of that. It reads `action` and calls one
//   of them. Nothing is guarded once and assumed for both, which is the
//   failure this merge was most likely to introduce: a guard hoisted above
//   the branch, and then one action quietly running without it.
//
//   THE TWO CONFIRMATIONS ARE DIFFERENT STRINGS and are now in the same
//   file, so they are deliberately bound to separate constants --
//   ANONYMISE_CONFIRMATION and ORPHAN_CONFIRMATION -- rather than both being
//   called CONFIRMATION as they were when they lived apart. Crossing them
//   would mean the wrong sentence unlocking the wrong deletion.
//
// NEITHER ACTION HAS AN AUTOMATED TEST. stage9-admin-test.mjs covers the
// confirmation STRINGS in src/lib/confirmations.js and nothing about the
// handlers that read them -- see "KNOWN GAP" in JOB-BOARD-TEST-DATA.md.
// This merge needs a human in a browser, and Rishi knows it.
// ===========================================================================

const BUCKET = "resumes";


// ===========================================================================
// POST /api/admin-anonymise   ->   { applications_anonymised }
//
// Does for a candidate what they could do themselves on /profile/delete-data,
// because the privacy policy also offers it by email: "You can also email
// jobs@iworkatgcc.com and we will do it for you."
//
// FINAL. There is no inverse, by design -- the columns are erased, not
// hidden. So a typed confirmation is required and it is checked here, not only
// in the form.
//
// SAME ORDER AS STAGE 8: files first, then the database. A failed removal
// changes nothing and can be retried. And it clears the whole folder rather
// than the path named in the row -- invariant I2, for the reasons in
// api/_lib/resumeStorage.js.
// ===========================================================================

const ANONYMISE_CONFIRMATION = CONFIRM_ANONYMISE;

async function anonymiseApplication(req, res) {
  // A 405 with an Allow header is itself a disclosure: a path that does not
  // exist answers 404 to a GET, so this one must too. The other endpoints in
  // this project are not hidden and keep their 405 -- only the admin pair
  // pretends not to be there.
  if (req.method !== "POST") {
    const miss = notFound();
    return res.status(miss.status).json({ error: miss.error });
  }

  const admin = serviceClient();

  // Even a misconfigured server says nothing. A 500 here would confirm the
  // route to anyone who asked.
  if (!admin) {
    console.error("admin-anonymise: missing Supabase configuration");
    const miss = notFound();
    return res.status(miss.status).json({ error: miss.error });
  }

  const gate = await requireAdmin(req, admin);
  if (gate.error) return res.status(gate.status).json({ error: gate.error });

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  if (!confirmed(body?.confirmation, ANONYMISE_CONFIRMATION)) {
    return res.status(400).json({
      error: `Type ${ANONYMISE_CONFIRMATION} exactly to confirm. Nothing has been changed.`,
    });
  }

  const candidateId = (body?.candidateId || "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) {
    return res.status(400).json({ error: "No candidate was named." });
  }

  const cleared = await clearResumeFolder(admin, BUCKET, candidateId);

  if (cleared.error) {
    console.error("admin-anonymise: folder clear failed", candidateId, cleared.error);
    return res.status(502).json({
      error: "Their resume file could not be deleted. Nothing was changed — please try again.",
    });
  }

  const { data, error } = await admin.rpc("admin_anonymise_candidate_for", {
    p_actor: gate.userId,
    p_user: candidateId,
  });

  if (error) {
    console.error("admin-anonymise: rpc failed AFTER file removal", candidateId, error);
    return res.status(502).json({
      error:
        "The resume file was deleted but the applications were not anonymised. " +
        "Run it again — the file deletion is already done and repeating it is harmless.",
    });
  }

  console.log(
    `admin-anonymise: ${gate.userId} anonymised ${data ?? 0} application(s) for ${candidateId}, removed ${cleared.removed.length} file(s)`
  );

  return res.status(200).json({
    applications_anonymised: data ?? 0,
    files_removed: cleared.removed.length,
  });
}



// ===========================================================================
// POST /api/admin-delete-orphan   ->   { deleted: true }
//
// Deletes one orphaned resume file: an object in the private bucket that no
// candidate_resumes row points at. Stage 8 made deletion reliable for anyone
// who asks; this is for the files belonging to people who never ask.
//
// FINAL, so a typed confirmation is required and checked here.
//
// THE PATH COMES FROM THE CLIENT, SO THE DATABASE IS ASKED ABOUT IT.
//   This is the one admin action where the target is a string rather than a
//   row id, and the service key can delete any object in the bucket. So the
//   path is not taken on trust: public.is_orphaned_resume() must agree that
//   the object exists and that no candidate_resumes row points at it. A live
//   candidate's resume can therefore never be deleted here, however the
//   request is built.
//
//   This originally called admin_orphaned_resumes() and fetched the whole
//   report, which was broken in two ways nobody had reached yet: that
//   function is granted to `authenticated` only, so the service key could not
//   execute it, and its WHERE clause contains private.is_admin(), which is
//   false when auth.uid() is null -- so it would have returned nothing and
//   every deletion would have been refused with 409. Migration 015 replaced it
//   with a single boolean that does not depend on a session.
//
// ORDER: file, then the audit row. A crash between them loses the log entry
// rather than the deletion, and the orphan report simply stops listing it.
// ===========================================================================

const ORPHAN_CONFIRMATION = CONFIRM_ORPHAN_DELETE;

async function deleteOrphan(req, res) {
  // A 405 with an Allow header is itself a disclosure: a path that does not
  // exist answers 404 to a GET, so this one must too. The other endpoints in
  // this project are not hidden and keep their 405 -- only the admin pair
  // pretends not to be there.
  if (req.method !== "POST") {
    const miss = notFound();
    return res.status(miss.status).json({ error: miss.error });
  }

  const admin = serviceClient();

  // Even a misconfigured server says nothing. A 500 here would confirm the
  // route to anyone who asked.
  if (!admin) {
    console.error("admin-delete-orphan: missing Supabase configuration");
    const miss = notFound();
    return res.status(miss.status).json({ error: miss.error });
  }

  const gate = await requireAdmin(req, admin);
  if (gate.error) return res.status(gate.status).json({ error: gate.error });

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  if (!confirmed(body?.confirmation, ORPHAN_CONFIRMATION)) {
    return res.status(400).json({
      error: `Type ${ORPHAN_CONFIRMATION} exactly to confirm. Nothing has been deleted.`,
    });
  }

  const path = (body?.path || "").trim();

  if (!path) {
    return res.status(400).json({ error: "No file was named." });
  }

  // The database decides whether this path is an orphan. Anything it does not
  // confirm is not deleted.
  const { data: isOrphan, error: checkError } = await admin.rpc("is_orphaned_resume", {
    p_path: path,
  });

  if (checkError) {
    console.error("admin-delete-orphan: orphan check failed", path, checkError);
    return res.status(502).json({ error: "We could not confirm that file is unreferenced. Nothing was deleted." });
  }

  if (!isOrphan) {
    return res.status(409).json({
      error:
        "That file is not an orphan. It either belongs to a resume on record, " +
        "or it has already been deleted. Reload the report.",
    });
  }

  const { error: removeError } = await admin.storage.from(BUCKET).remove([path]);

  if (removeError) {
    console.error("admin-delete-orphan: remove failed", path, removeError);
    return res.status(502).json({ error: "That file could not be deleted. Nothing was changed." });
  }

  const { error: logError } = await admin.rpc("admin_log_orphan_deleted", {
    p_actor: gate.userId,
    p_path: path,
  });

  if (logError) {
    // The file is gone and unlogged. Reported honestly rather than as success,
    // because an audit log with a hole in it is worth knowing about.
    console.error("admin-delete-orphan: audit write failed AFTER deletion", path, logError);
    return res.status(502).json({
      error: "The file was deleted but the audit entry failed to write. Tell the developer.",
    });
  }

  console.log(`admin-delete-orphan: ${gate.userId} deleted orphan ${path}`);

  return res.status(200).json({ deleted: true, path });
}


// ===========================================================================
// The dispatcher. It guards nothing, decides nothing, and touches nothing.
//
// An unknown action is notFound() for the same reason the method check is:
// this endpoint does not confirm its own existence to anyone who is not
// already an admin.
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
    case "anonymise":
      return anonymiseApplication(req, res);
    case "delete-orphan":
      return deleteOrphan(req, res);
    default: {
      const miss = notFound();
      return res.status(miss.status).json({ error: miss.error });
    }
  }
}
