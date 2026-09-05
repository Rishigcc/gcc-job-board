import Header from "./components/Header";
import Footer from "./components/Footer";
import SiteHeader from "./components/SiteHeader";

function App() {
  const dotGridStyle = {
    backgroundImage:
      "radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)",
    backgroundSize: "20px 20px",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f8fc] pb-6 text-slate-900">

      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-40 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-[28rem] w-[28rem] rounded-full bg-purple-200/25 blur-3xl" />
        <div
          className="absolute right-10 top-20 hidden h-32 w-44 opacity-40 sm:block"
          style={dotGridStyle}
        />
        <div
          className="absolute bottom-24 left-8 hidden h-28 w-36 opacity-30 sm:block"
          style={dotGridStyle}
        />
      </div>

      <div className="relative">

        <SiteHeader />

        {/* Community appreciation banner */}
        <div className="mx-3 mt-4 rounded-2xl bg-indigo-50/80 px-4 py-3 text-center sm:mx-5 sm:px-6">
          <p className="text-xs font-medium text-slate-600 sm:text-sm">
            <span className="mr-1.5">💜</span>
            Thank you to every community member building iWorkAtGCC. This
            community and platform belongs to you. ❤️
          </p>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          <Header />

          <Footer />

        </div>

      </div>

    </div>
  );
}

export default App;
