import PolicyLayout from "../components/PolicyLayout";

// This page describes the finished job board. The flows it promises now
// exist: applying in stage 6, the verification gate in stage 7, and the
// resume and delete-my-data controls in stage 8.
//
// THREE PARAGRAPHS WERE CORRECTED IN STAGE 8, AND THE REASON IS WORTH
// KEEPING. The policy was written before the code and then the code
// disagreed with it:
//
//   - it said replacing a resume does not reach back into past applications,
//     which stage 6 deliberately reversed
//   - it promised a withdraw feature, which version 1 does not have
//   - its list of what anonymising erases named experience and location,
//     which are not collected, and omitted email and phone, which are
//
// The fix was to make the policy describe what the system does. Where the
// policy was the better design -- "neither we nor the recruiter can link that
// application back to you" -- the code was changed to match it instead, which
// is why candidate_id is erased and not merely hidden.
//
// Corrected again when /profile was stripped back: deleting a resume on its
// own moved to /profile/delete-data, so "from your profile" was no longer
// where that control lived. The policy and the button now also use the same
// name -- "Delete my job board data" -- rather than two names for one thing.
const LAST_UPDATED = "25 November 2026";

function Privacy() {
  return (
    <PolicyLayout
      title="Privacy Policy — iWorkAtGCC"
      description="What iWorkAtGCC collects, who can see it, how long we keep it, and how to have it deleted. We never charge candidates."
      path="/privacy"
      lastUpdated={LAST_UPDATED}
    >
      <p>
        iWorkAtGCC is a community and job board for professionals working at
        India's Global Capability Centres. This page explains what we collect,
        who can see it, how long we keep it, and how to have it removed. It is
        written to be read, not to be skimmed past.
      </p>

      <p>
        <strong>We never charge candidates.</strong> Not to browse, not to
        apply, not to be shortlisted, not for anything. If anyone asks you for
        money in our name, tell us at{" "}
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a>.
      </p>

      <h2>What we collect</h2>

      <h3>When you join the community</h3>
      <p>
        You sign in with Google. We receive your name, email address and
        profile picture from your Google account. We also store the questions
        and answers you post, and which questions you have saved or liked.
      </p>

      <h3>When you save a role</h3>
      <p>
        If you press Save on a role, we store which role it was, your account
        reference and the date. Nothing else, and nobody is told — the
        recruiter cannot see who has saved their role, or how many people
        have. It is a bookmark for you, and you can remove it at any time from
        your profile.
      </p>

      <h3>When you apply for a job</h3>
      <p>At the point you apply, and only then, we collect:</p>
      <ul>
        <li>your resume, as a PDF file</li>
        <li>your total years of experience</li>
        <li>your current location</li>
        <li>your notice period</li>
        <li>the fact that you applied to that role, and the date</li>
      </ul>
      <p>
        That is the whole list. We ask for your consent on the application
        form itself, before any of it is submitted.
      </p>

      <h3>Automatically, as you browse</h3>
      <p>
        Pages viewed, the site or email you arrived from, and basic device and
        browser information. We use this to understand which roles are being
        seen and where applications come from. We do not store your IP address
        against your activity — where we need to tell one visitor from another
        we use a one-way daily code derived from it, which cannot be turned
        back into an address.
      </p>

      <h2>Who can see your application</h2>
      <ul>
        <li>Nobody, until you submit it.</li>
        <li>
          <strong>Only the recruiter who posted that specific role.</strong>{" "}
          Never another recruiter, and never a recruiter at a different
          company.
        </li>
        <li>
          <strong>
            Before we have verified that recruiter's company, they cannot see
            who you are.
          </strong>{" "}
          They are shown how many people applied and on what dates — not your
          name, not your email, not your resume. This is enforced inside our
          database: the information is never sent to them, rather than sent and
          hidden on screen.
        </li>
        <li>
          Once we have verified the company, that recruiter can see your name,
          current location, total experience, notice period, the date you
          applied, and download your resume.
        </li>
        <li>
          Our own team, for support and moderation, and to investigate misuse.
        </li>
      </ul>

      <h2>What recruiters agree to</h2>
      <p>
        Recruiters may use your details only to consider you for the role you
        applied to. They may not share them, sell them, add you to a database,
        or contact you about anything else. Those are binding conditions of our{" "}
        <a href="/recruiter-terms">recruiter terms</a>, and we suspend accounts
        that break them. We cannot, however, undo what someone has already
        downloaded — which is why we verify companies before releasing your
        details at all.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Your community account and posts:</strong> until you ask us
          to remove them.
        </li>
        <li>
          <strong>Applications:</strong> while the role is open, and for up to
          12 months after it closes or expires, so a recruiter can return to a
          shortlist.
        </li>
        <li>
          <strong>Your resume file:</strong> until you replace or delete it.
        </li>
        <li>
          <strong>Saved roles:</strong> until you remove them, until you
          delete your job board data, or until your account is deleted —
          whichever comes first.
        </li>
        <li>
          <strong>Recruiter records:</strong> for as long as the account
          exists, and afterwards only what we need to keep for tax and legal
          reasons.
        </li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        There is a <strong>Delete my job board data</strong> link on your
        profile, which opens a page explaining exactly what it does. You
        can also email{" "}
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> and we
        will do it for you. Here is exactly what happens, because the two
        halves are different:
      </p>
      <ul>
        <li>
          <strong>Your resume file is permanently deleted</strong> from our
          storage. This cannot be undone.
        </li>
        <li>
          <strong>Every role you have saved is deleted</strong>, not
          anonymised. There is nothing in a saved role worth keeping once you
          have asked to be forgotten.
        </li>
        <li>
          <strong>
            Your applications are anonymised rather than removed.
          </strong>{" "}
          Your name, email address, phone number, notice period and the
          reference linking the application to your account are all erased
          from our database — not hidden, erased. What remains is that an
          application was made to that role, and when.
        </li>
        <li>
          Because the account reference is erased too,{" "}
          <strong>
            neither we nor the recruiter can connect that application back to
            you afterwards.
          </strong>{" "}
          That also means it disappears from your own list of applications,
          and we cannot restore it or tell you later what you applied to.
        </li>
        <li>You can apply to the same role again afterwards if you want to.</li>
        <li>
          <strong>
            Your community account, questions, answers and saved questions are
            not touched.
          </strong>{" "}
          They are removed on request as a separate step — email{" "}
          <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> and say
          you want both.
        </li>
      </ul>
      <h2>Your resume</h2>
      <p>
        You keep one resume on iWorkAtGCC, not one per application. Replacing
        it replaces it everywhere — including for roles you applied to
        earlier, because every application points at your current file rather
        than keeping a copy.
      </p>
      <p>
        We do this so you only have to upload once. It means a recruiter may
        open a newer version than the one they first read, so every
        application shows them the date your resume was last updated, and they
        are never handed a changed file without being told.
      </p>
      <p>
        You can replace your resume at any time from your profile. You can
        also delete it on its own, without deleting anything else — that
        option is on the <strong>Delete my job board data</strong> page, which
        your profile links to. Deleting your resume does not withdraw
        anything: recruiters keep the applications you already sent and simply
        see that no resume is attached.
      </p>

      <h2>Can I take an application back?</h2>
      <p>
        Not yet. Once you apply, the recruiter has your application and there
        is no way to un-send it from your side. We would rather say so than
        imply otherwise.
      </p>
      <p>
        What you can do now is <strong>Delete my job board data</strong>,
        above. That strips your name and contact details from every
        application you have sent, permanently deletes your resume file, and
        removes every role you have saved. It is not the same as withdrawing —
        the recruiter keeps an anonymous record that an application was made —
        and it cannot be undone.
      </p>
      <p>
        If you want a recruiter to stop considering you for a specific role,
        email <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> and
        we will pass it on.
      </p>

      <h2>If you are a recruiter</h2>
      <p>
        We store your name, work email address and its domain, company name,
        website, phone number, and your GSTIN if you send it to us for
        verification. Your company name is shown publicly on the roles you
        post, and to candidates who apply to them. Your email address and
        phone number are not shown publicly.
      </p>
      {/* Added 25 Nov 2026, wording approved as drafted. The section above
          said what is stored and nothing about access or deletion, which was
          a gap on the recruiter side regardless of the settings page. It
          commits us to deleting a recruiter account by hand on request —
          accepted explicitly at this volume. The candidate sentence about
          the delete link is NOT changed: it is already candidate-scoped,
          sitting among the candidate sections, and the data it erases is
          data a recruiter cannot have. */}
      <p>
        Your recruiter account is separate from a community account, even if
        you use iWorkAtGCC as both — they are two separate logins. You can see
        and correct what we hold about you from your recruiter settings. To
        delete a recruiter account and its roles, email{" "}
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> and we
        will do it by hand.
      </p>

      <h2>Who else handles your data</h2>
      <p>
        We keep this list short on purpose. Each of these is a company we rely
        on to run the site, and each has its own privacy terms:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — our database, file storage and sign-in.
          Your resume is held in private storage that is not reachable by a
          public link.
        </li>
        <li>
          <strong>Vercel</strong> — hosting.
        </li>
        <li>
          <strong>Brevo</strong> — the emails we send you.
        </li>
        <li>
          <strong>Google Analytics</strong> — which pages are visited.
        </li>
        <li>
          <strong>Microsoft Clarity</strong> — how pages are used, including
          clicks and scrolling. We configure it to mask text typed into forms,
          so what you enter on an application is not recorded.
        </li>
      </ul>
      <p>
        We do not sell your data, and we do not share it with anyone outside
        this list except the recruiter whose role you applied to.
      </p>

      <h2>Cookies and browser storage</h2>
      <p>
        We store your sign-in session in your browser so you stay signed in.
        Google Analytics and Microsoft Clarity set their own cookies. Clearing
        your browser data signs you out and removes them.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us what we hold about you, ask us to correct it, or ask us
        to delete it. Write to{" "}
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> and we
        will respond. We are based in India and handle personal data under
        Indian law.
      </p>

      <h2>Changes to this page</h2>
      <p>
        If we change how any of this works, we update this page and change the
        date at the top. If a change materially affects applications already
        submitted, we will email the people affected.
      </p>

      <h2>Contact</h2>
      <p>
        Job board, applications and recruiters:{" "}
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a>
        <br />
        Community and everything else:{" "}
        <a href="mailto:community@iworkatgcc.com">community@iworkatgcc.com</a>
      </p>
    </PolicyLayout>
  );
}

export default Privacy;
