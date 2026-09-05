import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { saveDisplayName } from "../lib/useDisplayName";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";

function Profile() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");

  const [askedCount, setAskedCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select("google_display_name, google_email, display_name")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading profile:", error);
      } else {
        setName(data?.google_display_name || "");
        setEmail(data?.google_email || "");
        setDisplayName(data?.display_name || "");
        setDisplayNameInput(data?.display_name || "");
      }

      const [askedResult, savedResult] = await Promise.all([
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("question_saves")
          .select("question_id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (askedResult.error) {
        console.error("Error loading asked count:", askedResult.error);
      } else {
        setAskedCount(askedResult.count || 0);
      }

      if (savedResult.error) {
        console.error("Error loading saved count:", savedResult.error);
      } else {
        setSavedCount(savedResult.count || 0);
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();

    setSaving(true);
    setMessage("");

    const result = await saveDisplayName(userId, displayNameInput);

    if (result.error) {
      setMessageType("error");
      setMessage(result.error);
      setSaving(false);
      return;
    }

    setDisplayName(result.displayName);
    setDisplayNameInput(result.displayName);
    setMessageType("success");
    setMessage("Display name updated!");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <SiteHeader />

      <section className="mx-auto max-w-lg px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">

        <div className="text-center">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Your Profile
          </h1>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">

          {loading ? (
            <p className="text-center text-slate-600">Loading...</p>
          ) : (
            <div className="space-y-5">

              <div>
                <label className="block text-sm font-semibold text-slate-800">
                  Name
                </label>

                <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                  {name || "—"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800">
                  Email
                </label>

                <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                  {email || "—"}
                </p>
              </div>

              <form onSubmit={handleSave}>
                <label
                  htmlFor="displayNameInput"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Display Name
                </label>

                <input
                  id="displayNameInput"
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Choose a display name for the community"
                  maxLength={20}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <p className="mt-2 text-xs text-slate-500">
                  Shown publicly next to your questions and answers. 3–20
                  characters.
                </p>

                <button
                  type="submit"
                  disabled={saving || displayNameInput.trim() === displayName}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:text-base"
                >
                  {saving ? "Saving..." : "Save Display Name"}
                </button>

                {message && (
                  <p
                    className={`mt-3 text-center text-sm ${
                      messageType === "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {message}
                  </p>
                )}
              </form>

            </div>
          )}

        </div>

        {!loading && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => navigate("/profile/asked")}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm transition hover:bg-slate-50"
            >
              <div className="text-3xl font-bold text-slate-900">
                {askedCount}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                Questions Asked
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/profile/saved")}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm transition hover:bg-slate-50"
            >
              <div className="text-3xl font-bold text-slate-900">
                {savedCount}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                Questions Saved
              </div>
            </button>
          </div>
        )}

      </section>

      <Footer />

    </div>
  );
}

export default Profile;
