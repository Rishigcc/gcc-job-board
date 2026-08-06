function LoadingCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
      <div className="text-5xl mb-4">⏳</div>

      <h2 className="text-2xl font-bold text-slate-800">
        Loading latest GCC jobs...
      </h2>

      <p className="text-slate-500 mt-3">
        Fetching the newest opportunities across Global Capability Centers.
      </p>
    </div>
  );
}

export default LoadingCard;