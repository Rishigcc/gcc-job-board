import { createClient } from "@supabase/supabase-js";

// Triggered daily by Vercel Cron. Hitting the deploy hook starts a fresh
// build, which re-runs the prerender step so questions posted since the last
// deploy become crawlable.
//
// IT ALSO CARRIES THE 12-MONTH APPLICATION SWEEP (stage 8).
//
//   The privacy policy says applications are kept "for up to 12 months after
//   it closes or expires". Something has to make that true, and the Hobby
//   plan allows two cron jobs, both already taken.
//
//   This one hosts it rather than the digest, deliberately. The digest sends
//   to ~2,500 people and a crash part-way through risks double-sending; this
//   function sends nothing, so a failure here is invisible to everyone. The
//   sweep therefore runs AFTER the deploy hook has fired and is wrapped so it
//   can never stop a rebuild: its outcome is reported in the body and the
//   logs, never by failing the request.
//
//   It touches no files. Resumes have their own retention -- "until you
//   replace or delete it" -- and there is one per candidate rather than one
//   per application, so an application sweep never deletes a resume. The
//   whole thing is one SQL statement inside
//   public.purge_expired_applications(), which is granted to service_role
//   only.
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const deployHookUrl = process.env.DEPLOY_HOOK_URL;

  if (!cronSecret || !deployHookUrl) {
    console.error("Missing CRON_SECRET or DEPLOY_HOOK_URL");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const hookResponse = await fetch(deployHookUrl, { method: "POST" });

  if (!hookResponse.ok) {
    const detail = await hookResponse.text();
    console.error(`Deploy hook failed ${hookResponse.status}: ${detail}`);
    return res.status(502).json({ error: "Deploy hook failed" });
  }

  console.log("Rebuild triggered via deploy hook");

  // Everything below is secondary. The rebuild has already been triggered and
  // nothing here may change that outcome.
  const purge = await purgeExpiredApplications();

  return res.status(200).json({ triggered: true, ...purge });
}

// Returns a plain object either way. It never throws and never rejects, so
// the caller above has nothing to guard against.
async function purgeExpiredApplications() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("rebuild: retention sweep skipped, missing Supabase configuration");
    return { purgeSkipped: "not configured" };
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.rpc("purge_expired_applications", {
      p_limit: 5000,
    });

    if (error) {
      console.error("rebuild: retention sweep failed", error);
      return { purgeError: error.message };
    }

    const purged = typeof data === "number" ? data : 0;

    // Logged on every run, including zero, so a sweep that has silently
    // stopped working is visible as an absence in the cron log.
    console.log(`rebuild: retention sweep purged ${purged} application(s)`);
    return { purged };
  } catch (err) {
    console.error("rebuild: retention sweep threw", err);
    return { purgeError: err.message };
  }
}
