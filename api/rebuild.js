// Triggered daily by Vercel Cron. Hitting the deploy hook starts a fresh
// build, which re-runs the prerender step so questions posted since the last
// deploy become crawlable.
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
  return res.status(200).json({ triggered: true });
}
