import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/resume-url   ->   { url }
//
// Hands a verified recruiter a short-lived signed URL for one application's
// resume. Body: { applicationId }.
//
// WHY IT TAKES TWO CLIENTS, AND WHY THAT IS THE WHOLE DESIGN
//
//   The DATABASE decides whether. The first client is built with the
//   PUBLISHABLE key and the recruiter's own bearer token, so inside
//   public.recruiter_resume_path() auth.uid() is the recruiter and the
//   function's own checks apply: they posted the job, they are not
//   suspended, their company is verified, the application is not anonymised.
//   Null means no, for every one of those reasons, and the reason is not
//   reported back.
//
//   The SERVICE key decides how. The `resumes` bucket has no policies on
//   storage.objects at all, so nothing but the service key can read it. It
//   is used for exactly one thing here -- minting the signed URL -- and
//   never to decide who is allowed.
//
//   Doing it the other way round, verifying the token with the service key
//   and then checking ownership here, would mean re-implementing in
//   JavaScript an authorisation rule that already exists in SQL. Two copies
//   of a rule is one copy too many, and the one that drifts is always the
//   one nobody is looking at.
//
// THE URL
//   Valid for 60 seconds and never stored. Long enough for the browser to
//   start the download, short enough that a URL copied out of devtools and
//   pasted into a message is already dead. Content-Disposition is set from
//   the application id, which this function knows and the client does not
//   get to choose -- a filename from the client would be a header the client
//   writes.
// ===========================================================================

const SIGNED_URL_SECONDS = 60;
const BUCKET = "resumes";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceKey) {
    console.error("resume-url: missing Supabase configuration");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in again and retry." });
  }

  // Vercel parses a JSON body for us; a string body can still arrive if the
  // content type was not set, so handle both rather than throwing.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const applicationId = Number(body?.applicationId);

  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return res.status(400).json({ error: "No application was named." });
  }

  // Client one: the recruiter's own identity. Nothing is persisted and no
  // token is refreshed -- this lives for one request.
  const asRecruiter = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: path, error: pathError } = await asRecruiter.rpc(
    "recruiter_resume_path",
    { p_application_id: applicationId }
  );

  if (pathError) {
    // An expired or malformed token lands here as a 401 from PostgREST.
    console.error("resume-url: recruiter_resume_path failed", pathError);
    return res.status(401).json({ error: "Sign in again and retry." });
  }

  if (!path) {
    // Not your job, not verified, suspended, anonymised, or no resume on
    // file. One answer for all of them: a different message for each would
    // turn this endpoint into a way of asking questions about other people's
    // applications.
    return res.status(403).json({
      error:
        "That resume is not available to this account. Applicant details " +
        "need your company to be verified first.",
    });
  }

  const asService = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signed, error: signError } = await asService.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, {
      download: `resume-application-${applicationId}.pdf`,
    });

  if (signError || !signed?.signedUrl) {
    console.error("resume-url: could not sign", path, signError);
    return res.status(502).json({ error: "That resume could not be opened. Try again." });
  }

  return res.status(200).json({ url: signed.signedUrl, expiresIn: SIGNED_URL_SECONDS });
}
