import { trackEvent } from "../analytics";
import { Link } from "react-router-dom";
import TrendingQuestionCard from "./TrendingQuestionCard";
import CyclingBrandHeading from "./CyclingBrandHeading";
import FeatureCard from "./FeatureCard";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ChatIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function BriefcaseIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function PeopleIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MailIcon(props) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

const ACTION_ITEMS = [
  {
    key: "jobs",
    title: "Explore GCC Jobs",
    description:
      "Discover the latest job openings across Global Capability Centers in India",
    linkLabel: "Browse latest jobs",
    Icon: BriefcaseIcon,
    accent: "blue",
    to: "/jobs",
  },
  {
    key: "join",
    title: "Join the Community",
    description:
      "You're not the only one figuring out a GCC career. Join a community that has your back - learn, share, and grow together.",
    linkLabel: "Join the community",
    Icon: PeopleIcon,
    accent: "green",
    to: "/signup",
  },
  {
    key: "questions",
    title: "Ask, Answer & Connect",
    description:
      "Have a GCC-related question? Ask the community or join an existing conversation.",
    linkLabel: "Ask a question",
    Icon: ChatIcon,
    accent: "purple",
    to: "/questions",
  },
];

const BENEFITS = [
  {
    key: "professionals",
    Icon: PeopleIcon,
    accent: "blue",
    title: "Grow Your GCC Career",
    description:
      "Connect with GCC professionals to learn, share, and grow together.",
  },
  {
    key: "jobs",
    Icon: BriefcaseIcon,
    accent: "purple",
    title: "Discover the Latest GCC Jobs",
    description: "Get notified the moment new GCC jobs are added.",
  },
  {
    key: "insights",
    Icon: ChatIcon,
    accent: "green",
    title: "Resolve Your GCC Queries",
    description:
      "Ask the community about GCC salaries, hikes, offers, and more.",
  },
  {
    key: "newsletter",
    Icon: MailIcon,
    accent: "orange",
    title: "Get the Weekly GCC Newsletter",
    description: "GCC news, insights, and trends - straight to your inbox.",
  },
];

const BENEFIT_ACCENT_CLASSES = {
  blue: "bg-blue-100 text-blue-600",
  purple: "bg-purple-100 text-purple-600",
  green: "bg-green-100 text-green-600",
  orange: "bg-orange-100 text-orange-600",
};

function Header() {
  const handleExploreJobs = () => {
    trackEvent("explore_jobs_clicked");
  };

  const handleJoinCommunity = () => {
    trackEvent("join_community_clicked");
  };

  const handleAskAnswerConnect = () => {
    trackEvent("ask_answer_connect_clicked");
  };

  const handlers = {
    join: handleJoinCommunity,
    questions: handleAskAnswerConnect,
    jobs: handleExploreJobs,
  };

  return (
    <div>

      {/* Hero + feature cards */}
      <section className="flex flex-col gap-10 pb-10 pt-8 sm:pt-10 md:grid md:grid-cols-2 md:gap-x-12 md:gap-y-14 md:pb-14 md:pt-12">

        {/* Left column */}
        <div className="order-1 text-center md:self-center md:text-left">

          <CyclingBrandHeading
            phraseClassName="text-sm font-medium tracking-wide text-slate-500 sm:text-base"
            headingClassName="mt-2 text-4xl font-extrabold leading-tight tracking-tight text-blue-600 sm:text-5xl md:text-6xl"
            srOnlySuffix="GCC Jobs, Community Q&A & Career Insights for India's Global Capability Centers"
          />

          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg md:mx-0">
            Connect with GCC professionals. Ask questions. Get career
            insights. Discover GCC jobs.
          </p>

          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start">
            <Link
              to="/signup"
              onClick={handleJoinCommunity}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg sm:w-auto sm:text-base"
            >
              <PeopleIcon width={18} height={18} />
              Join the Community
            </Link>

            <Link
              to="/questions"
              onClick={handleAskAnswerConnect}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3 text-sm font-semibold text-blue-700 transition hover:-translate-y-0.5 hover:bg-blue-50 sm:w-auto sm:text-base"
            >
              <ChatIcon width={18} height={18} />
              Ask, Answer &amp; Connect
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 md:justify-start">
            <PeopleIcon
              width={18}
              height={18}
              className="hidden shrink-0 text-slate-400 md:block"
            />
            <span>
              Thousands of GCC professionals are part of iWorkAtGCC
              community.
            </span>
          </div>

        </div>

        {/* Right column — trending questions (below feature cards on mobile/tablet) */}
        <div className="order-3 mx-auto w-full max-w-sm md:order-2 md:self-center">
          <TrendingQuestionCard />
        </div>

        {/* Feature cards */}
        <div className="order-2 md:order-3 md:col-span-2">
        <div className="grid gap-5 md:grid-cols-3 md:gap-6">
          {ACTION_ITEMS.map((item) => (
            <FeatureCard
              key={item.key}
              icon={item.Icon}
              accent={item.accent}
              title={item.title}
              description={item.description}
              linkLabel={item.linkLabel}
              onClick={handlers[item.key]}
              to={item.to}
            />
          ))}
        </div>
        </div>

      </section>

      {/* Community Benefits */}
      <section className="rounded-3xl border border-slate-200/70 bg-white px-6 py-8 shadow-sm shadow-slate-200/50 sm:px-10 sm:py-10">

        <h2 className="text-center text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Community Benefits
        </h2>

        <div className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-2 md:grid-cols-4">
          {BENEFITS.map((benefit) => (
            <div key={benefit.key} className="text-center sm:text-left">
              <div className="flex flex-col items-center gap-2 sm:min-h-[3rem] sm:flex-row sm:items-start sm:gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${BENEFIT_ACCENT_CLASSES[benefit.accent]}`}
                >
                  <benefit.Icon width={18} height={18} />
                </div>

                <p className="text-sm font-bold leading-snug text-slate-900 sm:pt-2">
                  {benefit.title}
                </p>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            to="/signup"
            onClick={handleJoinCommunity}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg sm:w-auto sm:text-base"
          >
            <PeopleIcon width={18} height={18} />
            Join the Community
          </Link>
        </div>

      </section>

      {/* Bottom thank-you card */}
      <div className="mt-8 rounded-2xl bg-indigo-50/70 px-5 py-3 text-center sm:px-7">

        <p className="text-sm leading-6 text-slate-600 sm:text-base">
          Thank you to every community member who has helped build
          iWorkAtGCC.
          <br className="hidden sm:block" />
          This community and platform exist because of you. ❤️
        </p>

      </div>

    </div>
  );
}

export default Header;
