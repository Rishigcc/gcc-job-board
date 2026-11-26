// ===========================================================================
// Clearing a candidate's resume folder.
//
// Under api/_lib/ rather than api/: Vercel does not route paths beginning
// with an underscore, so this is importable server code and not an endpoint.
// It exports no handler, so it would do nothing even if that changed.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//   Deletion means the folder is empty, NOT that the file named in
//   candidate_resumes is gone.
//
//   Deleting by row name can only ever be as reliable as the row, and the row
//   can be missing for reasons no error handling can prevent:
//
//     - the upload succeeded and the function died before the row was
//       written -- a timeout or an evicted instance leaves no process to run
//       a cleanup
//     - the row was replaced and deleting the superseded file failed. That
//       failure is deliberately non-fatal, because the new resume is already
//       live and failing the request would tell a candidate their upload did
//       not work when it did
//     - two uploads landed at once, so the losing file is referenced by
//       nothing and was never the "previous" path either
//
//   Three such files existed in production on 19 Nov 2026, from the window
//   before migration 009 granted the service key write access: every upload
//   orphaned a file because every row write failed with 42501.
//
//   So an orphan is not an error state to be prevented. It is a state that
//   will occur, which means deletion has to be defined by the end state of
//   the folder rather than by what we believe is in it.
// ===========================================================================

const PAGE = 100;
const MAX_PAGES = 100; // 10,000 objects in one folder is already impossible

// Returns { removed: [paths] } or { error }. Never throws.
export async function clearResumeFolder(admin, bucket, userId) {
  const prefix = `${userId}/`;
  const paths = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(userId, { limit: PAGE, offset: page * PAGE });

    if (error) return { error };

    const entries = data || [];

    for (const entry of entries) {
      // A null id is a prefix placeholder, not an object. Our paths are flat
      // -- <uid>/<timestamp>-<uuid>.pdf -- so this should never appear, and
      // it could not be passed to remove() if it did.
      if (!entry?.name || entry.id === null) continue;

      // A listed entry is a bare filename. Anything containing a slash is
      // not something this folder produced, and `prefix + name` would still
      // pass a startsWith check -- "<uid>/../other.pdf" begins with
      // "<uid>/". Storage keys are literal strings rather than paths, so
      // that could not reach another candidate's object anyway, but refusing
      // it is cheaper than relying on that being true of every backend
      // forever.
      if (entry.name.includes("/")) continue;

      const full = prefix + entry.name;

      // Belt and braces. The service key can delete any object in the
      // bucket, so this function refuses rather than trusting that the
      // listing it just asked for came back with the prefix it asked about.
      if (!full.startsWith(prefix)) continue;

      paths.push(full);
    }

    // A short page is the last page. Paginating matters less for the one or
    // two files a folder really holds than for the guarantee: a deletion
    // that silently stopped at 100 would only show up on the one account
    // where it mattered.
    if (entries.length < PAGE) break;
  }

  if (paths.length === 0) return { removed: [] };

  const { error: removeError } = await admin.storage.from(bucket).remove(paths);
  if (removeError) return { error: removeError };

  return { removed: paths };
}
