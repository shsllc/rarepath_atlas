/** Search form. `view` keeps the reader's chosen view (family or research) across searches. */
export function SearchBox({ defaultValue = "", size = "lg", view }: { defaultValue?: string; size?: "lg" | "sm"; view?: "family" | "research" }) {
  const big = size === "lg";
  return (
    <form action="/results" method="get" role="search" className={`flex w-full items-center gap-2 rounded-full border-2 border-ink/80 bg-white shadow-[0_10px_30px_-18px_rgba(24,32,51,.45)] focus-within:border-brand ${big ? "p-1.5 pl-5" : "p-1 pl-4"}`}>
      <label htmlFor="q" className="sr-only">
        Disease, gene, variant or symptom
      </label>
      <svg aria-hidden width={big ? 20 : 16} height={big ? 20 : 16} viewBox="0 0 24 24" className="shrink-0 text-muted">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        id="q"
        name="q"
        defaultValue={defaultValue}
        required
        placeholder={big ? "Type a diagnosis, gene or symptom" : "Search a disease, gene or symptom"}
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/80 ${big ? "py-2.5 text-lg" : "py-1.5"}`}
      />
      {view && <input type="hidden" name="view" value={view} />}
      <button type="submit" className={`shrink-0 rounded-full bg-coral font-semibold text-white transition hover:bg-coral-deep ${big ? "px-6 py-3" : "px-4 py-2 text-sm"}`}>
        {big ? (
          <>
            <span className="sm:hidden">Search</span>
            <span className="hidden sm:inline">Find research</span>
          </>
        ) : (
          "Search"
        )}
      </button>
    </form>
  );
}
