// ===========================================================================
// Typed confirmations, in one place.
//
// WHY THIS FILE EXISTS
//   Three irreversible actions ask the operator to type a word. The words and
//   the comparison were duplicated across six places, and that is exactly how
//   the defect below happened: the comparison was correct in one copy and had
//   a transformation added to the others.
//
//     /api/delete-my-data          "DELETE MY DATA"   exact        (correct)
//     /api/admin-delete-orphan     "DELETE"           .toUpperCase (WRONG)
//     /api/admin-anonymise         "ANONYMISE"        .toUpperCase (WRONG)
//
//   Those two admin paths no longer exist: both became actions on
//   /api/admin on 25 Nov 2026, when the project hit Vercel's 12-function
//   limit. The paths are left as written because this is a record of a
//   defect as it was, not a map of the current routes -- and the lesson
//   survives the rename. The two confirmations are now constants in the same
//   file, which is a new way to cross them and is why they are bound to
//   separate names there.
//
//   Typing lower-case `delete` enabled the button and the server accepted it,
//   so an orphaned file was deleted on a confirmation that did not match its
//   own label. On the anonymise panel the same defect sat in front of erasing
//   a real person's data.
//
//   Imported by both the pages and the endpoints, so there is now one
//   comparison rather than six. api/ reaching into src/lib is unusual, and
//   deliberate: this module is plain ESM with no browser dependency, and the
//   alternative is two copies of the one thing that must not vary.
//
// THE RULE: TRIM, NEVER FOLD CASE.
//   A typed confirmation is a deliberate-effort check. Accepting `delete` for
//   `DELETE` halves the effort and makes the label a lie -- it says type
//   DELETE, and anything that accepts something else is not doing what it
//   claims. Leading and trailing whitespace is forgiven because it is an
//   artefact of selecting and pasting, not a reduction in deliberateness.
// ===========================================================================

export const CONFIRM_DELETE_MY_DATA = "DELETE MY DATA";
export const CONFIRM_ORPHAN_DELETE = "DELETE";
export const CONFIRM_ANONYMISE = "ANONYMISE";

export function confirmed(typed, expected) {
  if (typeof typed !== "string" || typeof expected !== "string") return false;
  if (expected.length === 0) return false;

  // Exact, after trimming. No case folding, no prefix matching -- "DELETE" is
  // not a confirmation for "DELETE MY DATA" and must not become one.
  return typed.trim() === expected;
}
