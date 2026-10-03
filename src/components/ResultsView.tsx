"use client";

import { useCallback, useMemo, useState } from "react";
import type { EvidenceEdge, GraphNode, SearchResult } from "@/lib/schemas";
import { ASSET_KIND_LABEL, CONNECTION_TYPE_LABEL, REUSE_LABEL } from "@/lib/format";
import { EvidenceDrawer, type DrawerRequest } from "./EvidenceDrawer";
import { FixtureChip, STATUS_META, StatusBadge, StatusLegend } from "./StatusBadge";
import { GraphPlaceholder } from "./GraphPlaceholder";

function Section({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10" aria-labelledby={`s${n}`}>
      <h2 id={`s${n}`} className="flex items-baseline gap-2 text-xl font-semibold">
        <span className="text-sm font-medium text-muted">{n}</span>
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EvidenceButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded border border-line px-2 py-1 text-xs font-medium hover:border-ink">
      View evidence ({count})
    </button>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
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

export function ResultsView({ result }: { result: SearchResult }) {
  const nodes = useMemo(() => new Map<string, GraphNode>(result.nodes.map((n) => [n.id, n])), [result.nodes]);
  const edges = useMemo(() => new Map<string, EvidenceEdge>(result.edges.map((e) => [e.id, e])), [result.edges]);
  const [drawer, setDrawer] = useState<DrawerRequest | null>(null);
  const close = useCallback(() => setDrawer(null), []);
  const open = (title: string, edgeIds: string[]) => setDrawer({ title, edgeIds });
  const label = (id: string) => nodes.get(id)?.label ?? id;
  const isFixture = (ids: string[]) => ids.some((id) => edges.get(id)?.source_type === "demo_fixture");

  const disease = nodes.get(result.disease.node_id)!;
  const cov = result.disease.coverage;
  const diseaseEdges = result.edges.filter((e) => e.subject_id === disease.id && ["caused_by_variant_in", "has_phenotype"].includes(e.predicate)).map((e) => e.id);
  const orgEdges = (orgId: string) => result.edges.filter((e) => e.subject_id === orgId).map((e) => e.id);

  return (
    <div>
      {result.is_fixture && (
        <div role="alert" className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <strong>Demo data.</strong> {result.fixture_warning}
        </div>
      )}
      {!result.is_fixture && (
        <div className="mb-6 rounded-lg border border-line bg-white p-3 text-sm">
          <strong>Built from {result.sources.length} retrieved public sources</strong>{" "}
          <span className="text-muted">
            (PubMed, PubMed Central, ClinicalTrials.gov, NIH RePORTER, MONDO/HPO, HGNC, official organization sites). Every statement opens to its verbatim source quote.
          </span>
          {result.build_info?.openai_runs.map((r) => (
            <p key={r.run_id} className="mt-1 text-xs text-muted">
              OpenAI {r.role} ({r.model}): {r.summary}
            </p>
          ))}
        </div>
      )}
      <StatusLegend />

      {/* 1. YOUR DISEASE */}
      <Section n={1} title="Your disease">
        <div className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold">{disease.label}</h3>
              {result.matched.node_id !== disease.id && (
                <p className="text-sm text-muted">
                  You searched &ldquo;{result.query}&rdquo; → matched {result.matched.type} <strong>{result.matched.label}</strong>
                </p>
              )}
              {disease.lay_summary && <p className="mt-2 max-w-2xl">{disease.lay_summary}</p>}
            </div>
            <EvidenceButton count={diseaseEdges.length} onClick={() => open(`${disease.label}: genes and features`, diseaseEdges)} />
          </div>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Identifiers</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {disease.external_ids.map((x) => (
                  <a key={x.system + x.id} href={x.url} target="_blank" rel="noreferrer" className="rounded border border-line px-1.5 py-0.5 font-mono text-xs" title={`verification: ${x.verification}`}>
                    {x.id.includes(":") ? x.id : `${x.system}:${x.id}`}
                    {x.verification !== "verified" && <span className="ml-1 text-yellow-700">({x.verification === "pending" ? "pending" : "unverified"})</span>}
                  </a>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Gene(s)</dt>
              <dd className="mt-1">{result.disease.gene_ids.map(label).join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Mechanism / pathway</dt>
              <dd className="mt-1">{result.disease.mechanism_ids.map(label).join("; ") || <span className="text-muted">Not described in the retrieved sources (see &ldquo;What we don&apos;t know&rdquo;)</span>}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Key features</dt>
              <dd className="mt-1">{result.disease.phenotype_ids.map(label).join(", ") || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence coverage (all relationships on this page)</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(cov) as (keyof typeof cov)[]).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <StatusBadge status={k} compact /> <span className="font-semibold">{cov[k]}</span>
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </div>
      </Section>

      {/* 2. CONNECTED COMMUNITIES */}
      <Section n={2} title="Connected communities" subtitle="Other rare-disease communities linked to yours, and how strong each link is.">
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
                <EvidenceButton count={c.evidence_count} onClick={() => open(`${label(c.disease_id)} — ${CONNECTION_TYPE_LABEL[c.connection_type]}`, c.evidence_edge_ids)} />
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* 3. REUSABLE RESEARCH — hero */}
      <Section n={3} title="Reusable research" subtitle="What another community has already built that yours may be able to reuse. Every card is a hypothesis to check, not a conclusion.">
        <div className="space-y-4">
          {result.opportunities.map((o) => {
            const asset = nodes.get(o.asset_id);
            const kind = asset?.type === "ResearchAsset" ? ASSET_KIND_LABEL[asset.asset_kind] : "Research asset";
            return (
              <article key={o.id} className={`rounded-xl border border-line bg-white p-5 shadow-sm ${STATUS_META[o.status].card}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      <span className="rounded bg-ink px-1.5 py-0.5 text-white">{REUSE_LABEL[o.reuse_classification]}</span> · {kind}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">{o.headline}</h3>
                    <p className="text-sm text-muted">Built by the {label(o.source_disease_id)} community</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1">
                      {isFixture(o.evidence_edge_ids) && <FixtureChip />}
                      <StatusBadge status={o.status} />
                    </span>
                    <span className="text-xs text-muted">Confidence: {o.confidence}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <List title="Why it may help" items={o.why_it_may_transfer} />
                  <List title="What differs" items={o.what_differs} />
                  <List title="What remains uncertain" items={o.what_is_uncertain} />
                  <List title="Requires expert validation" items={o.requires_expert_validation} />
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
                        <button onClick={() => open(`Why: ${a.label}`, a.evidence_edge_ids)} className="shrink-0 text-xs underline">
                          why?
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="mt-3">
                  <EvidenceButton count={o.evidence_edge_ids.length} onClick={() => open(o.headline, o.evidence_edge_ids)} />
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      {/* 4. PEOPLE & COMMUNITIES */}
      <Section n={4} title="People & communities">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Patient organizations</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {result.people.organization_ids.map((id) => {
                const n = nodes.get(id);
                return (
                  <li key={id} className="flex items-start justify-between gap-2">
                    <span>
                      {n?.type === "PatientOrganization" && n.website ? (
                        <a href={n.website} target="_blank" rel="noreferrer" className="underline">
                          {n.label}
                        </a>
                      ) : (
                        label(id)
                      )}
                    </span>
                    <button onClick={() => open(label(id), orgEdges(id))} className="shrink-0 text-xs underline">
                      evidence
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Investigators</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {result.people.researcher_ids.map((id) => {
                const n = nodes.get(id);
                const ev = result.edges.filter((e) => e.subject_id === id).map((e) => e.id);
                return (
                  <li key={id} className="flex items-start justify-between gap-2">
                    <span>
                      {label(id)}
                      {n?.type === "Researcher" && n.description && <span className="block text-xs text-muted">{n.description}</span>}
                    </span>
                    {ev.length > 0 && (
                      <button onClick={() => open(label(id), ev)} className="shrink-0 text-xs underline">
                        evidence
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Studies & labs</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {result.people.study_ids.map((id) => {
                const n = nodes.get(id);
                return (
                  <li key={id}>
                    {n?.type === "Study" && n.nct ? (
                      <a href={`https://clinicaltrials.gov/study/${n.nct}`} target="_blank" rel="noreferrer" className="underline">
                        {label(id)}
                      </a>
                    ) : (
                      label(id)
                    )}
                    {n?.type === "Study" && n.conditions.length > 0 && (
                      <span className="block text-xs text-muted">
                        Conditions: {n.conditions.join("; ")}
                        {n.status ? ` · ${n.status.toLowerCase()}` : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Key publications</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {result.nodes
                .filter((n) => n.type === "Paper")
                .map((n) =>
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
      </Section>

      {/* 5. WHAT WE DON'T KNOW */}
      <Section n={5} title="What we don't know" subtitle="Missing evidence, disagreements and assumptions behind this page.">
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

      {/* 6. EXPLORE EVIDENCE GRAPH */}
      <Section n={6} title="Explore the evidence graph" subtitle="Every line is a relationship with its own sources. Click one to inspect it.">
        <GraphPlaceholder nodes={result.nodes} edges={result.edges} onSelectEdge={(e) => open(`${label(e.subject_id)} → ${label(e.object_id)}`, [e.id])} />
      </Section>

      <EvidenceDrawer request={drawer} onClose={close} nodes={nodes} edges={edges} />
    </div>
  );
}
