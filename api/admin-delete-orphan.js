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
// THE PATH COMES FROM THE CLIENT, SO IT IS CHECKED AGAINST THE REPORT.
//   This is the one admin action where the target is a string rather than a
//   row id, and the service key can delete any object in the bucket. So the
//   path is not taken on trust: it must still appear in
//   admin_orphaned_resumes(), which by definition only lists objects with no
//   row pointing at them. A live candidate's resume can therefore never be
//   deleted here, even by a malformed or malicious request.
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

  // The report is the authorisation. Anything not in it is not an orphan.
  const { data: orphans, error: reportError } = await admin.rpc("admin_orphaned_resumes");

  if (reportError) {
    console.error("admin-delete-orphan: report failed", reportError);
    return res.status(502).json({ error: "We could not confirm that file is unreferenced. Try again." });
  }

  if (!(orphans || []).some((o) => o.resume_path === path)) {
    return res.status(409).json({
      error:
        "That file is not in the orphan report any more. It may now belong to a " +
        "live application, or already be deleted. Reload the report.",
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
