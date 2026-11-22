import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/delete-my-data   ->   { applications_anonymised, resume_deleted }
//
// Delete my job board data. JOB BOARD ONLY: it does not touch
// public.profiles, questions, answers, hearts, saves, or the auth account.
// That is the decided scope, it is what the privacy policy says, and it is
// printed on the button the caller pressed.
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
// ORDER: FILE, THEN DATABASE. A failed file delete changes nothing.
// ===========================================================================

const BUCKET = "resumes";
const CONFIRMATION = "DELETE MY DATA";

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

  if ((body?.confirmation || "").trim() !== CONFIRMATION) {
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

  // The file first, while the row still points at it.
  const { data: resumeRow, error: readError } = await admin
    .from("candidate_resumes")
    .select("resume_path")
    .eq("candidate_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("delete-my-data: read failed", readError);
    return res.status(502).json({ error: "We could not read your records. Nothing was changed — please try again." });
  }

  if (resumeRow?.resume_path) {
    if (!resumeRow.resume_path.startsWith(`${userId}/`)) {
      console.error("delete-my-data: path outside the caller's folder", userId, resumeRow.resume_path);
      return res.status(500).json({ error: "Your data could not be deleted. Write to jobs@iworkatgcc.com." });
    }

    const { error: removeError } = await admin.storage.from(BUCKET).remove([resumeRow.resume_path]);

    if (removeError) {
      console.error("delete-my-data: storage remove failed", resumeRow.resume_path, removeError);
      return res.status(502).json({ error: "Your resume file could not be deleted. Nothing was changed — please try again." });
    }
  }

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
      `, resume ${resumeRow?.resume_path ? "deleted" : "none on file"}`
  );

  return res.status(200).json({
    applications_anonymised: row?.applications_anonymised ?? 0,
    resume_deleted: Boolean(resumeRow?.resume_path),
  });
}
