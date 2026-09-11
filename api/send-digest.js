import { createClient } from "@supabase/supabase-js";

const SENDER_EMAIL = "community@iworkatgcc.com";
const SENDER_NAME = "Rishi from iWorkAtGCC";
const SUBJECT = "People are engaging with what you shared 💙";
const CTA_URL = "https://www.iworkatgcc.com/profile/asked?notifications=open";

const INACTIVE_DAYS = 42; // 6 weeks

function istToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function istWeekday() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(new Date());
}

function firstNameFrom(fullName) {
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function plural(n, word) {
  return `${n} new ${word}${n === 1 ? "" : "s"}`;
}

function buildHtml(firstName, hearts, answers) {
  const body = "font-size:16px;line-height:1.6;color:#334155;margin:0 0 16px;";
  const lines = [];
  if (hearts > 0) {
    lines.push(
      `<p style="font-size:16px;line-height:1.6;color:#334155;margin:0 0 6px;">❤️ <strong>${plural(hearts, "heart")}</strong></p>`
    );
  }
  if (answers > 0) {
    lines.push(
      `<p style="font-size:16px;line-height:1.6;color:#334155;margin:0 0 6px;">💬 <strong>${plural(answers, "answer")}</strong></p>`
    );
  }

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f8fc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fc;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;padding:32px;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td>
                <p style="${body}">Hi ${firstName},</p>

                <p style="${body}">You've got unread notifications waiting. People have been engaging with what you shared on iWorkAtGCC.</p>

                <p style="font-size:16px;line-height:1.6;color:#334155;margin:0 0 8px;"><strong>Notifications waiting for you:</strong></p>

                ${lines.join("\n                ")}

                <p style="margin:20px 0 16px;"><a href="${CTA_URL}" clicktracking="off" style="font-size:16px;font-weight:bold;color:#2563eb;text-decoration:none;">See what's new →</a></p>

                <p style="${body}">Jump back in and see who's been connecting with what you shared.</p>

                <p style="${body}">Regards,<br />Rishi Nigam<br />iWorkAtGCC</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(firstName, hearts, answers) {
  const lines = [];
  if (hearts > 0) lines.push(`- ${plural(hearts, "heart")}`);
  if (answers > 0) lines.push(`- ${plural(answers, "answer")}`);

  return `Hi ${firstName},

You've got unread notifications waiting. People have been engaging with what you shared on iWorkAtGCC.

Notifications waiting for you:
${lines.join("\n")}

See what's new: ${CTA_URL}

Jump back in and see who's been connecting with what you shared.

Regards,
Rishi Nigam
iWorkAtGCC`;
}

async function sendEmail(brevoKey, toEmail, firstName, hearts, answers) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: toEmail, name: firstName }],
      subject: SUBJECT,
      htmlContent: buildHtml(firstName, hearts, answers),
      textContent: buildText(firstName, hearts, answers),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Brevo ${res.status}: ${detail}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  const cronSecret = process.env.CRON_SECRET;

  if (!supabaseUrl || !serviceKey || !brevoKey || !cronSecret) {
    console.error("Missing required environment variables");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Params (parsed from the URL so this works under Vercel and the dev shim).
  const params = new URL(req.url, "http://localhost").searchParams;
  const dry = params.get("dry") === "1" || params.get("dry") === "true";
  const force = params.get("force") === "1" || params.get("force") === "true";
  const only = params.get("only");

  // Weekly gate: real scheduled runs only proceed on Monday IST.
  // dry runs and forced runs bypass it (for on-demand testing).
  if (!dry && !force && istWeekday() !== "Monday") {
    return res.status(200).json({ skipped: "not_monday_ist" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = istToday();
  const cutoffIso = new Date(
    Date.now() - INACTIVE_DAYS * 86400000
  ).toISOString();
  const cutoffDate = new Date(Date.now() - INACTIVE_DAYS * 86400000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  // Candidate users = anyone who has authored a question or an answer
  // (only they can have "unread notifications" under the current scope).
  const [{ data: qAuthorRows, error: qAuthorErr }, { data: aAuthorRows, error: aAuthorErr }] =
    await Promise.all([
      supabase.from("questions").select("user_id"),
      supabase.from("answers").select("user_id"),
    ]);

  if (qAuthorErr) {
    console.error("Error loading question authors:", qAuthorErr);
    return res.status(500).json({ error: "Query failed" });
  }
  if (aAuthorErr) {
    console.error("Error loading answer authors:", aAuthorErr);
    return res.status(500).json({ error: "Query failed" });
  }

  const candidateIds = [
    ...new Set([
      ...(qAuthorRows || []).map((r) => r.user_id),
      ...(aAuthorRows || []).map((r) => r.user_id),
    ]),
  ];

  if (candidateIds.length === 0) {
    return res.status(200).json({ mode: dry ? "dry" : "send", eligible: [], skipped: [] });
  }

  // Profiles for candidates.
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select(
      "id, google_email, google_display_name, notifications_last_seen_at, last_reminder_sent_on"
    )
    .in("id", candidateIds);

  if (profErr) {
    console.error("Error loading profiles:", profErr);
    return res.status(500).json({ error: "Query failed" });
  }

  // Active set from user_activity (last 42 IST days).
  const { data: activityRows, error: actErr } = await supabase
    .from("user_activity")
    .select("user_id")
    .gte("active_date", cutoffDate);

  if (actErr) {
    console.error("Error loading user_activity:", actErr);
    return res.status(500).json({ error: "Query failed" });
  }

  const activeSet = new Set((activityRows || []).map((r) => r.user_id));

  // last_sign_in_at map via the Admin API (auth schema isn't reachable via
  // PostgREST). Paginate to be safe.
  const lastSignIn = {};
  let page = 1;
  while (true) {
    const { data: usersPage, error: usersErr } =
      await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersErr) {
      console.error("Error listing users:", usersErr);
      break;
    }
    const users = usersPage?.users || [];
    for (const u of users) {
      if (u.last_sign_in_at) lastSignIn[u.id] = u.last_sign_in_at;
    }
    if (users.length < 1000) break;
    page += 1;
  }

  const eligible = [];
  const skipped = [];

  for (const p of profiles || []) {
    if (only && only !== p.id && only.toLowerCase() !== (p.google_email || "").toLowerCase()) {
      continue;
    }

    const email = p.google_email;
    if (!email) {
      skipped.push({ id: p.id, reason: "no_email" });
      continue;
    }

    const threshold = p.notifications_last_seen_at || "1970-01-01T00:00:00Z";

    // This user's question ids and answer ids.
    const [{ data: qRows }, { data: aRows }] = await Promise.all([
      supabase.from("questions").select("id").eq("user_id", p.id),
      supabase.from("answers").select("id").eq("user_id", p.id),
    ]);
    const qIds = (qRows || []).map((r) => r.id);
    const aIds = (aRows || []).map((r) => r.id);

    let hearts = 0;
    let answers = 0;
    const countQueries = [];
    if (qIds.length > 0) {
      countQueries.push(
        supabase
          .from("question_hearts")
          .select("*", { count: "exact", head: true })
          .in("question_id", qIds)
          .neq("user_id", p.id)
          .gt("created_at", threshold)
          .then((r) => ({ key: "hearts", count: r.count || 0 })),
        supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .in("question_id", qIds)
          .neq("user_id", p.id)
          .gt("created_at", threshold)
          .then((r) => ({ key: "answers", count: r.count || 0 }))
      );
    }
    if (aIds.length > 0) {
      countQueries.push(
        supabase
          .from("answer_hearts")
          .select("*", { count: "exact", head: true })
          .in("answer_id", aIds)
          .neq("user_id", p.id)
          .gt("created_at", threshold)
          .then((r) => ({ key: "hearts", count: r.count || 0 }))
      );
    }

    const countResults = await Promise.all(countQueries);
    for (const { key, count } of countResults) {
      if (key === "hearts") hearts += count;
      else answers += count;
    }

    if (hearts + answers === 0) {
      skipped.push({ email, reason: "no_unread" });
      continue;
    }

    const isActive =
      activeSet.has(p.id) ||
      (lastSignIn[p.id] && lastSignIn[p.id] >= cutoffIso);

    if (!isActive) {
      skipped.push({ email, reason: "dormant", hearts, answers });
      continue;
    }

    if (p.last_reminder_sent_on === today) {
      skipped.push({ email, reason: "already_reminded_today", hearts, answers });
      continue;
    }

    if (dry) {
      eligible.push({ email, hearts, answers, would_send: true });
      continue;
    }

    // Real send.
    try {
      await sendEmail(brevoKey, email, firstNameFrom(p.google_display_name), hearts, answers);
    } catch (err) {
      console.error(`Error sending digest to ${email}:`, err);
      skipped.push({ email, reason: "send_failed", hearts, answers });
      continue;
    }

    const { error: markErr } = await supabase
      .from("profiles")
      .update({ last_reminder_sent_on: today })
      .eq("id", p.id);

    if (markErr) {
      console.error(`Error marking digest sent for ${email}:`, markErr);
    }

    eligible.push({ email, hearts, answers, sent: true });
  }

  return res.status(200).json({
    mode: dry ? "dry" : "send",
    day_ist: istWeekday(),
    eligible_count: eligible.length,
    eligible,
    skipped_count: skipped.length,
    skipped,
  });
}
