function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-10 flex-wrap">

      <button
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        disabled={currentPage === 1}
        className="px-4 py-2 rounded-xl border bg-white disabled:opacity-40 hover:bg-slate-50"
      >
        ← Previous
      </button>

      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((page) => {
          return (
            page === 1 ||
            page === totalPages ||
            Math.abs(page - currentPage) <= 1
          );
        })
        .map((page, index, pages) => {
          const previousPage = pages[index - 1];

          return (
            <div key={page} className="flex items-center">

              {previousPage && page - previousPage > 1 && (
                <span className="px-2 text-slate-500">...</span>
              )}

              <button
                onClick={() => onPageChange(page)}
                className={`w-10 h-10 rounded-xl border transition ${
                  currentPage === page
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white hover:bg-slate-50"
                }`}
              >
                {page}
              </button>

            </div>
          );
        })}

      <button
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        disabled={currentPage === totalPages}
        className="px-4 py-2 rounded-xl border bg-white disabled:opacity-40 hover:bg-slate-50"
      >
        Next →
      </button>

    </div>
  );
}

export default Pagination;
