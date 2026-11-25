// ===========================================================================
// Stage 6 -- the application form, and the resume file check.
//
// HOW TO RUN IT (from the repo root):
//
//     npx esbuild scripts/stage6-apply-test.mjs --bundle --format=esm \
//       --platform=node --outfile=/tmp/t6.mjs && node /tmp/t6.mjs
//
// TWO THINGS ARE TESTED HERE AND THEY MATTER FOR DIFFERENT REASONS.
//
//   validateApplication mirrors the CHECK constraints on
//   public.applications. If it is stricter than the database, a legitimate
//   application is refused for no reason; looser, and the candidate fills in
//   a form and then gets a constraint name. Every case is derived from a
//   quoted constraint and tests the boundary on both sides.
//
//   looksLikePdf is the actual security control behind "validate the file
//   type server-side, not the extension". A filename, a Content-Type header
//   and the bucket's allowed_mime_types are all chosen by whoever uploads,
//   so none of them is evidence. These cases are the ones that would get
//   through if the check were naive: a file that merely starts with %PDF-,
//   a ZIP (which is what a .docx is) renamed, and an HTML page.
//
// WHAT IT DOES NOT PROVE
//   Nothing about RLS. That an unverified recruiter cannot read an
//   application is proved in the browser against the live policy -- see the
//   stage 6 checklist.
// ===========================================================================

import { validateApplication, MAX_RESUME_BYTES, isIndianMobile } from "../src/lib/applicationModel.js";
import { looksLikePdf } from "../api/_lib/pdf.js";

let pass = 0, fail = 0;

const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// The second argument is the one rule that is not a CHECK constraint: a
// resume already on the candidate's account (migration 008) means the form
// needs no file at all. Default false, so every existing case still reads as
// "this candidate has never uploaded anything".
const keys = (values, opts) =>
  Object.keys(validateApplication(values, opts)).sort();

const file = (size) => ({ name: "cv.pdf", size });

const base = {
  full_name: "Priya Ramachandran",
  email: "priya@example.com",
  phone: "",
  notice_period: "30_days",
  resume: file(240 * 1024),
  consent: true,
};

console.log("\nBASELINE");
t("a complete application has no errors", keys(base), []);

console.log("\nfull_name -- check (length(btrim(full_name)) between 2 and 120)");
t("1 char rejected",      keys({ ...base, full_name: "A" }), ["full_name"]);
t("2 chars accepted",     keys({ ...base, full_name: "Al" }), []);
t("120 chars accepted",   keys({ ...base, full_name: "a".repeat(120) }), []);
t("121 chars rejected",   keys({ ...base, full_name: "a".repeat(121) }), ["full_name"]);
t("whitespace-only rejected (btrim)", keys({ ...base, full_name: "   " }), ["full_name"]);

console.log("\nemail -- check (position('@' in email) > 1)");
t("blank rejected",            keys({ ...base, email: "" }), ["email"]);
t("no at-sign rejected",       keys({ ...base, email: "priya.example.com" }), ["email"]);
t("leading at-sign rejected",  keys({ ...base, email: "@example.com" }), ["email"]);
t("no dot in the domain rejected", keys({ ...base, email: "priya@example" }), ["email"]);
t("ordinary address accepted", keys({ ...base, email: "p.r+jobs@sub.example.co.in" }), []);

console.log("\nphone -- optional, but a 10-digit Indian mobile when given");
const ph = (value) => keys({ ...base, phone: value });

t("blank accepted -- still optional",      ph(""), []);
t("whitespace only accepted as blank",     ph("   "), []);
t("plain 10 digits",                       ph("9876543210"), []);
t("+91 and a space",                       ph("+91 9876543210"), []);
t("+91 and grouped digits",                ph("+91 98765 43210"), []);
t("91 without the plus",                   ph("919876543210"), []);
t("leading zero",                          ph("09876543210"), []);
t("hyphens",                               ph("98765-43210"), []);
t("every mobile first digit is allowed",   ph("6012345678").concat(ph("7012345678"), ph("8012345678"), ph("9012345678")), []);

t("'777777' -- the number that got through before", ph("777777"), ["phone"]);
t("9 digits rejected",                     ph("987654321"), ["phone"]);
t("11 digits rejected",                    ph("98765432101"), ["phone"]);
// Most landlines fail on the first digit after the trunk 0: 011 Delhi,
// 022 Mumbai, 0484 Kochi. The ones that do not are 08x and 09x -- and "080
// 2555 1234" is EXACTLY as many digits as "0 8025551234", so no rule can
// tell a Bangalore landline from a mobile written with a leading zero. The
// leading zero was asked for; this is its price, and it is the right way
// round: a real mobile is never refused.
t("a Delhi landline is rejected",           ph("01123456789"), ["phone"]);
t("a Mumbai landline is rejected",          ph("02226543210"), ["phone"]);
t("a Bangalore landline IS accepted -- indistinguishable from 0 + mobile",
  ph("08025551234"), []);
t("first digit 5 rejected",                ph("5876543210"), ["phone"]);
t("first digit 0 after no prefix rejected", ph("0876543210"), ["phone"]);
t("letters rejected",                      ph("98765abcde"), ["phone"]);
t("a wrong country code rejected",         ph("+44 7700900123"), ["phone"]);
t("the database ceiling is checked first", ph("+91 9-8-7-6-5-4-3-2-1-0"), ["phone"]);
t("21 characters rejected",                ph("1".repeat(21)), ["phone"]);

console.log("\nisIndianMobile on its own");
const mob = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`          want ${want}  got ${got}`);
  ok ? pass++ : fail++;
};
mob("empty string is not a mobile", isIndianMobile(""), false);
mob("undefined does not throw",     isIndianMobile(undefined), false);
mob("9876543210",                   isIndianMobile("9876543210"), true);

console.log("\nnotice_period -- check (notice_period in (...))");
t("unset rejected",        keys({ ...base, notice_period: "" }), ["notice_period"]);
t("off-list rejected",     keys({ ...base, notice_period: "45_days" }), ["notice_period"]);
t("immediate accepted",    keys({ ...base, notice_period: "immediate" }), []);
t("serving notice accepted", keys({ ...base, notice_period: "serving_notice" }), []);

console.log("\nresume -- 2 MB, matching the bucket's file_size_limit");
t("missing rejected",            keys({ ...base, resume: null }), ["resume"]);
t("exactly 2 MB accepted",       keys({ ...base, resume: file(MAX_RESUME_BYTES) }), []);
t("one byte over rejected",      keys({ ...base, resume: file(MAX_RESUME_BYTES + 1) }), ["resume"]);

console.log("\nresume on file -- one resume per candidate, reused across roles");
t("no file needed when one is already on file",
  keys({ ...base, resume: null }, { hasResumeOnFile: true }), []);
t("still required when nothing is on file",
  keys({ ...base, resume: null }, { hasResumeOnFile: false }), ["resume"]);
t("a replacement is still size-checked, on file or not",
  keys({ ...base, resume: file(MAX_RESUME_BYTES + 1) }, { hasResumeOnFile: true }), ["resume"]);
t("a valid replacement is accepted",
  keys({ ...base, resume: file(300 * 1024) }, { hasResumeOnFile: true }), []);
t("a resume on file does not excuse the other fields",
  keys({ full_name: "", email: "", phone: "", notice_period: "", resume: null, consent: false },
       { hasResumeOnFile: true }),
  ["consent", "email", "full_name", "notice_period"].sort());

console.log("\nconsent -- a timestamp in the database, a gate here");
t("unticked rejected", keys({ ...base, consent: false }), ["consent"]);
t("ticked accepted",   keys({ ...base, consent: true }), []);

console.log("\nan empty form reports every required field at once");
t("all of them", keys({ full_name: "", email: "", phone: "", notice_period: "", resume: null, consent: false }),
  ["consent", "email", "full_name", "notice_period", "resume"].sort());

// ---------------------------------------------------------------------------
const pdf = (body = "x".repeat(200)) =>
  Buffer.from(`%PDF-1.7\n${body}\ntrailer\n%%EOF\n`, "latin1");

console.log("\nlooksLikePdf -- the bytes, not the name");
t("a real-shaped PDF passes", looksLikePdf(pdf()), true);
t("PDF 1.4 passes",           looksLikePdf(Buffer.from("%PDF-1.4\n" + "x".repeat(200) + "\n%%EOF", "latin1")), true);
t("a ZIP renamed to .pdf fails -- this is what a .docx is",
  looksLikePdf(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(500, 0x41)])), false);
t("an HTML page fails",
  looksLikePdf(Buffer.from("<!doctype html><html><body>" + "x".repeat(200) + "</body></html>", "latin1")), false);
t("a plain text file fails",
  looksLikePdf(Buffer.from("Dear hiring manager, " + "x".repeat(300), "latin1")), false);
t("a file that only STARTS with %PDF- fails -- no trailer",
  looksLikePdf(Buffer.from("%PDF-1.7\n" + "x".repeat(500), "latin1")), false);
t("'%PDF' without a version fails",
  looksLikePdf(Buffer.from("%PDF\n" + "x".repeat(200) + "\n%%EOF", "latin1")), false);
t("an empty buffer fails",  looksLikePdf(Buffer.alloc(0)), false);
t("a tiny buffer fails",    looksLikePdf(Buffer.from("%PDF-1.7", "latin1")), false);
t("a PDF with 8 KB appended after %%EOF still passes -- signing tools do this",
  looksLikePdf(Buffer.concat([pdf(), Buffer.alloc(8192, 0x20)])), true);
t("a PDF with 60 KB appended still passes",
  looksLikePdf(Buffer.concat([pdf(), Buffer.alloc(60000, 0x20)])), true);
t("beyond the 64 KB window it fails, which is the deliberate limit",
  looksLikePdf(Buffer.concat([pdf(), Buffer.alloc(70000, 0x20)])), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
