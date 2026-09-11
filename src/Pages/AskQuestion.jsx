import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useDisplayName } from "../lib/useDisplayName";
import { slugify, generateUniqueSlug } from "../lib/slug";
import { TAG_OPTIONS, suggestTags } from "../lib/tags";
import Footer from "../components/Footer";
import SiteHeader from "../components/SiteHeader";
import Seo from "../components/Seo";

function AskQuestion() {
  const navigate = useNavigate();

  const {
    userId,
    loading: profileLoading,
    existingDisplayName,
    displayNameInput,
    setDisplayNameInput,
    ensureDisplayName,
  } = useDisplayName();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState([]);
  const [tagsTouched, setTagsTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const refreshSuggestedTags = () => {
    if (tagsTouched) return;
    setTags(suggestTags(`${title} ${description}`));
  };

  const toggleTag = (tag) => {
    setTagsTouched(true);
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      setMessage("Please fill in both the title and description.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const { error: displayNameError } = await ensureDisplayName();

    if (displayNameError) {
      setMessage(displayNameError);
      setSubmitting(false);
      return;
    }

    const baseSlug = slugify(title);
    let slug = await generateUniqueSlug(baseSlug);
    let attempts = 0;
    let insertError = null;

    while (attempts < 3) {
      const { error } = await supabase.from("questions").insert({
        user_id: userId,
        title: title.trim(),
        description: description.trim(),
        slug,
        tags,
      });

      insertError = error;

      if (!error) break;

      if (error.code === "23505" && error.message?.includes("slug")) {
        attempts += 1;
        slug = await generateUniqueSlug(baseSlug);
        continue;
      }

      break;
    }

    if (insertError) {
      console.error("Error posting question:", insertError);
      setMessage("Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    navigate("/questions", { state: { posted: true } });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <Seo
        title="Ask a Question | iWorkAtGCC"
        description="Ask the GCC community a question."
        path="/ask"
        noindex
      />

      <SiteHeader />


      {/* Ask a Question Card */}
      <section className="mx-auto max-w-lg px-4 pb-12 pt-5 sm:px-6 sm:pb-14 sm:pt-6">

        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">

          {/* Title */}
          <div className="text-center">

            <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
              Ask, Answer & Connect
            </h1>

            <p className="mt-3 text-sm text-slate-600 sm:text-base">
              Have a question about salaries, hike %, or your GCC career?
              Post it to the community.
            </p>

          </div>


          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">

            {!profileLoading && !existingDisplayName && (
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Display Name
                </label>

                <input
                  id="displayName"
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Choose a display name for the community"
                  maxLength={20}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <p className="mt-2 text-xs text-slate-500">
                  This is shown publicly next to your questions. You only
                  need to set this once.
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="title"
                className="block text-sm font-semibold text-slate-800"
              >
                Title
              </label>

              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={refreshSuggestedTags}
                placeholder="e.g. What's a good hike % when switching GCCs?"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-semibold text-slate-800"
              >
                Description
              </label>

              <textarea
                id="description"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={refreshSuggestedTags}
                placeholder="Add any context that will help the community answer you."
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {(title.trim() || description.trim()) && (
              <div>
                <label className="block text-sm font-semibold text-slate-800">
                  Tags
                </label>

                <p className="mt-1 text-xs text-slate-500">
                  We suggest a few tags based on what you wrote — tap to add
                  or remove any.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((tag) => {
                    const selected = tags.includes(tag);

                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || profileLoading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 sm:text-base"
            >
              {submitting ? "Posting..." : "Post Question"}
            </button>

          </form>

          {message && (
            <p className="mt-4 text-center text-sm text-slate-700">
              {message}
            </p>
          )}

        </div>

      </section>


      {/* Footer */}
      <Footer />

    </div>
  );
}

export default AskQuestion;
