import PolicyLayout from "../components/PolicyLayout";

// NOTE: this page describes the finished job board, including the application
// and delete-my-data flows built in stages 6-8. It must not reach production
// before those stages exist.
const LAST_UPDATED = "16 November 2026";

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
        and answers you post, and which posts you have saved or liked.
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
          <strong>Recruiter records:</strong> for as long as the account
          exists, and afterwards only what we need to keep for tax and legal
          reasons.
        </li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        There is a <strong>Delete my data</strong> option in your profile. You
        can also email{" "}
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> and we
        will do it for you. Here is exactly what happens, because the two
        halves are different:
      </p>
      <ul>
        <li>
          <strong>Your resume files are permanently deleted</strong> from our
          storage. This cannot be undone.
        </li>
        <li>
          <strong>
            Your applications are anonymised rather than removed.
          </strong>{" "}
          Your name, experience, location, notice period and the link to your
          resume are stripped out. What remains is that an application existed
          and when. We do this so a recruiter part-way through hiring is not
          left with a broken record. Once anonymised, neither we nor the
          recruiter can link that application back to you.
        </li>
        <li>
          Your community account, questions and answers are removed on request
          as a separate step — tell us if you want both.
        </li>
      </ul>
      <p>
        You can also just replace or delete your resume on its own, from your
        profile, without deleting anything else. Note that an application
        already submitted keeps the exact file the recruiter was given;
        replacing your profile resume does not reach back into past
        applications.
      </p>

      <h2>Withdrawing an application</h2>
      <p>
        You can withdraw any application from your dashboard. The recruiter
        stops seeing it as active. We keep a record that it was withdrawn.
      </p>

      <h2>If you are a recruiter</h2>
      <p>
        We store your name, work email address and its domain, company name,
        website, phone number, and your GSTIN if you send it to us for
        verification. Your company name is shown publicly on the roles you
        post, and to candidates who apply to them. Your email address and
        phone number are not shown publicly.
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
