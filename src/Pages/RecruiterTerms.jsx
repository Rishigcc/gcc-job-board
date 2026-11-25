import PolicyLayout from "../components/PolicyLayout";

// NOTE: these terms describe the finished job board. They must not reach
// production before the recruiter and applicant stages exist.
const LAST_UPDATED = "16 November 2026";

function RecruiterTerms() {
  return (
    <PolicyLayout
      title="Recruiter Terms — iWorkAtGCC"
      description="The conditions for posting roles on iWorkAtGCC: who may post, account verification, posting limits, and how candidate data must be handled."
      path="/recruiter-terms"
      lastUpdated={LAST_UPDATED}
    >
      <p>
        These are the conditions for posting roles on iWorkAtGCC. By creating a
        recruiter account you agree to them. They are deliberately plain, and
        we do enforce them.
      </p>

      <h2>1. Who may post</h2>
      <ul>
        <li>
          You must sign up with a <strong>work email address</strong>. Free
          email providers — Gmail, Outlook, Yahoo, Rediffmail, Proton, iCloud,
          Zoho and similar — are not accepted. If your company runs its own
          domain through Google Workspace or Zoho, that is fine; we check the
          domain, not the mail provider.
        </li>
        <li>
          You must be authorised to recruit for the roles you post, whether as
          the employer or as an agency acting for them.
        </li>
        <li>
          You must confirm your email address before you can post. We send you
          one link when you sign up.
        </li>
      </ul>

      <h2>2. It is free</h2>
      <p>
        There is currently no charge to post a role or to receive applications.
        If that changes we will tell you well before it does, and never for
        roles already posted.{" "}
        <strong>
          Candidates are never charged anything, by us or by you.
        </strong>
      </p>

      <h2>3. What you may not post</h2>
      <ul>
        <li>
          Any role that asks a candidate for money — a fee, a deposit, a
          training charge, a security amount, anything. This is the one rule we
          suspend accounts for without discussion.
        </li>
        <li>Roles that do not exist, or are already filled.</li>
        <li>
          Requirements based on gender, caste, religion, marital status,
          pregnancy, disability or age, except where Indian law specifically
          permits it.
        </li>
        <li>
          Personal data in the job description, including anyone's name, phone
          number or email address.
        </li>
        <li>
          Misleading pay, location or employer details. If you are an agency,
          the hiring company you name must be the actual employer.
        </li>
        <li>
          The same role posted repeatedly to keep it near the top of the list.
        </li>
      </ul>

      <h2>4. Account verification</h2>
      <p>
        You can post roles and receive applications{" "}
        <strong>immediately</strong>, with no wait and no review. What
        verification controls is access to candidate details.
      </p>
      <ul>
        <li>
          <strong>Before your account is verified</strong> you can see how many
          people applied to each role and on what dates. You cannot see their
          names, email addresses or resumes. That restriction is enforced in
          our database — the information is not sent to your browser at all.
        </li>
        <li>
          <strong>To get verified</strong>, reply to the email we send when you
          sign up with your company website and your GSTIN. We aim to verify
          within two working days of your reply.
        </li>
        <li>
          <strong>Once verified</strong>, you can see each applicant's name,
          current location, total experience and notice period, and download
          their resume.
        </li>
        <li>
          We may ask for more information, and we may decline to verify an
          account without giving a reason.
        </li>
      </ul>

      <h2>5. Posting limits</h2>
      <p>
        An unverified account may hold a maximum of{" "}
        <strong>10 live roles at a time</strong>. Closing or letting a role
        expire frees up a slot. Verified accounts have no limit. This exists to
        keep the board useful, since we do not review postings before they go
        live.
      </p>

      <h2>6. How long a role stays live</h2>
      <ul>
        <li>
          A posting is live for <strong>30 days</strong>, then expires on its
          own.
        </li>
        <li>You can edit it or close it early at any time.</li>
        <li>
          An expired or closed role stops appearing in search results and
          stops being listed with search engines, as they require. Candidates
          who applied see it marked as closed.
        </li>
      </ul>

      <h2>7. Candidate data — your obligations</h2>
      <p>
        When we release an applicant's details to you, you become responsible
        for them under Indian data protection law. You agree that:
      </p>
      <ul>
        <li>
          You will use them <strong>only</strong> to assess that candidate for{" "}
          <strong>that role</strong>.
        </li>
        <li>
          You will not share, sell, publish or transfer them to anyone else,
          including other parts of your own group, without the candidate's
          agreement.
        </li>
        <li>
          You will not add the candidate to a mailing list, a talent pool or
          any database for future use.
        </li>
        <li>
          You will not contact them about anything other than that role.
        </li>
        <li>
          You will delete their details once you no longer need them for that
          role.
        </li>
        <li>
          If a candidate asks us to delete their data, we will, and you must
          delete your own copies too if we ask you to.
        </li>
      </ul>

      <h2>8. What is shown publicly</h2>
      <p>
        Your company name is shown to candidates on the detail page of every
        role you post, and when they apply, so they know who receives their
        resume. The hiring company you name is shown on the listing. Your email
        address and phone number are never shown publicly.
      </p>

      <h2>9. Our rights</h2>
      <ul>
        <li>
          We may hide any posting, at any time, without notice, including for
          reasons not listed above.
        </li>
        <li>
          We may suspend an account, which hides all of that account's roles at
          once.
        </li>
        <li>
          We may remove or decline to verify an account, and we are not
          obliged to explain why.
        </li>
      </ul>

      <h2>10. What we do not promise</h2>
      <p>
        We do not guarantee that a role will receive applications, or
        applications of any particular quality. We are not a party to your
        hiring decisions, we do not screen or endorse candidates, and we do not
        verify what a candidate tells you. The service is provided as is.
      </p>

      <h2>11. Changes and governing law</h2>
      <p>
        We may update these terms; the date at the top changes when we do, and
        continuing to use the account means accepting them. These terms are
        governed by the laws of India.
      </p>

      <h2>12. Contact</h2>
      <p>
        <a href="mailto:jobs@iworkatgcc.com">jobs@iworkatgcc.com</a> — for
        verification, account questions and anything about a posting. A real
        person reads it.
      </p>

      <p>
        See also our <a href="/privacy">privacy policy</a>, which explains what
        candidates are told about how their data is handled.
      </p>
    </PolicyLayout>
  );
}

export default RecruiterTerms;
