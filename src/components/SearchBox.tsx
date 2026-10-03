export function SearchBox({ defaultValue = "", size = "lg" }: { defaultValue?: string; size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <form action="/results" method="get" className="flex w-full gap-2" role="search">
      <label htmlFor="q" className="sr-only">
        Disease, gene, variant, symptom, or mechanism
      </label>
      <input
        id="q"
        name="q"
        defaultValue={defaultValue}
        required
        placeholder="Disease, gene, variant, symptom, or mechanism"
        className={`flex-1 rounded-lg border border-line bg-white px-4 shadow-sm outline-none focus:border-ink ${big ? "py-3 text-lg" : "py-2"}`}
      />
      <button type="submit" className={`rounded-lg bg-ink px-5 font-medium text-white hover:opacity-90 ${big ? "py-3" : "py-2"}`}>
        Search
      </button>
    </form>
  );
}
