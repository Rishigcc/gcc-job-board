function Header() {
  return (
    <div className="text-center mb-10 md:mb-14">

      {/* Desktop Heading */}
      <h1 className="hidden md:block text-6xl font-bold text-slate-900 leading-tight max-w-5xl mx-auto">
        The latest job openings across
        <br />
        Global Capability Centers
      </h1>

      {/* Mobile Heading */}
      <h1 className="block md:hidden text-4xl font-bold text-slate-900 leading-tight">
        The latest job openings
        <br />
        across GCCs
      </h1>

      {/* Desktop Subtitle */}
      <p className="hidden md:block mt-6 text-xl text-gray-600 max-w-3xl mx-auto leading-8">
        Explore opportunities at India's leading GCCs across technology,
        finance, analytics, operations, and more.
      </p>

    </div>
  );
}

export default Header;