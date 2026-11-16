// ===========================================================================
// Stage 3 account-takeover check — PASTE THIS INTO THE BROWSER CONSOLE.
//
// WHY THIS EXISTS
//   Enabling the email/password provider means anyone can now POST to
//   /auth/v1/signup with any email address. 2,444 of the 2,446 accounts on
//   this project are Google-only with no password. Several sit on real
//   company domains that pass the free-provider blocklist. So: what happens
//   if someone submits one of those addresses with a password?
//
// WHAT THIS SCRIPT IS NOT
//   It is not the verdict. It performs the action and prints the raw server
//   response. The VERDICT comes from the SQL in
//   scripts/stage3-takeover-check.sql, because auth.users and auth.identities
//   are not reachable from the browser. Where this script grades something,
//   it says what the expectation is based on; where it cannot, it says so.
//
// IT DELIBERATELY BYPASSES THE FORM
//   src/lib/blockedEmailDomains.js blocks free providers in the form, and the
//   handle_new_recruiter trigger blocks them in the database. Neither one
//   guards /auth/v1/signup itself. Calling the endpoint directly is the real
//   attacker path, and it is the only way to test this honestly.
//
// RUN IT SIGNED OUT. An attacker is not signed in to your site.
// ===========================================================================

(async () => {
  const SUPABASE_URL = "https://uynsvjpgeuxzndtniwrw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xh5Di7rdfJjqXJ6XFiwaAQ_guznmPQ-";

  // Which test to run: "T1", "T2A" or "T2B". The checklist says when.
  const TEST = "T1";

  // T1  -> an email that ALREADY exists as a Google-only account you own.
  // T2A -> a Gmail address you own that is NOT yet in auth.users at all.
  // T2B -> the same address you used for T2A.
  const TARGET_EMAIL = "PASTE_THE_ADDRESS_HERE";

  // The "attacker's" password. Any string of 10+ characters. Write it down:
  // T2B needs the exact same one.
  const ATTACKER_PASSWORD = "NotTheRealOwner-2026";

  // ---------------------------------------------------------------- guards
  const bad = (m) => console.log("%c" + m, "color:#b00;font-weight:bold");

  if (TARGET_EMAIL.startsWith("PASTE_")) {
    bad("Stop: set TARGET_EMAIL at the top of this snippet first.");
    return;
  }
  if (!["T1", "T2A", "T2B"].includes(TEST)) {
    bad('Stop: TEST must be exactly "T1", "T2A" or "T2B".');
    return;
  }
  const stillSignedIn = Object.keys(localStorage).some(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );
  if (stillSignedIn) {
    bad("Stop: you are still signed in. Sign out first — an attacker would not");
    bad("have a session. Then reload the page and paste this again.");
    return;
  }

  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  const authCall = async (path, body) => {
    const res = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  };

  const line = () => console.log("-".repeat(72));
  const show = (label, value) => console.log("   " + label.padEnd(26) + value);

  console.log("%cStage 3 takeover check — " + TEST, "font-size:15px;font-weight:bold");
  console.log("Target address: " + TARGET_EMAIL);
  line();

  // ====================================================================== T1
  if (TEST === "T1") {
    console.log("T1 — password signup against an address that ALREADY exists");
    console.log("     as a Google-only account.");
    console.log("");
    console.log("Supabase documents this as returning an 'obfuscated user");
    console.log("response with no verification email sent', to prevent");
    console.log("enumeration. The tell-tale is an EMPTY identities array:");
    console.log("that response describes a user that was not created.");
    line();

    const r = await authCall("signup", {
      email: TARGET_EMAIL,
      password: ATTACKER_PASSWORD,
      data: { account_type: "recruiter", recruiter_name: "Takeover probe" },
    });

    show("HTTP status", r.status);
    show("error", r.json?.error_description || r.json?.msg || r.json?.error || "(none)");
    show("user id returned", r.json?.id || r.json?.user?.id || "(none)");
    show("session returned", r.json?.access_token ? "YES" : "no");
    const idents = r.json?.identities ?? r.json?.user?.identities;
    show("identities array", Array.isArray(idents) ? "length " + idents.length : "(absent)");
    show("confirmation_sent_at", r.json?.confirmation_sent_at || "(none)");
    line();

    const obfuscated = Array.isArray(idents) && idents.length === 0;
    const gotSession = Boolean(r.json?.access_token);

    if (gotSession) {
      bad("FAIL — a session was returned. You are signed in as that account.");
      bad("This is a real takeover. Stop and report this.");
    } else if (obfuscated) {
      console.log(
        "%cPASS (as far as the browser can see) — empty identities array, no session.",
        "color:#070;font-weight:bold"
      );
      console.log("   Nothing was created and no password was attached.");
    } else {
      console.log(
        "%cINCONCLUSIVE from the browser — check the SQL and the Brevo log.",
        "color:#b60;font-weight:bold"
      );
      console.log("   identities was not an empty array, so this did not match the");
      console.log("   documented enumeration-protection response. The SQL decides.");
    }

    console.log("");
    console.log("NOW DO BOTH OF THESE — the browser cannot tell you either one:");
    console.log("  1. Run scripts/stage3-takeover-check.sql section T1.");
    console.log("  2. Check the Brevo transactional log. No email should have");
    console.log("     been sent to " + TARGET_EMAIL + ".");
    return;
  }

  // ===================================================================== T2A
  if (TEST === "T2A") {
    console.log("T2A — pre-register a password account on an address that does");
    console.log("      NOT exist yet, and leave it unconfirmed.");
    console.log("");
    console.log("This is the attacker's setup move. A real user row SHOULD be");
    console.log("created here — that is not the bug. The question is what");
    console.log("happens to it when the real owner later signs in with Google.");
    line();

    const r = await authCall("signup", {
      email: TARGET_EMAIL,
      password: ATTACKER_PASSWORD,
      data: { account_type: "recruiter", recruiter_name: "Takeover probe" },
    });

    show("HTTP status", r.status);
    show("error", r.json?.error_description || r.json?.msg || r.json?.error || "(none)");
    show("user id returned", r.json?.id || r.json?.user?.id || "(none)");
    show("session returned", r.json?.access_token ? "YES" : "no");
    const idents = r.json?.identities ?? r.json?.user?.identities;
    show("identities array", Array.isArray(idents) ? "length " + idents.length : "(absent)");
    show("confirmation_sent_at", r.json?.confirmation_sent_at || "(none)");
    line();

    if (Array.isArray(idents) && idents.length === 0) {
      bad("Careful — empty identities means this address ALREADY existed.");
      bad("Pick an address that is not in auth.users yet, or this is really T1.");
      return;
    }
    if (r.json?.access_token) {
      bad("Unexpected — a session was returned, so 'Confirm email' may be off.");
      bad("Stop and check Authentication -> Sign In / Providers before going on.");
      return;
    }

    console.log("Setup done. DO NOT click the confirmation email.");
    console.log("");
    console.log("Next: run scripts/stage3-takeover-check.sql section T2A and");
    console.log("confirm the row is unconfirmed with a password set. Then sign in");
    console.log("with GOOGLE as " + TARGET_EMAIL + " — that is the real owner");
    console.log("arriving. Then run T2B.");
    return;
  }

  // ===================================================================== T2B
  console.log("T2B — the attack itself. The owner has now signed in with Google.");
  console.log("      Try the attacker's password against their account.");
  line();

  const r = await authCall("token?grant_type=password", {
    email: TARGET_EMAIL,
    password: ATTACKER_PASSWORD,
  });

  show("HTTP status", r.status);
  show("error", r.json?.error_description || r.json?.msg || r.json?.error || "(none)");
  show("access_token", r.json?.access_token ? "RETURNED" : "no");
  show("user id", r.json?.user?.id || "(none)");
  show("user email", r.json?.user?.email || "(none)");
  line();

  if (r.json?.access_token) {
    bad("FAIL — THIS IS A REAL HOLE.");
    bad("The attacker's password signed in to the owner's account.");
    bad("Everything that account can see is now readable by whoever");
    bad("pre-registered the address. Report this and do not merge.");
    console.log("");
    console.log("Sign out immediately: localStorage.clear(); then reload.");
  } else {
    const msg = (r.json?.error_description || r.json?.msg || "").toLowerCase();
    console.log("%cNo session issued — the attack did not work.", "color:#070;font-weight:bold");
    console.log("");
    if (msg.includes("invalid login")) {
      console.log("   'Invalid login credentials' — the password is gone or was");
      console.log("   never usable. Best possible outcome.");
    } else if (msg.includes("not confirmed")) {
      console.log("   'Email not confirmed' — the password survives but is");
      console.log("   unusable. Confirm with the SQL whether the Google sign-in");
      console.log("   landed on the SAME user row or a different one.");
    } else {
      console.log("   Refused with a message this script does not recognise.");
      console.log("   Paste the output above verbatim.");
    }
    console.log("");
    console.log("Run scripts/stage3-takeover-check.sql section T2B for the verdict.");
  }
})();
