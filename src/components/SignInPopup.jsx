import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { setPostLoginRedirect } from "../lib/postLoginRedirect";

function SignInPopup({ onClose, redirectState }) {
  const navigate = useNavigate();
  const location = useLocation();
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSignIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPostLoginRedirect(location.pathname, redirectState);
    navigate("/signup", { state: { mode: "signin" } });
  };

  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      ref={popupRef}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:z-10 sm:mt-2 sm:w-60 sm:max-w-none sm:translate-x-0 sm:translate-y-0"
    >
      <p className="text-sm text-slate-700">
        Sign in or join the community to continue.
      </p>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSignIn}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Sign in
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default SignInPopup;
