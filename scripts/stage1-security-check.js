// ===========================================================================
// Stage 1 security check (v3) — PASTE THIS INTO THE BROWSER CONSOLE.
//
// WHAT CHANGED FROM v2
//   * The script now works out WHICH PERSONA is running it (admin or not) and
//     expects the right number of rows for that persona. v2 asserted "I see
//     exactly 1 role row", which is correct for a normal user and wrong for an
//     admin — whose policy is supposed to show them everything.
//   * New test 4 attempts to INSERT a role row. That is the real escalation
//     path: someone with no role row has nothing to UPDATE, so they would
//     create one. v2 never tested it.
//
// RUN IT TWICE: once signed in as yourself (admin), once in an incognito
// window signed in as your second Google account (non-admin). The checklist
// says when.
//
// Fill in the three values below, then: F12 -> Console -> paste -> Enter.
// ===========================================================================

(async () => {
  const SUPABASE_URL = "https://uynsvjpgeuxzndtniwrw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xh5Di7rdfJjqXJ6XFiwaAQ_guznmPQ-";

  // From `select count(*) from public.user_roles;` in the SQL editor.
  const TOTAL_ROLE_ROWS = 2;

  if (SUPABASE_URL.startsWith("PASTE_")) {
    console.log("%cStop: paste the two .env values into the top of this snippet first.", "color:#b00");
    return;
  }
  if (!TOTAL_ROLE_ROWS) {
    console.log("%cStop: set TOTAL_ROLE_ROWS to the number the SQL editor reported.", "color:#b00");
    return;
  }

  const storageKey = Object.keys(localStorage).find(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );
  if (!storageKey) {
    console.log("%cStop: you are not signed in. Sign in on this site, then paste again.", "color:#b00");
    return;
  }
  const token = JSON.parse(localStorage.getItem(storageKey)).access_token;

  const signedIn = {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const signedOut = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };

  const call = async (path, init = {}, headers = signedIn) => {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers, ...init });
    let body = null;
    try { body = await res.json(); } catch { /* 204 No Content */ }
    return { status: res.status, body };
  };

  const results = [];
  const record = (name, passed, detail) => results.push({ name, passed, detail });

  // Names WHICH lock refused a write that was supposed to fail. user_roles is
  // protected twice over — no privilege AND no policy — and this shows which
  // one fired, so a lock quietly disappearing is visible rather than silent.
  const classifyWrite = (r) => {
    const msg = (r.body && r.body.message) || "";
    if (/permission denied/i.test(msg))
      return { passed: true, detail: "refused by table privilege (outer lock holding)" };
    if (/row-level security/i.test(msg))
      return { passed: true, detail: "refused by row-level security (inner lock; outer lock may be gone — tell Claude)" };
    if (/duplicate key|already exists/i.test(msg))
      return { passed: false, detail: "REACHED THE UNIQUE CONSTRAINT — the write privilege EXISTS. Tell Claude." };
    if (Array.isArray(r.body) && r.body.length === 0)
      return { passed: true, detail: "0 rows changed — RLS held, but the privilege lock is GONE. Tell Claude." };
    if (r.status === 204)
      return { passed: true, detail: "204, rows unknown — tell Claude." };
    if (Array.isArray(r.body) && r.body.length > 0)
      return { passed: false, detail: "THE WRITE SUCCEEDED. Stop and tell Claude immediately." };
    return { passed: false, detail: "unexpected: HTTP " + r.status + " " + JSON.stringify(r.body) };
  };

  // --- 1. Read my own role, and work out which persona I am -----------------
  const r1 = await call("user_roles?select=*");
  const rows = Array.isArray(r1.body) ? r1.body : null;
  if (!rows) {
    console.log("%cFAIL at test 1 — " + JSON.stringify(r1.body), "color:#ab2f3f;font-weight:bold");
    return;
  }

  // Which row is mine? PostgREST will not tell me my own id, so find the row
  // the "read own role" policy must have let through. For an admin that is
  // ambiguous, so fall back to asking the auth endpoint.
  const me = await (await fetch(SUPABASE_URL + "/auth/v1/user", { headers: signedIn })).json();
  const myId = me && me.id;
  const myRow = rows.find((r) => r.user_id === myId);
  const isAdmin = !!myRow && myRow.role === "admin";
  const persona = isAdmin ? "ADMIN" : (myRow ? "NON-ADMIN (has a role row)" : "NON-ADMIN (no role row)");

  record(
    "1. Read my own role",
    !!myRow,
    "persona = " + persona + (myRow ? ", role = " + myRow.role : ", no row for me")
  );

  // --- 2, 3, 4. Every write path into user_roles must be refused ------------
  if (myId) {
    const r2 = await call("user_roles?user_id=eq." + myId, {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" }),   // harmless even if it worked
    });
    const c2 = classifyWrite(r2);
    record("2. Try to CHANGE my role (UPDATE)", c2.passed, c2.detail);

    const r3 = await call("user_roles?user_id=eq." + myId, { method: "DELETE" });
    const c3 = classifyWrite(r3);
    record("3. Try to DELETE my role (DELETE)", c3.passed, c3.detail);

    // The real escalation path: someone with no role row has nothing to
    // update, so they would create one.
    const r4 = await call("user_roles", {
      method: "POST",
      body: JSON.stringify({ user_id: myId, role: "admin" }),
    });
    const c4 = classifyWrite(r4);
    record("4. Try to GRANT MYSELF admin (INSERT)", c4.passed, c4.detail);
  } else {
    ["2. Try to CHANGE my role (UPDATE)",
     "3. Try to DELETE my role (DELETE)",
     "4. Try to GRANT MYSELF admin (INSERT)"]
      .forEach((n) => record(n, false, "skipped — could not read my own user id"));
  }

  // --- 5. Row filtering, judged against the persona -------------------------
  // Expected values come from the policy grid, not from assumption:
  //   admin                     -> sees every row ("admin reads all roles")
  //   non-admin with a row      -> sees exactly 1 ("read own role")
  //   non-admin with no row     -> sees 0
  const expectedVisible = isAdmin ? TOTAL_ROLE_ROWS : (myRow ? 1 : 0);
  const filteringIsProven = !isAdmin && TOTAL_ROLE_ROWS > 1;
  record(
    "5. Rows I can see, for my persona",
    rows.length === expectedVisible,
    "I see " + rows.length + " of " + TOTAL_ROLE_ROWS + " (expected " + expectedVisible + " as " + persona + ")"
      + (filteringIsProven
          ? " — ROW FILTERING PROVEN"
          : (isAdmin
              ? " — this run cannot prove filtering; re-run as the non-admin account"
              : ""))
  );

  // --- 6. Public job reads work and return nothing --------------------------
  const r6 = await call("jobs?select=id,title,status", {}, signedOut);
  record(
    "6. Read public jobs as a signed-out visitor",
    Array.isArray(r6.body) && r6.body.length === 0,
    Array.isArray(r6.body) ? r6.body.length + " rows (expected 0, with no error)"
                           : "ERROR: " + JSON.stringify(r6.body)
  );

  // --- 7. RLS blocks a non-recruiter from creating a company ----------------
  const r7 = await call("companies", {
    method: "POST",
    body: JSON.stringify({ name: "Console Test Co", slug: "console-test-co" }),
  });
  const msg7 = (r7.body && r7.body.message) || "";
  record(
    "7. Add a company without a recruiter account",
    /row-level security/i.test(msg7),
    msg7 || "UNEXPECTED: HTTP " + r7.status + " " + JSON.stringify(r7.body)
  );

  // --- 8. Signed-out visitors cannot read roles at all ----------------------
  const r8 = await call("user_roles?select=*", {}, signedOut);
  const msg8 = (r8.body && r8.body.message) || "";
  record(
    "8. Read roles as a signed-out visitor",
    /permission denied/i.test(msg8) || (Array.isArray(r8.body) && r8.body.length === 0),
    msg8 || (Array.isArray(r8.body) ? r8.body.length + " rows" : "HTTP " + r8.status)
  );

  // --- 9. Nothing above changed anything ------------------------------------
  const r9 = await call("user_roles?select=*");
  const rows9 = Array.isArray(r9.body) ? r9.body : null;
  const myRow9 = rows9 && rows9.find((r) => r.user_id === myId);
  record(
    "9. My role is untouched after all of the above",
    !!rows9 && rows9.length === rows.length && !!myRow9 &&
      myRow9.role === (myRow ? myRow.role : undefined),
    rows9 ? rows9.length + " row(s), my role = " + (myRow9 ? myRow9.role : "GONE — the delete worked!")
          : "ERROR: " + JSON.stringify(r9.body)
  );

  // --- report ---------------------------------------------------------------
  console.log("%c\n STAGE 1 SECURITY CHECK (v3) — running as " + persona + " ",
    "background:#16182a;color:#fff;font-weight:bold;padding:2px 6px");
  let allPassed = true;
  for (const r of results) {
    if (!r.passed) allPassed = false;
    console.log(
      "%c" + (r.passed ? "PASS" : "FAIL") + "%c  " + r.name + "  —  " + r.detail,
      "color:" + (r.passed ? "#1a7a52" : "#ab2f3f") + ";font-weight:bold",
      "color:inherit"
    );
  }
  console.log(
    "%c\n" + (allPassed
      ? "All 9 passed as " + persona + ". Paste the whole output back to Claude."
      : "Something FAILED. Stop. Paste the whole output back to Claude."),
    "font-weight:bold;color:" + (allPassed ? "#1a7a52" : "#ab2f3f")
  );
})();
