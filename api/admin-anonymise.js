import { clearResumeFolder } from "./_lib/resumeStorage.js";
import { notFound, requireAdmin, serviceClient } from "./_lib/adminGuard.js";

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

const BUCKET = "resumes";
const CONFIRMATION = "ANONYMISE";

export default async function handler(req, res) {
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

  if ((body?.confirmation || "").trim().toUpperCase() !== CONFIRMATION) {
    return res.status(400).json({
      error: `Type ${CONFIRMATION} exactly to confirm. Nothing has been changed.`,
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
