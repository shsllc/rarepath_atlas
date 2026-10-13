import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { ResultsView } from "@/components/ResultsView";
import { PartialDiseaseView } from "@/components/CoverageSections";
import { DiscoveryPreviewView } from "@/components/DiscoveryPreview";
import { getServices } from "@/lib/services/registry";
import { currentReviewer } from "@/lib/review/http";
import { ProposePanel } from "@/components/review/ProposePanel";
import { cookies } from "next/headers";
import { getWatch, validKey, WATCH_COOKIE } from "@/lib/watch";
import { WatchButton } from "@/components/watch/WatchControls";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ q?: string; demo?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const [result, reviewer] = await Promise.all([q ? getServices().search.search(q) : null, currentReviewer()]);
  const watchKey = (await cookies()).get(WATCH_COOKIE)?.value;
  const watchable = !!result && ("discovery" in result || "partial" in result || result.found);
  const watched = watchable && validKey(watchKey) ? !!(await getWatch(watchKey, q)) : false;

  return (
    <div>
      <SearchBox defaultValue={q} size="sm" />
      {watchable && (
        <div className="mt-3 flex justify-end">
          <WatchButton query={q} watched={watched} />
        </div>
      )}
      <div className="mt-6">
        {!result && <p className="text-muted">Enter a disease, gene, variant, symptom or mechanism.</p>}
        {result && "partial" in result && <PartialDiseaseView result={result} />}
        {result && "partial" in result && result.preview && (
          <div className="mt-6 space-y-4">
            <DiscoveryPreviewView result={{ query: result.query, found: false, discovery: true, preview: result.preview, full_journey: result.full_journey }} />
            {reviewer && <ProposePanel preview={result.preview} query={result.preview.match.query} reviewerName={reviewer.name} />}
          </div>
        )}
        {result && "discovery" in result && <DiscoveryPreviewView result={result} />}
        {result && "discovery" in result && reviewer && (
          <div className="mt-4">
            <ProposePanel preview={result.preview} query={q} reviewerName={reviewer.name} />
          </div>
        )}
        {result && !result.found && "message" in result && (
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
