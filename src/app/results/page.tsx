import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { ResultsView } from "@/components/ResultsView";
import { PartialDiseaseView } from "@/components/CoverageSections";
import { getServices } from "@/lib/services/registry";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ q?: string; demo?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const result = q ? await getServices().search.search(q) : null;

  return (
    <div>
      <SearchBox defaultValue={q} size="sm" />
      <div className="mt-6">
        {!result && <p className="text-muted">Enter a disease, gene, variant, symptom or mechanism.</p>}
        {result && "partial" in result && <PartialDiseaseView result={result} />}
        {result && !result.found && !("partial" in result) && (
          <div className="rounded-xl border border-dotted border-unknown bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">No supported connection found</p>
            <p className="mt-2">{result.message}</p>
            <p className="mt-2 text-sm text-muted">&ldquo;No supported connection&rdquo; is a real answer: we only show links we can trace to a source.</p>
            {result.suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {result.suggestions.map((s) => (
                  <Link key={s} href={`/results?q=${encodeURIComponent(s)}`} className="rounded-full border border-line px-3 py-1 hover:border-ink">
                    {s}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        {result && result.found && <ResultsView result={result} demo={sp.demo === "1"} />}
      </div>
    </div>
  );
}
