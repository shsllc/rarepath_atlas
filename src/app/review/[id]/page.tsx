import Link from "next/link";
import { notFound } from "next/navigation";
import { currentReviewer } from "@/lib/review/http";
import { getItem } from "@/lib/review/queue";
import { DecisionForm, RevokeForm } from "@/components/review/ReviewActions";
import { EvidenceTierChip } from "@/components/EvidenceTierChip";
import { getServices } from "@/lib/services/registry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review item · RarePath Atlas", robots: { index: false } };

const when = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

export default async function ReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  const reviewer = await currentReviewer();
  if (!reviewer)
    return (
      <p className="rounded-xl border border-line bg-white p-6">
        <Link href="/review" className="text-brand underline">
          Sign in as a reviewer
        </Link>{" "}
        to see this item.
      </p>
    );
  const item = await getItem((await params).id);
  if (!item) notFound();
  const { link, candidate_edge: e } = item;
  const sources = [...link.provenance, ...item.records.flatMap((r) => r.provenance)].filter((p, i, a) => a.findIndex((x) => x.url === p.url) === i);
  return (
    <div className="space-y-4">
      <Link href={`/review?status=${item.status}`} className="text-sm text-brand hover:underline">
        ← Queue
      </Link>
      <section className="rounded-2xl border-2 border-dashed border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {item.disease.label} · {item.status}
          </p>
          <EvidenceTierChip tier={item.status === "accepted" ? "reviewed" : "machine_assembled"} />
        </div>
        <h1 className="mt-2 text-lg font-bold">{link.statement}</h1>
        <p className="mt-2 text-sm text-muted">
          {item.status === "accepted" ? "In the reviewed graph as:" : "Would become:"} <span className="font-mono">{e.subject_id}</span> <strong>{e.predicate.replace(/_/g, " ")}</strong> <span className="font-mono">{e.object_id}</span>
        </p>
        {link.discovery_lead && (
          <p className="mt-2 text-sm font-semibold text-unknown">▲ The source presents this as a navigation lead (co-occurrence or search hit), not a stated fact. Check before accepting.</p>
        )}
        {link.source_score && (
          <p className="mt-1 text-xs text-muted">
            Source&apos;s own score ({link.source_score.name}): {link.source_score.value}. Not a RarePath score.
          </p>
        )}
        {link.qualifiers && Object.keys(link.qualifiers).length > 0 && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {Object.entries(link.qualifiers).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold">{k.replace(/_/g, " ")}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <h2 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Sources to check</h2>
        <ul className="mt-1 space-y-1 text-sm">
          {sources.map((p) => (
            <li key={p.url}>
              <a href={p.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                {p.provider} · {p.native_type.split(";")[0].slice(0, 60)} · {p.source_id} ↗
              </a>{" "}
              <span className="text-xs text-muted">retrieved {p.retrieved_at.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Proposed by {item.proposed_by.name} on {when(item.created_at)}.
        </p>
      </section>
      {item.status === "pending" && (
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="mb-3 font-bold">Your decision</h2>
          <DecisionForm id={item.id} precheck={item.precheck} precheckError={item.precheck_error} aiEnabled={getServices().ai.configured()} />
        </section>
      )}
      {item.decision && (
        <section className="rounded-2xl border border-line bg-white p-6 text-sm">
          <h2 className="font-bold">Decision</h2>
          <p className="mt-1">
            <strong className="capitalize">{item.decision.outcome}</strong>
            {item.decision.confidence && ` · ${item.decision.confidence} confidence`} · {item.decision.by_name}
            {item.decision.by_org ? ` (${item.decision.by_org})` : ""} · {when(item.decision.at)}
          </p>
          {item.decision.note && <p className="mt-2 whitespace-pre-wrap">{item.decision.note}</p>}
          {item.revoked && (
            <p className="mt-3 text-contradictory">
              Withdrawn by {item.revoked.by_name} on {item.revoked.at.slice(0, 10)}: {item.revoked.note}
            </p>
          )}
          {item.status === "accepted" && (
            <div className="mt-4">
              <RevokeForm id={item.id} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
