import { useState } from "react";
import { trackEvent } from "../analytics";

const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycby-obipTzugwyb71muW1ngBasAeiLbRspQSqsf5NCmg_zJRB-rPL7deNrKRFTSSP8dC/exec";

function EmailSignup() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!email.trim()) {
      setMessage("Please enter your email.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await fetch(WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({
          email: email.trim(),
        }),
      });

      trackEvent("email_signup", {
        method: "website",
      });

      setMessage(
        "You're in! We'll notify you whenever new GCC jobs go live."
      );

      setEmail("");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 px-6 py-6 text-center">
      <h3 className="text-lg md:text-xl font-bold text-slate-900">
        📬 Get instantly notified when new GCC jobs go live.
      </h3>

      <div className="mt-5 flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            }
          }}
          className="flex-1 rounded-xl border border-slate-300 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Submitting..." : "Notify Me"}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
    </div>
  );
}

export default EmailSignup;