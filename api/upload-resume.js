import { createClient } from "@supabase/supabase-js";

// ===========================================================================
// POST /api/upload-resume
//
// WHY THIS IS A SERVER FUNCTION AND NOT A DIRECT STORAGE UPLOAD
//   The brief asks for the actual file type to be validated server-side, not
//   the extension. Nothing the browser sends can do that:
//
//     the filename       chosen by whoever uploads
//     the Content-Type   chosen by whoever uploads
//     the bucket's
//     allowed_mime_types compares against that same chosen Content-Type
//
//   So a .exe renamed to .pdf and sent as application/pdf passes every one
//   of those. The only honest check is to look at the bytes, and that has to
//   happen somewhere the uploader does not control.
//
//   This function reads the body, checks it begins with %PDF- and contains a
//   trailer, and only then writes it with the service key. The `resumes`
//   bucket has no storage policies at all, so this is the only way in.
//
// WHAT IT TRUSTS
//   Nothing from the client except the bearer token, which is verified
//   against Supabase before anything else happens. The destination path is
//   built here from the verified user id -- it is never accepted as input,
//   so one candidate cannot write into another's folder.
// ===========================================================================

export const config = {
  api: { bodyParser: false },
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, matching the bucket's limit
const BUCKET = "resumes";

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;

      // Stop reading rather than buffering a file we are going to refuse.
      if (total > MAX_BYTES + 1024) {
        reject(Object.assign(new Error("too large"), { tooLarge: true }));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("upload-resume: missing Supabase configuration");
    return res.status(500).json({ error: "Server not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in before uploading a resume." });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Your session has expired. Sign in again." });
  }

  const userId = userData.user.id;

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    if (err.tooLarge) {
      return res.status(413).json({ error: "That file is larger than 2 MB." });
    }
    console.error("upload-resume: body read failed", err);
    return res.status(400).json({ error: "The upload did not complete. Try again." });
  }

  if (body.length === 0) {
    return res.status(400).json({ error: "No file was received." });
  }

  if (body.length > MAX_BYTES) {
    return res.status(413).json({ error: "That file is larger than 2 MB." });
  }

  if (!looksLikePdf(body)) {
    return res.status(415).json({
      error:
        "That file is not a PDF. Renaming a document to .pdf does not " +
        "convert it — export or print it as a PDF and try again.",
    });
  }

  // Built here, from the verified user id. Never taken from the request.
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("upload-resume: storage upload failed", uploadError);
    return res.status(502).json({ error: "The resume could not be stored. Try again." });
  }

  // The path only. No signed URL: nothing in this stage needs to read the
  // file back, and a URL handed to the browser is a URL that can be shared.
  return res.status(200).json({ path });
}
