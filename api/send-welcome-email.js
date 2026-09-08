import { createClient } from "@supabase/supabase-js";

const SENDER_EMAIL = "community@iworkatgcc.com";
const SENDER_NAME = "Rishi from iWorkAtGCC";
const SUBJECT = "Welcome to iWorkAtGCC 👋";
const ASK_URL = "https://www.iworkatgcc.com/questions";

function firstNameFrom(user) {
  const fullName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || "";
  const first = fullName.trim().split(/\s+/)[0] || "";
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function buildHtml(firstName) {
  const body = "font-size:16px;line-height:1.6;color:#334155;margin:0 0 16px;";
  const small =
    "font-size:14px;line-height:1.6;color:#64748b;margin:0 0 14px;";

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

                <p style="${body}">Thank you for joining the iWorkAtGCC Community. I'm really glad you're here.</p>

                <p style="${body}">At iWorkAtGCC, our mission is to help every GCC professional in India get the best possible outcome from their career — by learning, sharing, and growing together.</p>

                <p style="${body}"><strong>Your iWorkAtGCC Community Benefits:</strong></p>

                <ul style="font-size:16px;line-height:1.6;color:#334155;margin:0 0 16px;padding-left:20px;">
                  <li style="margin-bottom:8px;"><strong>Ask, Answer &amp; Connect:</strong> have a GCC-related question? Ask the community, or join an existing conversation.</li>
                  <li style="margin-bottom:8px;">Get notified when new GCC jobs go live in our community</li>
                  <li style="margin-bottom:8px;">Every Saturday, receive a roundup of what's happening across GCCs</li>
                  <li style="margin-bottom:8px;">The best part of our community is the people in it.</li>
                </ul>

                <p style="${body}">So here's your first step as our new community member:</p>

                <p style="margin:0 0 16px;"><a href="${ASK_URL}" clicktracking="off" style="font-size:16px;font-weight:bold;color:#2563eb;text-decoration:none;">👉 Ask your first question</a></p>

                <p style="${body}">Salaries, choosing between GCCs, growing faster — someone here has probably been exactly where you are, and you can ask them directly.</p>

                <p style="${body}">And when you spot a question you can help with, do reply — that's how we all grow together.</p>

                <p style="${body}">Welcome aboard. Glad to have you here.</p>

                <div style="border-top:1px solid #e2e8f0;margin:24px 0;"></div>

                <p style="${small}">A little about me. I know this will seem like a long note but I am a bit emotional writing this:</p>

                <p style="${small}">I'm Rishi Nigam. Over the many years working in the GCC industry, I realized that GCCs are very different from traditional industries — the way careers evolve, the way teams work, the way stakeholders engage, even the decisions you make about your own career path.</p>

                <p style="${small}">And throughout my GCC career, I found myself with countless questions such as 'Is this the right career move?', 'What skills would GCCs value?', 'How do other GCC professionals approach this?', 'Am I making the right decision?'</p>

                <p style="${small}">I wanted to talk these through, hear different perspectives, and learn from people who'd already been through similar experiences. But there was one problem: there was no real place for GCC professionals to have these conversations. This somehow made me feel a bit alone on my career path.</p>

                <p style="${small}">And that was very frustrating — because a big part of career growth comes from learning from other people's experiences, and giving back by sharing your own.</p>

                <p style="${small}">That's how iWorkAtGCC was born — a community where GCC professionals can ask questions, share experiences, help each other, discover opportunities, and ultimately grow their careers.</p>

                <p style="${small}">The most rewarding part has been seeing so many of you come forward over the last few months with the same belief — and help build this community.</p>

                <p style="${small}">Turns out, I wasn't alone.</p>

                <div style="border-top:1px solid #e2e8f0;margin:24px 0;"></div>

                <p style="${body}">Regards,<br />Rishi Nigam<br />Community Builder, iWorkAtGCC</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(firstName) {
  return `Hi ${firstName},

Thank you for joining the iWorkAtGCC Community. I'm really glad you're here.

At iWorkAtGCC, our mission is to help every GCC professional in India get the best possible outcome from their career — by learning, sharing, and growing together.

Your iWorkAtGCC Community Benefits:
- Ask, Answer & Connect: have a GCC-related question? Ask the community, or join an existing conversation.
- Get notified when new GCC jobs go live in our community
- Every Saturday, receive a roundup of what's happening across GCCs
- The best part of our community is the people in it.

So here's your first step as our new community member:

Ask your first question: ${ASK_URL}

Salaries, choosing between GCCs, growing faster — someone here has probably been exactly where you are, and you can ask them directly.

And when you spot a question you can help with, do reply — that's how we all grow together.

Welcome aboard. Glad to have you here.

---

A little about me. I know this will seem like a long note but I am a bit emotional writing this:

I'm Rishi Nigam. Over the many years working in the GCC industry, I realized that GCCs are very different from traditional industries — the way careers evolve, the way teams work, the way stakeholders engage, even the decisions you make about your own career path.

And throughout my GCC career, I found myself with countless questions such as 'Is this the right career move?', 'What skills would GCCs value?', 'How do other GCC professionals approach this?', 'Am I making the right decision?'

I wanted to talk these through, hear different perspectives, and learn from people who'd already been through similar experiences. But there was one problem: there was no real place for GCC professionals to have these conversations. This somehow made me feel a bit alone on my career path.

And that was very frustrating — because a big part of career growth comes from learning from other people's experiences, and giving back by sharing your own.

That's how iWorkAtGCC was born — a community where GCC professionals can ask questions, share experiences, help each other, discover opportunities, and ultimately grow their careers.

The most rewarding part has been seeing so many of you come forward over the last few months with the same belief — and help build this community.

Turns out, I wasn't alone.

---

Regards,
Rishi Nigam
Community Builder, iWorkAtGCC`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const brevoKey = process.env.BREVO_API_KEY;

  if (!supabaseUrl || !supabaseKey || !brevoKey) {
    console.error("Missing required environment variables");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  // Client scoped to the calling user's token so RLS applies to the
  // profile claim below (users can only update their own profile).
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return res.status(401).json({ error: "Invalid auth token" });
  }

  const email = user.email;
  if (!email) {
    return res.status(400).json({ error: "User has no email" });
  }

  // Race-safe "claim": only the call that flips welcome_email_sent_at
  // from NULL to now() proceeds to send. Concurrent/duplicate calls get
  // zero rows back and no-op. Existing members are backfilled to a
  // non-null value by the migration, so they never qualify.
  const { data: claimed, error: claimError } = await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("welcome_email_sent_at", null)
    .select("id");

  if (claimError) {
    console.error("Error claiming welcome email:", claimError);
    return res.status(500).json({ error: "Could not claim send" });
  }

  if (!claimed || claimed.length === 0) {
    // Already sent (or claimed by a concurrent call) — nothing to do.
    return res.status(200).json({ skipped: true });
  }

  const firstName = firstNameFrom(user);

  try {
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email, name: firstName }],
        subject: SUBJECT,
        htmlContent: buildHtml(firstName),
        textContent: buildText(firstName),
      }),
    });

    if (!brevoResponse.ok) {
      const detail = await brevoResponse.text();
      throw new Error(`Brevo ${brevoResponse.status}: ${detail}`);
    }
  } catch (err) {
    console.error("Error sending welcome email:", err);

    // Roll the claim back so a later attempt can retry.
    await supabase
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("id", user.id);

    return res.status(502).json({ error: "Email send failed" });
  }

  return res.status(200).json({ sent: true });
}
