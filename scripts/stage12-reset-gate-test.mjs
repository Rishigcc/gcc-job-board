// ===========================================================================
// Stage 12 -- the reset endpoint answers identically, whatever happens.
//
// HOW TO RUN IT (from the repo root):
//
//     node scripts/stage12-reset-gate-test.mjs
//
// IT CANNOT SEND AN EMAIL, BY CONSTRUCTION. Every address it uses is one the
// gate must refuse -- a community member, the admin, an address with no
// account, and malformed input. None of them can reach the send, so running
// this never mails a real person. The eligible path is proved on the preview
// by an actual reset, which is the only honest way to prove a send.
//
// WHY THIS IS A TEST AND NOT A READ-THROUGH
//   The property is "every outcome produces the same reply". That is a claim
//   about a set of paths, and the only way to check a set is to enumerate it.
//   Reading the file tells you the paths LOOK the same; running them tells
//   you the bytes are.
//
// It hits the live database with the service key from .env, because the gate
// is granted to service_role alone. It writes nothing.
// ===========================================================================

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(`${process.cwd()}/.env`, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const handler = (await import(`${process.cwd()}/api/password.js`)).default;

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
};
const checkTrue = (name, actual) => check(name, actual, true);

// --- fixtures, looked up rather than hardcoded ----------------------------
const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: member } = await admin.rpc("reset_eligibility_for_email", {
  p_email: "no-such-address-stage12@example.invalid",
});
checkTrue("the gate is reachable with the service key", member === "none");

function mockRes() {
  const r = { _status: null, _headers: {}, _body: null };
  r.setHeader = (k, v) => { r._headers[k.toLowerCase()] = v; };
  r.status = (s) => { r._status = s; return r; };
  r.json = (b) => { r._body = b; return r; };
  r.send = (b) => { r._body = b; return r; };
  r.end = () => r;
  return r;
}

// Every call carries action:"request" now that the two endpoints share a
// file. A body WITHOUT an action is tested separately, below: it must be a
// loud 400 rather than a silent reset request with no address.
async function call(body, method = "POST") {
  if (body && typeof body === "object" && !("action" in body)) {
    body = { action: "request", ...body };
  }
  const res = mockRes();
  const t0 = Date.now();
  await handler({ method, body, headers: { host: "example.test" } }, res);
  return {
    status: res._status,
    body: res._body,
    cacheControl: res._headers["cache-control"],
    elapsed: Date.now() - t0,
  };
}

// --- every refusing path, enumerated -------------------------------------
// Addresses chosen so none can be eligible. Two are looked up from the
// database so the test exercises real rows without naming anyone in a file.
const { data: adminRow } = await admin
  .from("user_roles")
  .select("user_id")
  .eq("role", "admin")
  .maybeSingle();

const adminAddress = adminRow
  ? (await admin.auth.admin.getUserById(adminRow.user_id)).data?.user?.email
  : null;

// A real community member: a Google account with no user_roles row, which is
// 2,652 of the 2,656 and the single most important refusing case. Found via
// the admin API rather than a hardcoded address, so no member is named here.
const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
const { data: roleRows } = await admin.from("user_roles").select("user_id");
const withRole = new Set((roleRows || []).map((r) => r.user_id));
const memberAddress =
  (page?.users || []).find(
    (u) => !withRole.has(u.id) && (u.app_metadata?.providers || []).includes("google")
  )?.email || null;

const CASES = [
  ["an address with no account", { email: "no-such-address-stage12@example.invalid" }],
  ["a malformed address", { email: "not-an-email" }],
  ["an empty address", { email: "" }],
  ["whitespace only", { email: "   " }],
  ["no email field", {}],
  ["a null body", { action: "request", email: null }],
  ["email as a number", { email: 42 }],
  ["email as an object", { email: { a: 1 } }],
  ["a 400-character address", { email: "x".repeat(380) + "@example.invalid" }],
  ["an address with a newline", { email: "a@b.co\nbcc: x@y.z" }],
];

if (memberAddress) {
  // role_not_eligible against a real community member. It has no user_roles
  // row at all, so it cannot reach the send.
  CASES.push(["a community member's address (role_not_eligible)", { email: memberAddress }]);
}

if (adminAddress) {
  // The ADMIN has a user_roles row that is not in eligible_roles, so this
  // exercises role_not_eligible against a real account without sending.
  CASES.push(["the admin's own address (role_not_eligible)", { email: adminAddress }]);
}

const results = [];
for (const [label, body] of CASES) {
  const r = await call(body);
  results.push([label, r]);

  check(`${label}: status 200`, r.status, 200);
  check(`${label}: body is { ok: true }`, r.body, { ok: true });
  check(`${label}: no-store`, r.cacheControl, "no-store");
  checkTrue(`${label}: padded to the floor (${r.elapsed}ms >= 1200)`, r.elapsed >= 1195);
}

// THE PROPERTY ITSELF: every reply identical to every other.
const first = JSON.stringify({ s: results[0][1].status, b: results[0][1].body, c: results[0][1].cacheControl });
for (const [label, r] of results.slice(1)) {
  check(`${label} is byte-identical to the first reply`,
    JSON.stringify({ s: r.status, b: r.body, c: r.cacheControl }), first);
}

// Timing spread across the refusing paths. A wide spread would mean the
// floor is not doing its job even among cases that all refuse.
const times = results.map(([, r]) => r.elapsed);
const spread = Math.max(...times) - Math.min(...times);
checkTrue(`the refusing paths are within 400ms of each other (spread ${spread}ms)`, spread < 400);

// --- the method guard is the ONE path allowed to answer differently ------
const notAllowed = await call({ email: "x@y.co" }, "GET");
check("GET is refused with 405", notAllowed.status, 405);
checkTrue("GET names the allowed method", Boolean(notAllowed.body?.error));

// --- a structural guarantee for the path this test cannot run ------------
// The eligible path cannot be exercised without mailing a real recruiter.
// What CAN be proved is that it has nowhere else to answer from: the file
// contains exactly one success reply, inside sameReply().
const source = readFileSync(`${process.cwd()}/api/password.js`, "utf8");

// ACTION-SCOPED now that two actions share the file. The file has two 200
// replies -- one per action -- so counting the file would prove nothing. What
// matters is that the REQUEST action has exactly one, inside sameReply().
const requestFn = source.slice(
  source.indexOf("async function requestReset"),
  source.indexOf("async function maySetPassword")
);
checkTrue("the request action's source was found", requestFn.length > 500);
check("the request action has exactly one 200 reply",
  (requestFn.match(/res\.status\(200\)/g) || []).length, 1);
check("the file has two 200 replies, one per action",
  (source.match(/res\.status\(200\)/g) || []).length, 2);
checkTrue("every refusal routes through sameReply",
  (requestFn.match(/return sameReply\(/g) || []).length >= 5);
// Anchored on the CALL, not the name: the header comment mentions
// resetPasswordForEmail several paragraphs above it, and the first version of
// this assertion compared against that and failed on correct code.
checkTrue("the send is reached only after an eligible verdict",
  requestFn.indexOf('verdict !== "eligible"') <
    requestFn.indexOf("anon.auth.resetPasswordForEmail"));
checkTrue("the gate uses the SERVICE key", /serviceKey[\s\S]{0,400}reset_eligibility_for_email/.test(source));
checkTrue("the send uses the PUBLISHABLE key",
  /publishableKey[\s\S]{0,400}resetPasswordForEmail/.test(source));

// --- the dispatch itself -------------------------------------------------
// A MISSING ACTION MUST BE LOUD. If it defaulted to "request", a client that
// forgot the field would ask for a reset with no address and get the same
// cheerful reply as everyone else, and nobody would ever find out.
const noAction = await call({ email: "x@y.co", action: undefined }, "POST");
check("a missing action is refused with 400", noAction.status, 400);

const badAction = await call({ action: "delete-everything" }, "POST");
check("an unknown action is refused with 400", badAction.status, 400);
checkTrue("the 400 does not leak a verdict",
  !JSON.stringify(badAction.body || {}).includes("eligible"));

// And the may-set action with no token is a 401, not the identical reply:
// it answers about a session, so there is nothing to withhold.
const noToken = await call({ action: "may-set" }, "POST");
check("may-set with no token is 401", noToken.status, 401);

console.log(`\nStage 12 reset-gate test: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:\n");
  for (const f of failures) console.log(`  ${f}\n`);
  process.exit(1);
}
console.log("All good.\n");
