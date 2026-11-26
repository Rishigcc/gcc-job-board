// ===========================================================================
// Is this buffer actually a PDF?
//
// THE SECURITY CONTROL BEHIND "validate the actual file type server-side,
// not the extension" -- Rishi's requirement from stage 6. Nothing here looks
// at a filename.
//
// IT LIVES IN _lib/ FOR TWO REASONS, 25 Nov 2026:
//   1. A pure validator has no business inside a request handler. It is
//      testable, deterministic, and has nothing to do with HTTP.
//   2. Vercel counts api/*.js as serverless functions and the Hobby plan
//      allows 12. _lib/ is excluded by the underscore, so a helper that
//      lives here can never become a thirteenth -- and
//      scripts/stage6-apply-test.mjs now imports from a file that cannot be
//      merged, renamed or consolidated out from under it.
// ===========================================================================

// A PDF is "%PDF-" then a version, and ends with %%EOF. Checking both ends
// rejects a file that merely starts with the right five bytes.
export function looksLikePdf(buffer) {
  if (buffer.length < 32) return false;

  const header = buffer.subarray(0, 8).toString("latin1");
  if (!/^%PDF-\d\.\d/.test(header)) return false;

  // %%EOF is at the end, but a generous window, because the cost of the two
  // mistakes is not symmetric. A junk file that gets through is caught by
  // the header check and by the recruiter opening it; a real candidate's
  // resume wrongly refused is an application that is simply lost, and
  // neither they nor we would ever know why. Signing tools and some
  // generators append data after the final %%EOF, so the last 64 KB is the
  // window rather than the last few hundred bytes.
  const tail = buffer.subarray(Math.max(0, buffer.length - 65536)).toString("latin1");
  return tail.includes("%%EOF");
}
