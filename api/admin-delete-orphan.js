import { requireAdmin, serviceClient } from "./_lib/adminGuard.js";

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

const BUCKET = "resumes";
const CONFIRMATION = "DELETE";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = serviceClient();

  if (!admin) {
    console.error("admin-delete-orphan: missing Supabase configuration");
    return res.status(500).json({ error: "Server not configured" });
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

  if ((body?.confirmation || "").trim().toUpperCase() !== CONFIRMATION) {
    return res.status(400).json({
      error: `Type ${CONFIRMATION} exactly to confirm. Nothing has been deleted.`,
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
