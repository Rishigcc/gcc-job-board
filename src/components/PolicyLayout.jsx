import SiteHeader from "./SiteHeader";
import Footer from "./Footer";
import Seo from "./Seo";

// Shared shell for the privacy policy and recruiter terms, so each page file
// holds content and nothing else.
function PolicyLayout({ title, description, path, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo title={title} description={description} path={path} />

      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          {title.replace(" — iWorkAtGCC", "")}
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Last updated {lastUpdated}
        </p>

        <div
          className="mt-8 space-y-7 text-[15px] leading-relaxed text-slate-700
            [&_a]:text-blue-600 [&_a]:underline
            [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900
            [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-900
            [&_li]:mb-1.5
            [&_strong]:font-semibold [&_strong]:text-slate-900
            [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
        >
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default PolicyLayout;
