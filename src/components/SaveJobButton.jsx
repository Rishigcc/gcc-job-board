import SignInPopup from "./SignInPopup";

// ===========================================================================
// The Save control on a role.
//
// Visually and behaviourally the same button as the one on a question card:
// a bookmark that fills when saved, the word changing between Save and
// Saved, a brief "Saved" flash, and a sign-in popup for someone who is not
// signed in. Presentational only -- every piece of state is owned by
// useJobSaves, so the card and the detail page share one source of truth
// about what is saved.
//
// redirectPath EXISTS BECAUSE OF THE FILTERS
//   /gcc-jobs keeps its search and filters in the query string, so returning
//   someone to location.pathname after sign-in would drop the list they were
//   looking at. The popup takes the full path instead.
// ===========================================================================

function SaveJobButton({
  jobId,
  saved,
  justSaved,
  showPopup,
  onToggle,
  onClosePopup,
  redirectPath,
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => onToggle(e, jobId)}
        aria-pressed={saved}
        aria-label={saved ? "Remove this role from your saved list" : "Save this role for later"}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition hover:bg-slate-100 ${
          saved ? "text-blue-600" : "text-slate-500"
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z" />
        </svg>
        <span>{saved ? "Saved" : "Save"}</span>
      </button>

      {justSaved && (
        <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
          Saved
        </span>
      )}

      {showPopup && <SignInPopup path={redirectPath} onClose={onClosePopup} />}
    </div>
  );
}

export default SaveJobButton;
