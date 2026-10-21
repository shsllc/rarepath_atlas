import Link from "next/link";
import { currentReviewer } from "@/lib/review/http";
import { listCurated } from "@/lib/curation/store";
import { RULES_VERSION } from "@/lib/curation/rules";
import { getServices } from "@/lib/services/registry";
import { PREDICATE_LABEL } from "@/lib/format";
import { WithdrawCurated } from "@/components/review/WithdrawCurated";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source-curated claims", robots: { index: false } };

export default async function CuratedPage() {
  const reviewer = await currentReviewer();
  if (!reviewer?.curator)
    return (
      <p className="rounded-2xl border border-line bg-white p-6">
        This page is for platform curators.{" "}
        <Link href="/review" className="text-brand underline">
          Review queue
        </Link>
      </p>
    );
  const rows = await listCurated();
  const bundleLabels = new Map(getServices().graph.bundle().nodes.map((n) => [n.id, n.label]));
  return (
    <div className="space-y-4">
      <Link href="/review" className="text-sm text-brand hover:underline">
        ← Review queue
      </Link>
      <div>
        <h1 className="text-xl font-bold">Source-curated claims</h1>
        <p className="text-sm text-muted">
          Promoted automatically by the published rules (version {RULES_VERSION}). Spot-check them and withdraw anything wrong: a withdrawn claim leaves the graph and is never promoted again.{" "}
          <Link href="/sources#curation-rules" className="text-brand underline">
            The rules
          </Link>
        </p>
      </div>
      {rows.length === 0 && <p className="rounded-xl border border-dotted border-line bg-white p-6 text-muted">Nothing promoted yet. Claims are promoted when a disease is searched or refreshed.</p>}
      {rows.map((r) => {
        const labels = new Map<string, string>([...bundleLabels, ...r.nodes.map((n) => [n.id, n.label] as [string, string])]);
        const l = (id: string) => labels.get(id) ?? id;
        return (
          <details key={r.disease_label} className="rounded-2xl border border-line bg-white p-4">
            <summary className="cursor-pointer font-semibold">
              {r.disease_label} <span className="font-normal text-muted">· {r.edges.length} claims · {r.promoted_at.slice(0, 10)}</span>
            </summary>
            <ul className="mt-3 divide-y divide-line text-sm">
              {r.edges.map((e) => (
                <li key={e.id} className="py-2">
                  <span className={e.contradiction_status === "contradicted" ? "text-contradictory" : ""}>
                    {l(e.subject_id)} {PREDICATE_LABEL[e.predicate]} {l(e.object_id)}
                  </span>
                  <span className="block text-xs text-muted">
                    {e.curation?.rule_title}: {e.curation?.detail} ·{" "}
                    <a href={e.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      source ↗
                    </a>
                  </span>
                  <WithdrawCurated edgeId={e.id} />
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
