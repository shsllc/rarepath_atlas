import Link from "next/link";
import { after } from "next/server";
import { SearchBox } from "@/components/SearchBox";
import { ResultsView } from "@/components/ResultsView";
import { PartialDiseaseView } from "@/components/CoverageSections";
import { DiscoveryPreviewView } from "@/components/DiscoveryPreview";
import { FamilyDiscoveryView, FamilyJourneyView, FamilyPartialView } from "@/components/FamilyView";
import { ViewToggle } from "@/components/ViewToggle";
import { getServices } from "@/lib/services/registry";
import { currentReviewer } from "@/lib/review/http";
import { ProposePanel } from "@/components/review/ProposePanel";
import { accountsApi } from "@/lib/auth/api";
import { accountsEnabled, currentUser, idToken } from "@/lib/auth/session";
import { getWatch } from "@/lib/watch";
import { watchKey } from "@/lib/watch/key";
import { WatchButton } from "@/components/watch/WatchControls";
import { ExportBar } from "@/components/ExportBar";
import { briefDocFrom } from "@/lib/export/brief-doc";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ q?: string; demo?: string; view?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  // Family view by default; the guided demo and the research door open the research view.
  const view: "family" | "research" = sp.view === "research" || (sp.demo === "1" && sp.view !== "family") ? "research" : "family";
  const [result, reviewer] = await Promise.all([q ? getServices().search.search(q) : null, currentReviewer()]);
  const { key: wKey } = await watchKey();
  const watchable = !!result && ("discovery" in result || "partial" in result || result.found);
  const watched = watchable && wKey ? !!(await getWatch(wKey, q)) : false;
  // Count live discovery searches for signed-in accounts (measured before any limits are set).
  if (result && "discovery" in result && accountsEnabled() && (await currentUser())) {
    const bearer = await idToken();
    after(() => accountsApi("POST", "/usage", { unit: "discovery_search" }, bearer).catch(() => {}));
  }
  const family = view === "family";

  return (
    <div className="space-y-5">
      <div className="mx-auto max-w-3xl">
        <SearchBox defaultValue={q} size="sm" view={view} />
      </div>
      {watchable && result && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ViewToggle query={q} view={view} />
          <div className="flex flex-wrap items-center gap-3">
            {!family && <ExportBar query={q} hasBrief={!!briefDocFrom(result, "")} />}
            <WatchButton query={q} watched={watched} />
          </div>
        </div>
      )}
      <div>
        {!result && <p className="text-muted">Enter a disease, gene, variant, symptom or mechanism.</p>}

        {family && result && "partial" in result && <FamilyPartialView result={result} />}
        {family && result && "discovery" in result && <FamilyDiscoveryView result={result} />}
        {family && result && result.found && <FamilyJourneyView result={result} />}

        {!family && result && "partial" in result && <PartialDiseaseView result={result} />}
        {!family && result && "partial" in result && result.preview && (
          <div className="mt-6 space-y-4">
            <DiscoveryPreviewView result={{ query: result.query, found: false, discovery: true, preview: result.preview, full_journey: result.full_journey }} />
            {reviewer && <ProposePanel preview={result.preview} query={result.preview.match.query} reviewerName={reviewer.name} />}
          </div>
        )}
        {!family && result && "discovery" in result && <DiscoveryPreviewView result={result} />}
        {!family && result && "discovery" in result && reviewer && (
          <div className="mt-4">
            <ProposePanel preview={result.preview} query={q} reviewerName={reviewer.name} />
          </div>
        )}
        {!family && result && result.found && <ResultsView result={result} demo={sp.demo === "1"} />}

        {result && !result.found && "message" in result && (
          <div className="rounded-3xl border border-dashed border-unknown bg-white p-6 sm:p-8">
            <p className="text-xs font-bold tracking-[0.14em] text-unknown uppercase">No supported connection found</p>
            <p className="mt-2 text-lg">{result.message}</p>
            <p className="mt-2 text-sm text-muted">&ldquo;No supported connection&rdquo; is a real answer: we only show links we can trace to a source.</p>
            {result.suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {result.suggestions.map((s) => (
                  <Link key={s} href={`/results?q=${encodeURIComponent(s)}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-brand hover:text-brand">
                    {s}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
