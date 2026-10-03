"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EvidenceEdge, GraphNode, ReusableAssetOpportunity, SearchResult, SourceRecord } from "@/lib/schemas";
import { ASSET_KIND_LABEL, CONNECTION_TYPE_LABEL, REUSE_LABEL } from "@/lib/format";
import type { DrawerTarget } from "@/lib/graph-view";
import { SOURCE_SYSTEM_BY_KIND, TENX } from "@/lib/tenx";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { FixtureChip, STATUS_META, StatusBadge } from "./StatusBadge";
import { GraphPlaceholder } from "./GraphPlaceholder";
import { EvidenceKey } from "./EvidenceKey";

const EvidenceGraph = dynamic(() => import("./EvidenceGraph").then((m) => m.EvidenceGraph), {
  ssr: false,
  loading: () => <div className="h-[440px] rounded-xl border border-line bg-white p-4 text-sm text-muted">Loading graph…</div>,
});

function Section({ id, n, title, subtitle, children }: { id: string; n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-6" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="flex items-baseline gap-2 text-xl font-semibold tracking-tight">
        <span className="text-sm font-medium text-muted">{n}</span>
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EvidenceButton({ count, onClick, label = "View evidence" }: { count: number; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="shrink-0 rounded border border-line bg-white px-2 py-1 text-xs font-medium hover:border-ink">
      {label} ({count})
    </button>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function ResultsView({ result, demo = false }: { result: SearchResult; demo?: boolean }) {
  const nodes = useMemo(() => new Map<string, GraphNode>(result.nodes.map((n) => [n.id, n])), [result.nodes]);
  const edges = useMemo(() => new Map<string, EvidenceEdge>(result.edges.map((e) => [e.id, e])), [result.edges]);
  const sources = useMemo(() => new Map<string, SourceRecord>(result.sources.map((s) => [s.id, s])), [result.sources]);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [showDemo, setShowDemo] = useState(demo);
  const close = useCallback(() => setDrawer(null), []);
  const open = (title: string, edgeIds: string[]) => setDrawer({ kind: "edges", title, edgeIds });
  const openNode = (nodeId: string) => setDrawer({ kind: "node", nodeId });
  const label = (id: string) => nodes.get(id)?.label ?? id;
  const isFixture = (ids: string[]) => ids.some((id) => edges.get(id)?.source_type === "demo_fixture");

  const disease = nodes.get(result.disease.node_id)!;
  const cov = result.disease.coverage;
  const diseaseEdges = result.edges.filter((e) => e.subject_id === disease.id && ["caused_by_variant_in", "has_phenotype", "historically_classified_with"].includes(e.predicate) && !e.id.startsWith("edge:ai:")).map((e) => e.id);
  const featured = result.opportunities.find((o) => o.story.length > 0);
  const others = result.opportunities.filter((o) => o !== featured);
  const infraConn = result.connections.find((c) => c.connection_type === "shared_research_infrastructure");
  const contradiction = result.edges.find((e) => e.predicate === "classified_as_variant_of" && e.contradiction_status !== "none");
  const heroEdges = featured ? [...new Set(featured.story.flatMap((s) => s.evidence_edge_ids))] : [];

  return (
    <div>
      {result.is_fixture ? (
        <div role="alert" className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <strong>Demo data.</strong> {result.fixture_warning}
        </div>
      ) : (
        <ProvenanceBar result={result} />
      )}

      {showDemo && featured ? (
        <DemoPath
          onClose={() => setShowDemo(false)}
          steps={[
            { label: "Search CDKL5", done: true },
            { label: "Distinct from Rett, but historically linked", go: () => scrollTo("contradiction") },
            { label: "Shared natural-history study: CDD participants enrolled", go: () => openNode("study:nhs") },
            { label: "Reusable insight: it informed a CDD-specific severity scale", go: () => scrollTo("hero") },
            { label: "The limitation: not equivalence, not treatment transfer", go: () => scrollTo("limitation") },
            { label: "Explain this connection (OpenAI)", go: () => open(featured.headline, heroEdges) },
            { label: "The concrete next research question", go: () => scrollTo("next-question") },
            { label: "Evidence graph and citations", go: () => scrollTo("graph") },
          ]}
        />
      ) : (
        !result.is_fixture && (
          <button onClick={() => setShowDemo(true)} className="mb-4 text-sm font-medium underline">
            Show the suggested 60-second demo path
          </button>
        )
      )}

      <h1 className="sr-only">RarePath results for {disease.label}</h1>
      <EvidenceKey />

      {/* 1. YOUR DISEASE */}
      <Section id="disease" n={1} title="Your disease">
        <div className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <h3 className="text-2xl font-semibold tracking-tight">{disease.label}</h3>
              {result.matched.node_id !== disease.id && (
                <p className="text-sm text-muted">
                  You searched &ldquo;{result.query}&rdquo; → matched {result.matched.type} <strong>{result.matched.label}</strong>
                </p>
              )}
              {disease.lay_summary && <p className="mt-2">{disease.lay_summary}</p>}
            </div>
            <EvidenceButton count={diseaseEdges.length} onClick={() => open(`${disease.label}: gene and features`, diseaseEdges)} />
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Identifiers</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {disease.external_ids.map((x) => (
                  <a key={x.system + x.id} href={x.url} target="_blank" rel="noreferrer" className="rounded border border-line px-1.5 py-0.5 font-mono text-xs underline" title={`verification: ${x.verification}`}>
                    {x.id.includes(":") || x.id.startsWith(x.system) ? x.id : `${x.system}:${x.id}`}
                    {x.verification !== "verified" && <span className="ml-1 text-yellow-700">({x.verification === "pending" ? "pending" : "unverified"})</span>}
                  </a>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Gene</dt>
              <dd className="mt-1">{result.disease.gene_ids.map(label).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Key features</dt>
              <dd className="mt-1">{result.disease.phenotype_ids.map(label).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Mechanism / pathway</dt>
              <dd className="mt-1">
                {result.disease.mechanism_ids.map(label).join("; ") || <span className="text-muted">Not described in the retrieved sources</span>}
              </dd>
            </div>
          </dl>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            Relationships on this page:
            {(Object.keys(cov) as (keyof typeof cov)[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <StatusBadge status={k} compact /> <span className="font-semibold text-ink">{cov[k]}</span>
              </span>
            ))}
          </p>
        </div>
        {infraConn && featured && (
          <button
            onClick={() => scrollTo("hero")}
            className="mt-3 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-supported bg-supported-bg px-5 py-3 text-left"
          >
            <span>
              <span className="block text-xs font-bold uppercase tracking-wide text-supported">Shared research infrastructure found</span>
              <span className="text-sm">{infraConn.why_connected}</span>
            </span>
            <span className="text-sm font-semibold text-supported">See what may be reusable ↓</span>
          </button>
        )}
      </Section>

      {/* 2. HERO: REUSABLE RESEARCH */}
      <Section id="hero" n={2} title="Reusable research" subtitle="What another community has already built that yours may be able to reuse. Every card is a hypothesis to check, never a conclusion.">
        {featured && <FeaturedCard o={featured} label={label} open={open} isFixture={isFixture} heroEdges={heroEdges} />}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {others.map((o) => (
            <OpportunityCard key={o.id} o={o} label={label} nodes={nodes} open={open} isFixture={isFixture} />
          ))}
        </div>
      </Section>

      {/* 3. CONTRADICTION SPOTLIGHT */}
      {contradiction && (
        <Section id="contradiction" n={3} title="Why searching names is not enough" subtitle="Historical labels and current evidence can disagree. RarePath shows both, with dates.">
          <ContradictionSpotlight edge={contradiction} sources={sources} open={open} label={label} />
        </Section>
      )}

      {/* 4. CONNECTED COMMUNITIES */}
      <Section id="communities" n={4} title="Connected communities" subtitle="Other rare-disease communities linked to yours, and exactly how.">
        <div className="grid gap-3 md:grid-cols-2">
          {result.connections.map((c) => (
            <article key={c.id} className={`rounded-xl border border-line bg-white p-4 ${STATUS_META[c.status].card}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{label(c.disease_id)}</h3>
                <span className="flex items-center gap-1">
                  {isFixture(c.evidence_edge_ids) && <FixtureChip />}
                  <StatusBadge status={c.status} compact />
                </span>
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">
                {CONNECTION_TYPE_LABEL[c.connection_type]} · confidence {c.confidence}
              </p>
              <p className="mt-2 text-sm">{c.why_connected}</p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Important difference: </span>
                {c.key_difference}
              </p>
              <div className="mt-3">
                <EvidenceButton count={c.evidence_count} onClick={() => open(`${label(c.disease_id)}: ${CONNECTION_TYPE_LABEL[c.connection_type]}`, c.evidence_edge_ids)} />
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* 5. EVIDENCE GRAPH */}
      <Section id="graph" n={5} title="Explore the evidence graph" subtitle="Each line is a relationship with its own sources, and its style shows the evidence status.">
        <EvidenceGraph nodes={result.nodes} edges={result.edges} focusId={disease.id} onOpen={setDrawer} />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Table view of all relationships (accessible alternative)</summary>
          <div className="mt-2">
            <GraphPlaceholder nodes={result.nodes} edges={result.edges} onSelectEdge={(e) => open(`${label(e.subject_id)} → ${label(e.object_id)}`, [e.id])} />
          </div>
        </details>
      </Section>

      {/* 6. 10× OPPORTUNITY */}
      {!result.is_fixture && (
        <Section id="tenx" n={6} title="The 10× opportunity" subtitle={`Milestone: ${TENX.milestone}.`}>
          <TenXPanel result={result} />
        </Section>
      )}

      {/* 7. PEOPLE & COMMUNITIES */}
      <Section id="people" n={7} title="People & communities">
        <PeopleSection result={result} nodes={nodes} label={label} open={open} openNode={openNode} />
      </Section>

      {/* 8. WHAT WE DON'T KNOW */}
      <Section id="gaps" n={8} title="What we don't know" subtitle="Missing evidence, disagreements and assumptions behind this page.">
        <ul className="space-y-2">
          {result.gaps.map((g) => (
            <li key={g.id} className="rounded-xl border border-line bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{g.kind.replace(/_/g, " ")}</span>
                {g.related_edge_ids.length > 0 && <EvidenceButton count={g.related_edge_ids.length} onClick={() => open(g.statement, g.related_edge_ids)} />}
              </div>
              <p className="mt-1">{g.statement}</p>
              {g.suggested_question_or_experiment && <p className="mt-1 text-muted">Next question: {g.suggested_question_or_experiment}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <p className="mt-12 border-t border-line pt-4 text-xs text-muted">
        RarePath Atlas is a research-navigation tool, not a diagnostic or treatment recommendation system. Always confirm with qualified clinicians and researchers.
      </p>

      <EvidenceDrawer request={drawer} onClose={close} onNavigate={setDrawer} nodes={nodes} edges={edges} sources={sources} />
    </div>
  );
}

function ProvenanceBar({ result }: { result: SearchResult }) {
  return (
    <div className="mb-4 rounded-lg border border-line bg-white p-3 text-sm">
      <strong>Built from {result.sources.length} retrieved public sources</strong>{" "}
      <span className="text-muted">(PubMed, PubMed Central, ClinicalTrials.gov, NIH RePORTER, MONDO/HPO, HGNC, official organization sites). Every statement opens to its verbatim source quote.</span>
      {result.build_info?.openai_runs.map((r) => (
        <p key={r.run_id} className="mt-1 text-xs text-muted">
          OpenAI {r.role} ({r.model}): {r.summary}
        </p>
      ))}
    </div>
  );
}

function DemoPath({ steps, onClose }: { steps: { label: string; done?: boolean; go?: () => void }[]; onClose: () => void }) {
  return (
    <nav aria-label="Suggested demo path" className="mb-6 rounded-xl border-2 border-ink bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide">Suggested 60-second demo path</h2>
        <button onClick={onClose} className="text-xs text-muted underline">
          Hide
        </button>
      </div>
      <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={i}>
            {s.go ? (
              <button onClick={s.go} className="text-left hover:underline">
                <span className="mr-1 font-semibold">{i + 1}.</span>
                {s.label} →
              </button>
            ) : (
              <span className="text-muted">
                <span className="mr-1 font-semibold">{i + 1}.</span>
                {s.label} ✓
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FeaturedCard({
  o,
  label,
  open,
  isFixture,
  heroEdges,
}: {
  o: ReusableAssetOpportunity;
  label: (id: string) => string;
  open: (t: string, ids: string[]) => void;
  isFixture: (ids: string[]) => boolean;
  heroEdges: string[];
}) {
  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6" aria-label="Featured reusable research">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded bg-ink px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">{REUSE_LABEL[o.reuse_classification]}</span>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">{o.headline}</h3>
          <p className="text-sm text-muted">Built by the {label(o.source_disease_id)} community. Evidence includes the registry record, the 2020 comparison paper and the NIH grant.</p>
          <p className="mt-1 text-xs text-muted">A natural-history study follows people over time to learn how a condition changes. An outcome measure is a scale used to track those changes.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1">
            {isFixture(o.evidence_edge_ids) && <FixtureChip />}
            <StatusBadge status={o.status} />
          </span>
          <span className="text-xs text-muted">Reuse confidence: {o.confidence}</span>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-line border-y border-line">
        {o.story.map((s) => (
          <div key={s.label} id={s.label === "Next research question" ? "next-question" : s.label === "Important limitation" ? "limitation" : undefined} className="grid scroll-mt-6 gap-2 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-start">
            <dt className={`text-xs font-bold uppercase tracking-wide ${s.label === "Important limitation" ? "text-contradictory" : s.label === "Next research question" ? "text-ink" : "text-muted"}`}>{s.label}</dt>
            <dd className={s.label === "Next research question" ? "text-base font-semibold" : "text-sm"}>{s.text}</dd>
            <dd>
              <EvidenceButton count={s.evidence_edge_ids.length} label="Evidence" onClick={() => open(`${s.label}: ${o.headline}`, s.evidence_edge_ids)} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => open(o.headline, heroEdges)} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
          Explain this connection
        </button>
        <EvidenceButton count={o.evidence_edge_ids.length} onClick={() => open(o.headline, o.evidence_edge_ids)} label="All evidence" />
      </div>

      <div className="mt-4 rounded-lg bg-canvas p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested next actions</h4>
        <ol className="mt-2 space-y-2 text-sm">
          {o.next_actions.map((a, i) => (
            <li key={a.id} className="flex items-start justify-between gap-3">
              <span>
                <span className="mr-2 font-semibold">{i + 1}.</span>
                {a.label}
              </span>
              <button onClick={() => open(`Why: ${a.label}`, a.evidence_edge_ids)} className="shrink-0 text-xs underline" aria-label={`Why this action: show evidence for "${a.label}"`}>
                why?
              </button>
            </li>
          ))}
        </ol>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Full assessment: what may help, what differs, what is uncertain</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <List title="Why it may help" items={o.why_it_may_transfer} />
          <List title="What differs" items={o.what_differs} />
          <List title="What remains uncertain" items={o.what_is_uncertain} />
          <List title="Requires expert validation" items={o.requires_expert_validation} />
        </div>
      </details>
    </article>
  );
}

function OpportunityCard({
  o,
  label,
  nodes,
  open,
  isFixture,
}: {
  o: ReusableAssetOpportunity;
  label: (id: string) => string;
  nodes: Map<string, GraphNode>;
  open: (t: string, ids: string[]) => void;
  isFixture: (ids: string[]) => boolean;
}) {
  const asset = nodes.get(o.asset_id);
  const kind = asset?.type === "ResearchAsset" ? ASSET_KIND_LABEL[asset.asset_kind] : "Research asset";
  return (
    <article className={`rounded-xl border border-line bg-white p-5 ${STATUS_META[o.status].card}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          <span className="rounded bg-canvas px-1.5 py-0.5 text-ink">{REUSE_LABEL[o.reuse_classification]}</span> · {kind}
        </p>
        <span className="flex items-center gap-1">
          {isFixture(o.evidence_edge_ids) && <FixtureChip />}
          <StatusBadge status={o.status} compact />
        </span>
      </div>
      <h3 className="mt-2 text-lg font-semibold">{o.headline}</h3>
      <p className="text-sm text-muted">From the {label(o.source_disease_id)} community · confidence {o.confidence}</p>
      <div className="mt-3 space-y-3">
        <List title="Why it may help" items={o.why_it_may_transfer} />
        <List title="What differs" items={o.what_differs} />
        <List title="What remains uncertain" items={o.what_is_uncertain} />
        <List title="Requires expert validation" items={o.requires_expert_validation} />
      </div>
      <div className="mt-3 rounded-lg bg-canvas p-3 text-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested next action</h4>
        {o.next_actions.map((a) => (
          <p key={a.id} className="mt-1 flex items-start justify-between gap-3">
            <span>{a.label}</span>
            <button onClick={() => open(`Why: ${a.label}`, a.evidence_edge_ids)} className="shrink-0 text-xs underline" aria-label={`Why this action: show evidence for "${a.label}"`}>
              why?
            </button>
          </p>
        ))}
      </div>
      <div className="mt-3">
        <EvidenceButton count={o.evidence_edge_ids.length} onClick={() => open(o.headline, o.evidence_edge_ids)} />
      </div>
    </article>
  );
}

function ContradictionSpotlight({ edge, sources, open, label }: { edge: EvidenceEdge; sources: Map<string, SourceRecord>; open: (t: string, ids: string[]) => void; label: (id: string) => string }) {
  const when = (srcId?: string) => {
    const s = srcId ? sources.get(srcId) : undefined;
    if (!s) return "";
    if (s.kind === "ontology_term") return `ontology record, retrieved ${s.retrieval_date}`;
    return `${s.journal ?? s.title.split(":")[0]} ${String(s.pub_date ?? "").slice(0, 4)}`.trim();
  };
  const historical = edge.evidence.filter((x) => x.stance === "supports");
  const current = edge.evidence.filter((x) => x.stance === "contradicts");
  const Quote = ({ q, src, srcId }: { q: string; src: string; srcId?: string }) => (
    <li className="rounded-lg border border-line bg-white p-3 text-sm">
      &ldquo;{q}&rdquo;
      <span className="mt-1 block text-xs text-muted">
        {src}
        {when(srcId) && ` · ${when(srcId)}`}
      </span>
    </li>
  );
  return (
    <div className="rounded-2xl border-4 border-double border-contradictory bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          Is {label(edge.subject_id)} a variant of {label(edge.object_id)}? <StatusBadge status="contradictory" compact />
        </p>
        <EvidenceButton count={edge.evidence.length} onClick={() => open(`${label(edge.subject_id)}: historical label vs. current evidence`, [edge.id])} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Historical label</h4>
          <ul className="mt-2 space-y-2">
            {historical.map((x) => (
              <Quote key={x.id} q={x.quoted_or_structured_evidence} src={x.source} srcId={x.source_record_id} />
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-contradictory">Current evidence</h4>
          <ul className="mt-2 space-y-2">
            {current.map((x) => (
              <Quote key={x.id} q={x.quoted_or_structured_evidence} src={x.source} srcId={x.source_record_id} />
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Ontologies such as MONDO keep historical names and groupings in their definitions so older records stay findable. That is useful, but it means a name search alone can surface outdated
        classifications. Current literature recognises CDD as its own disorder, so RarePath treats the Rett link as research history, not equivalence.
      </p>
    </div>
  );
}

function TenXPanel({ result }: { result: SearchResult }) {
  const systems = [...new Set(result.sources.map((s) => SOURCE_SYSTEM_BY_KIND[s.kind]).filter(Boolean))];
  const quotes = result.edges.reduce((n, e) => n + e.evidence.length, 0);
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-base font-medium">{TENX.claim}</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Traditional path ({TENX.traditional.length} disconnected steps)</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {TENX.traditional.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-supported">RarePath path (one workflow)</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {TENX.rarepath.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </div>
      <p className="mt-4 rounded-lg bg-canvas p-3 text-sm">
        <strong>Behind this page:</strong> {systems.length} source systems ({systems.join(", ")}), {result.sources.length} retrieved records, {quotes} verbatim evidence quotes,{" "}
        {result.edges.length} evidence-backed relationships.
      </p>
      <div className="mt-4">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">What would need to be measured to prove 10×</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {TENX.measures.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-muted">{TENX.notClaimed}</p>
    </div>
  );
}

function PeopleSection({
  result,
  nodes,
  label,
  open,
  openNode,
}: {
  result: SearchResult;
  nodes: Map<string, GraphNode>;
  label: (id: string) => string;
  open: (t: string, ids: string[]) => void;
  openNode: (id: string) => void;
}) {
  const evFrom = (id: string) => result.edges.filter((e) => e.subject_id === id && !e.id.startsWith("edge:ai:")).map((e) => e.id);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Patient organizations</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {result.people.organization_ids.map((id) => {
            const n = nodes.get(id);
            return (
              <li key={id} className="flex items-start justify-between gap-2">
                {n?.type === "PatientOrganization" && n.website ? (
                  <a href={n.website} target="_blank" rel="noreferrer" className="underline">
                    {n.label}
                  </a>
                ) : (
                  <span>{label(id)}</span>
                )}
                <button onClick={() => open(label(id), evFrom(id))} className="shrink-0 text-xs underline" aria-label={`Evidence for ${label(id)}`}>
                  evidence
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Investigators (registry listing)</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {result.people.researcher_ids.map((id) => {
            const n = nodes.get(id);
            return (
              <li key={id} className="flex items-start justify-between gap-2">
                <span>
                  {label(id)}
                  {n?.type === "Researcher" && n.description && <span className="block text-xs text-muted">{n.description}</span>}
                </span>
                <button onClick={() => open(label(id), evFrom(id))} className="shrink-0 text-xs underline" aria-label={`Evidence for ${label(id)}`}>
                  evidence
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Studies</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {result.people.study_ids.map((id) => (
            <li key={id}>
              <button onClick={() => openNode(id)} className="text-left underline">
                {label(id)}
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Key publications</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {result.nodes.map((n) =>
            n.type === "Paper" ? (
              <li key={n.id}>
                <a href={n.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${n.pmid}/` : "#"} target="_blank" rel="noreferrer" className="underline">
                  {n.label}
                </a>
                <span className="block text-xs text-muted">
                  {n.journal} {n.pub_date} {n.pmid && `· PMID ${n.pmid}`}
                  {n.publication_status === "preprint" && <span className="ml-1 rounded bg-yellow-100 px-1 font-semibold text-yellow-900">Preprint — not peer reviewed</span>}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      </div>
    </div>
  );
}
