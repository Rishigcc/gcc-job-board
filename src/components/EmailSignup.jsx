import { useState } from "react";

const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbz4_onOCW_RAXOpJrrQpembB20dGUP808zVy-8CcqRg6Spocwd6BdpYLjfX24HRKRN9BA/exec";

function EmailSignup() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    const cleanedEmail = email.trim().toLowerCase();

    if (!cleanedEmail) {
      setError("Please enter your email.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify({
          email: cleanedEmail,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSubmitted(true);
      } else if (data.duplicate) {
        setAlreadySubscribed(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted || alreadySubscribed) {
    return (
      <div className="mb-8 rounded-2xl border border-green-200 bg-green-50 px-6 py-6 text-center">
        <h3 className="text-xl font-bold text-green-700">
          {alreadySubscribed
            ? "😊 You're already subscribed!"
            : "✅ You're in!"}
        </h3>

        <p className="mt-2 text-slate-700">
          We'll notify you whenever new GCC jobs go live.
        </p>
      </div>
    );
  }

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

      {error && (
        <p className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default EmailSignup;