import Link from "next/link";
import type { EvidenceEdge, PartialDiseaseResult } from "@/lib/schemas";
import { COVERAGE_STATEMENT, TIER_META, type CoverageCounts, type CoverageTier, type DiseaseCoverage } from "@/lib/coverage";
import { PREDICATE_LABEL } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

/** Distinct fill + border style per tier, so depth reads without colour and never looks equal. */
const TIER_STYLE: Record<CoverageTier, string> = {
  full: "bg-brand text-white border border-solid border-brand",
  partial: "bg-teal-wash text-supported border border-solid border-supported",
  shared_study: "bg-white text-muted border border-dashed border-muted",
  identity_only: "bg-white text-muted border border-dotted border-muted",
};

export function TierBadge({ tier }: { tier: CoverageTier }) {
  return (
    <span title={TIER_META[tier].help} className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${TIER_STYLE[tier]}`}>
      {TIER_META[tier].label}
    </span>
  );
}

const searchHref = (d: DiseaseCoverage) => (d.is_focus ? "/results?q=CDKL5&demo=1" : `/results?q=${encodeURIComponent(d.label)}`);

/** What has actually been reviewed for a disease. A checklist, not a score. */
function depthItems(d: DiseaseCoverage): [string, boolean][] {
  return [
    ["Verified identity", d.identifiers.length > 0],
    ["Causal gene (reviewed)", d.genes.length > 0],
    ["Shared study", d.studies.some((s) => s.shared_with.length > 0)],
    ["Research asset applied", d.assets.length > 0],
    ["Patient organization", d.organizations.length > 0],
    ["Research Action Brief", d.has_action_brief],
  ];
}

export function DepthChecklist({ d }: { d: DiseaseCoverage }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3" aria-label={`Reviewed evidence for ${d.label}`}>
      {depthItems(d).map(([label, ok]) => (
        <li key={label} className={ok ? "text-ink" : "text-muted/80"}>
          <span aria-hidden className={ok ? "text-supported" : ""}>
            {ok ? "✓" : "–"}
          </span>{" "}
          {label}
          <span className="sr-only">{ok ? ": reviewed" : ": not yet reviewed"}</span>
        </li>
      ))}
    </ul>
  );
}

export function CoverageCountsStrip({ counts }: { counts: CoverageCounts }) {
  const items: [string, number][] = [
    ["Diseases", counts.diseases],
    ["Genes", counts.genes],
    ["Studies", counts.studies],
    ["Research assets", counts.research_assets],
    ["Investigators", counts.investigators],
    ["Patient organizations", counts.patient_organizations],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([label, n]) => (
        <div key={label} className="rounded-xl border border-line bg-white px-3 py-2 text-center">
          <dt className="text-[11px] leading-tight text-muted">{label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CoverageDisclosure({ counts }: { counts: CoverageCounts }) {
  return (
    <section aria-labelledby="coverage-h" className="rounded-2xl border border-line bg-canvas p-5">
      <h2 id="coverage-h" className="text-xs font-bold uppercase tracking-wide text-muted">
        Current coverage
      </h2>
      <p className="mt-2 text-sm leading-relaxed">{COVERAGE_STATEMENT}</p>
      <div className="mt-4">
        <CoverageCountsStrip counts={counts} />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Counted from the committed evidence graph: {counts.papers} papers, {counts.sources} retrieved sources, {counts.reviewed_relationships} analyst-reviewed relationships. OpenAI-only extractions are not counted.
      </p>
    </section>
  );
}

/** Homepage strip: CDD featured and visibly deeper; other diseases listed at their real depth. */
export function NetworkPreview({ diseases }: { diseases: DiseaseCoverage[] }) {
  const [featured, ...rest] = diseases;
  if (!featured) return null;
  return (
    <section aria-labelledby="network-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="network-h" className="text-xs font-bold uppercase tracking-wide text-muted">
          Explore the network
        </h2>
        <Link href="/atlas" className="text-sm font-medium text-brand hover:underline">
          See coverage for every disease →
        </Link>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <Link href={searchHref(featured)} className="group rounded-2xl border-2 border-brand bg-white p-5 shadow-sm transition hover:shadow-md sm:col-span-3">
          <TierBadge tier={featured.tier} />
          <h3 className="mt-2 text-lg font-semibold group-hover:text-brand">{featured.label}</h3>
          <p className="mt-1 text-sm text-muted">The worked example: ranked research connections, reusable assets and a reviewed Research Action Brief.</p>
          <div className="mt-3">
            <DepthChecklist d={featured} />
          </div>
        </Link>
        <ul className="flex flex-col gap-2 sm:col-span-2">
          {rest.map((d) => (
            <li key={d.node_id}>
              <Link href={searchHref(d)} className="group block rounded-xl border border-line bg-white px-4 py-3 transition hover:border-brand">
                <span className="block text-sm font-semibold group-hover:text-brand">{d.label}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <TierBadge tier={d.tier} />
                  {TIER_META[d.tier].short}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Identifiers({ d }: { d: DiseaseCoverage }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {d.identifiers.map((x) =>
        x.url ? (
          <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="font-mono text-brand hover:underline">
            {x.id}
          </a>
        ) : (
          <span key={x.id} className="font-mono text-muted">
            {x.id}
          </span>
        ),
      )}
    </span>
  );
}

/** Full card for the /atlas page. */
export function DiseaseCoverageCard({ d }: { d: DiseaseCoverage }) {
  const shared = d.studies.filter((s) => s.shared_with.length > 0);
  return (
    <article className={`rounded-2xl bg-white p-5 ${d.tier === "full" ? "border-2 border-brand shadow-sm" : "border border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <TierBadge tier={d.tier} />
          <h2 className="mt-2 text-lg font-semibold">{d.label}</h2>
          <Identifiers d={d} />
        </div>
        <Link href={searchHref(d)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${d.tier === "full" ? "bg-brand text-white hover:bg-brand-deep" : "border border-line hover:border-brand"}`}>
          {d.tier === "full" ? "Open the full journey →" : "View reviewed evidence →"}
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted">{TIER_META[d.tier].help}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <Fact label="Associated gene" value={d.genes.map((g) => g.label).join(", ") || "Not yet reviewed in this graph"} />
        <Fact label="Verified shared studies" value={shared.map((s) => s.nct ?? s.label).join(", ") || "None reviewed"} />
        <Fact label="Patient organization" value={d.organizations.map((o) => o.label).join(", ") || "None reviewed in this graph"} />
        <Fact label="Research assets applied (reviewed)" value={d.assets.length ? `${d.assets.length}` : "None reviewed"} />
      </dl>
      <div className="mt-3 border-t border-line pt-3">
        <DepthChecklist d={d} />
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EdgeQuote({ edge }: { edge?: EvidenceEdge }) {
  if (!edge) return null;
  return (
    <p className="mt-1 text-xs text-muted">
      &ldquo;{edge.quoted_or_structured_evidence}&rdquo;{" "}
      <a href={edge.source_url} target="_blank" rel="noreferrer" className="whitespace-nowrap text-brand hover:underline">
        {edge.source} ↗
      </a>
    </p>
  );
}

function Block({ title, empty, children }: { title: string; empty?: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
      {children || <p className="mt-2 text-sm text-muted">{empty}</p>}
    </section>
  );
}

/** Results page for a supported disease that is not the fully reviewed journey. */
export function PartialDiseaseView({ result }: { result: PartialDiseaseResult }) {
  const d = result.coverage;
  const edge = new Map(result.edges.map((e) => [e.id, e]));
  const via = result.matched.node_id !== d.node_id ? `Matched ${result.matched.type.toLowerCase()} “${result.matched.label}” → ` : "";
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="text-xs text-muted">{via}Disease</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{d.label}</h1>
          <TierBadge tier={d.tier} />
        </div>
        <div className="mt-2">
          <Identifiers d={d} />
        </div>
        {d.summary && <p className="mt-3 max-w-2xl text-sm leading-relaxed">{d.summary}</p>}
        <div role="note" className="mt-4 rounded-xl border border-dashed border-unknown bg-unknown-bg px-4 py-3 text-sm text-ink">
          <strong>{result.banner}</strong>
          <span className="mt-1 block text-xs text-muted">
            Only analyst-reviewed relationships are shown. There is no research-connection ranking, reuse classification or score for this disease.
          </span>
        </div>
        <div className="mt-4">
          <DepthChecklist d={d} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Associated gene" empty="No causal-gene relationship has been reviewed for this disease in the current graph.">
          {d.genes.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm">
              {d.genes.map((g) => (
                <li key={g.edge_id}>
                  <span className="font-semibold">{g.label}</span> <StatusBadge status={g.status} compact />
                  <EdgeQuote edge={edge.get(g.edge_id)} />
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Patient organization" empty="No patient organization has been reviewed for this disease in the current graph.">
          {d.organizations.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm">
              {d.organizations.map((o) => (
                <li key={o.edge_id}>
                  <span className="font-semibold">{o.label}</span> <StatusBadge status={o.status} compact />
                  <EdgeQuote edge={edge.get(o.edge_id)} />
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <Block title="Verified shared studies" empty="No reviewed study enrolment.">
        {d.studies.length > 0 && (
          <ul className="mt-2 space-y-3 text-sm">
            {d.studies.map((s) => (
              <li key={s.edge_id}>
                <span className="font-semibold">{s.label}</span> <StatusBadge status={s.status} compact />
                {s.shared_with.length > 0 && <p className="mt-1 text-xs">Also enrols (reviewed): {s.shared_with.map((x) => x.label).join(", ")}</p>}
                {s.investigators.length > 0 && <p className="mt-1 text-xs text-muted">Listed study investigators: {s.investigators.map((x) => x.label).join(", ")}</p>}
                <EdgeQuote edge={edge.get(s.edge_id)} />
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Research assets applied in this disease (reviewed)" empty="No research asset has a reviewed application to this disease yet.">
        {d.assets.length > 0 && (
          <ul className="mt-2 space-y-2 text-sm">
            {d.assets.map((a) => (
              <li key={a.edge_id}>
                <span className="font-semibold">{a.label}</span> <StatusBadge status={a.status} compact />
                <EdgeQuote edge={edge.get(a.edge_id)} />
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Reviewed connections to other diseases" empty="No reviewed disease-to-disease relationships.">
        {d.connections.length > 0 && (
          <ul className="mt-2 space-y-3 text-sm">
            {d.connections.map((c) => (
              <li key={c.edge_id}>
                <StatusBadge status={c.status} compact />{" "}
                {c.direction === "out" ? (
                  <>
                    {d.label} {PREDICATE_LABEL[c.predicate]} <span className="font-semibold">{c.label}</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{c.label}</span> {PREDICATE_LABEL[c.predicate]} {d.label}
                  </>
                )}
                <EdgeQuote edge={edge.get(c.edge_id)} />
              </li>
            ))}
          </ul>
        )}
      </Block>

      <section className="rounded-2xl border border-line bg-canvas p-5 text-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Not available for this disease yet</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Research Action Brief (requires reviewed evidence for every recommended step)</li>
          <li>Ranked research connections and reusable-asset opportunities</li>
          {d.unreviewed_ai_edge_count > 0 && (
            <li>
              {d.unreviewed_ai_edge_count} OpenAI-extracted relationship{d.unreviewed_ai_edge_count === 1 ? "" : "s"} involving this disease {d.unreviewed_ai_edge_count === 1 ? "is" : "are"} quote-verified but not
              analyst-reviewed, so {d.unreviewed_ai_edge_count === 1 ? "it is" : "they are"} not shown or counted here.
            </li>
          )}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/results?q=${encodeURIComponent(result.full_journey.query)}&demo=1`} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-deep">
            See the full verified journey: {result.full_journey.label} →
          </Link>
          <Link href="/atlas" className="rounded-lg border border-line bg-white px-3 py-1.5 font-semibold hover:border-brand">
            Coverage for every disease
          </Link>
        </div>
      </section>
    </div>
  );
}
