function Header({ scrollToJobs }) {
  return (
    <div className="text-center pt-8 md:pt-12 pb-12 md:pb-20">

      <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-slate-900">
        iWorkAtGCC
      </h1>

      <p className="mt-5 md:mt-8 text-sm md:text-lg text-slate-600 max-w-3xl mx-auto leading-7 md:leading-8 px-4">
        Thank you to every community member who has helped build iWorkAtGCC.
        <br />
        This community and platform exist because of you. ❤️
      </p>

      <div className="mt-8 md:mt-16 grid md:grid-cols-2 gap-5 md:gap-8 max-w-5xl mx-auto">

        {/* Explore GCC Jobs */}

        <button
          onClick={scrollToJobs}
          className="
            bg-white
            border
            border-slate-200
            rounded-2xl md:rounded-3xl
            p-6 md:p-10
            text-left
            shadow-sm
            cursor-pointer
            hover:bg-blue-50
            hover:border-blue-200
            hover:-translate-y-1
            hover:shadow-xl
            transition
            duration-300
          "
        >

          <h2 className="flex items-center gap-3 text-2xl md:text-3xl font-bold">
            <span className="text-3xl">💼</span>
            Explore GCC Jobs
          </h2>

          <p className="mt-4 md:mt-5 text-sm md:text-base text-slate-600 leading-7">
            Discover the latest job openings across Global Capability Centers.
          </p>

          <div className="mt-5 md:mt-8 font-semibold text-blue-700">
            Browse latest jobs →
          </div>

        </button>

        {/* Join Community */}

        <a
          href="https://www.linkedin.com/company/iworkatgcc/"
          target="_blank"
          rel="noopener noreferrer"
          className="
            block
            bg-white
            border
            border-slate-200
            rounded-2xl md:rounded-3xl
            p-6 md:p-10
            text-left
            shadow-sm
            cursor-pointer
            hover:bg-blue-50
            hover:border-blue-200
            hover:-translate-y-1
            hover:shadow-xl
            transition
            duration-300
          "
        >

          <h2 className="flex items-center gap-3 text-2xl md:text-3xl font-bold text-slate-900">
            <span className="text-3xl">🤝</span>
            Join the Community
          </h2>

          <p className="mt-4 md:mt-5 text-sm md:text-base text-slate-600 leading-7">
            Join thousands of GCC professionals learning, growing and helping each other build better careers.
          </p>

          <div className="mt-5 md:mt-8 font-semibold text-blue-700">
            Join the community →
          </div>

        </a>

      </div>

    </div>
  );
}

export default Header;