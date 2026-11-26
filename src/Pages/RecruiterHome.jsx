import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRecruiter } from "../lib/useRecruiter";
import SiteHeader from "../components/SiteHeader";
import Footer from "../components/Footer";
import Seo from "../components/Seo";

// A banner and two buttons. Nothing else, on purpose.
//
// The wording says "account verification" throughout and never "email
// verification": the recruiter has already clicked a confirmation link, and
// calling the next step email verification would read as though that had
// failed.
//
// IT SAID "company verification" UNTIL 25 Nov 2026 (wording item W1). The
// reasoning above is unchanged -- the point was never the word "company", it
// was avoiding "email". What changed is that the thing being verified is the
// ACCOUNT: a recruiter's company is the evidence, and their account is what
// gains access. "Company website" and "the name of your company" are
// untouched, because those genuinely are about the company.
function RecruiterHome() {
  const navigate = useNavigate();
  const { profile } = useRecruiter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/post-a-job", { replace: true });
  };

  const verified = profile.is_verified;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Recruiter Dashboard — iWorkAtGCC"
        description="Post roles and manage your postings on iWorkAtGCC."
        path="/recruiter"
        noindex
      />

      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-bold text-slate-900 sm:text-3xl">
            {profile.company_name}
          </h1>

          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>

        {verified ? (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                Verified
              </span>
              <h2 className="text-base font-bold text-green-900">
                Your account is verified
              </h2>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-green-900">
              You can post roles, and you can see the full details of everyone
              who applies, including their resume. There's no limit on how many
              roles you can have live at once.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <h2 className="text-base font-bold text-amber-900">
              You can start posting right now
            </h2>

            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-amber-900">
              <p>
                Post a role and it goes live immediately. Candidates can apply
                straight away, and nothing is holding that up.
              </p>

              <p>
                <strong className="font-semibold">
                  To see who applied, we need to complete account verification.
                </strong>{" "}
                Until then you'll see how many people applied to each role and
                when — but not their names, email addresses or resumes.
              </p>

              <p>
                Reply to the email we sent you with your{" "}
                <strong className="font-semibold">company website</strong> and{" "}
                <strong className="font-semibold">GSTIN</strong>, and we'll
                verify you within two working days of your reply. You can also
                write to{" "}
                <a
                  href="mailto:jobs@iworkatgcc.com"
                  className="font-semibold underline"
                >
                  jobs@iworkatgcc.com
                </a>
                .
              </p>

              <p className="text-sm">
                While unverified you can have up to 10 roles live at a time.
                Closing a role, or letting one expire, frees up a slot.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            to="/recruiter/jobs/new"
            className="rounded-xl bg-blue-600 px-5 py-4 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Post a new job
          </Link>

          <Link
            to="/recruiter/jobs"
            className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-center text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            My jobs
          </Link>
        </div>

      </main>

      <Footer />
    </div>
  );
}

export default RecruiterHome;
