"use client";

import { useCallback, useMemo, useState } from "react";
import type { EvidenceEdge, GraphNode, SourceRecord } from "@/lib/schemas";
import type { DiseaseJourney, JourneyFact } from "@/lib/journey";
import { researchHubs } from "@/lib/analytics";
import type { DrawerTarget } from "@/lib/graph-view";
import { PREDICATE_LABEL } from "@/lib/format";
import { RankingPanel } from "./ResearchSections";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { StatusBadge } from "./StatusBadge";
import { EvidenceTierChip } from "./EvidenceTierChip";

type Open = (title: string, edgeIds: string[]) => void;
const NO_SOURCES = new Map<string, SourceRecord>();

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
        <EvidenceTierChip tier="reviewed" />
      </div>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ f, focus, open }: { f: JourneyFact; focus: string; open: Open }) {
  const sentence =
    f.direction === "out" ? (
      <>
        {focus} {PREDICATE_LABEL[f.predicate]} <strong>{f.other_label}</strong>
      </>
    ) : (
      <>
        <strong>{f.other_label}</strong> {PREDICATE_LABEL[f.predicate]} {focus}
      </>
    );
  return (
    <li className="py-2 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status={f.status} compact />
        {f.stance !== "supports" && <span className="rounded border border-contradictory px-1.5 py-0.5 text-[11px] font-semibold text-contradictory">{f.stance}</span>}
        <span>{sentence}</span>
      </span>
      <span className="mt-1 block text-xs text-muted">
        &ldquo;{f.quote.slice(0, 280)}&rdquo;{" "}
        <a href={f.source_url} target="_blank" rel="noreferrer" className="whitespace-nowrap text-brand hover:underline">
          {f.source} ↗
        </a>{" "}
        <button onClick={() => open(f.other_label, [f.edge_id])} className="text-brand hover:underline">
          Evidence
        </button>
      </span>
      {f.review && (
        <span className="mt-1 block text-[11px] text-muted">
          Reviewed by {f.review.by_name} on {f.review.at.slice(0, 10)}
          {f.review.note && <>: {f.review.note}</>}
        </span>
      )}
    </li>
  );
}

/** `coveredEdgeIds`: relationships already shown by the coverage blocks, so they are not repeated here. */
export function JourneySections({ journey, nodes: nodeList, edges: edgeList, focusLabel, coveredEdgeIds = [] }: { journey: DiseaseJourney; nodes: GraphNode[]; edges: EvidenceEdge[]; focusLabel: string; coveredEdgeIds?: string[] }) {
  const nodes = useMemo(() => new Map(nodeList.map((n) => [n.id, n])), [nodeList]);
  const edges = useMemo(() => new Map(edgeList.map((e) => [e.id, e])), [edgeList]);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const close = useCallback(() => setDrawer(null), []);
  const open: Open = (title, edgeIds) => setDrawer({ kind: "edges", title, edgeIds });
  const label = (id: string) => nodes.get(id)?.label ?? id;
  const hubs = useMemo(() => researchHubs(nodeList, edgeList).filter((h) => h.disease_ids.includes(journey.disease_id)), [nodeList, edgeList, journey.disease_id]);
  const b = journey.brief;
  const counterIds = new Set(journey.counter.map((f) => f.edge_id));
  const covered = new Set(coveredEdgeIds);
  const other = journey.facts.filter((f) => !counterIds.has(f.edge_id) && !covered.has(f.edge_id));

  return (
    <div className="space-y-4">
      {other.length > 0 && (
        <Panel title="Other reviewed relationships" note={journey.reviewers.length ? `Checked against their sources by ${journey.reviewers.join(", ")}.` : undefined}>
          <ul className="divide-y divide-line">
            {other.map((f) => (
              <Fact key={f.edge_id} f={f} focus={focusLabel} open={open} />
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Counter-evidence and limits" note="Shown next to everything else, always. A strong connection is not the same disease.">
        {journey.counter.length === 0 ? (
          <p className="text-sm text-muted">No reviewed source contradicts or qualifies these relationships yet. That is an absence of review, not proof.</p>
        ) : (
          <ul className="divide-y divide-line">
            {journey.counter.map((f) => (
              <Fact key={f.edge_id} f={f} focus={focusLabel} open={open} />
            ))}
          </ul>
        )}
      </Panel>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Research connection strength</h2>
        {journey.ranked.length === 0 ? (
          <p className="text-sm text-muted">No other disease shares a reviewed study, research asset or clinical feature with {focusLabel} yet, so nothing is ranked.</p>
        ) : (
          <RankingPanel ranked={journey.ranked} hubs={hubs} label={label} open={open} />
        )}
      </section>

      <section className="rounded-2xl border-2 border-brand bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand">Research Action Brief · {focusLabel}</h2>
          <span className="rounded border border-dashed border-brand px-2 py-0.5 text-[11px] font-semibold text-brand">Generated from reviewed evidence</span>
        </div>
        {!b ? (
          <p className="mt-3 text-sm text-muted">Not available yet. {journey.brief_blocker}</p>
        ) : (
          <div className="mt-3 space-y-4 text-sm">
            <p className="text-base font-semibold">{b.opportunity}</p>
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted">Why this surfaced</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {b.why.map((w, i) => (
                  <li key={i}>
                    {w.text}{" "}
                    <button onClick={() => open("Why this surfaced", w.edge_ids)} className="text-xs text-brand hover:underline">
                      Evidence
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {(b.assets.length > 0 || b.studies.length > 0 || b.team.length > 0) && (
              <div className="grid gap-3 md:grid-cols-3">
                {b.assets.length > 0 && <List title="Existing assets" items={b.assets.map((x) => x.label)} />}
                {b.studies.length > 0 && <List title="Shared studies" items={b.studies.map((x) => x.label)} />}
                {b.team.length > 0 && <List title="Listed study investigators" items={b.team.map((x) => x.label)} />}
              </div>
            )}
            <div className="rounded-xl bg-brand-wash p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-brand">The question to ask</h3>
              <p className="mt-1 font-semibold">{b.question}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <List title="Must validate first" items={b.must_validate} />
              <List title="This does not mean" items={b.does_not_mean} />
            </div>
            {b.cautions.length > 0 && <List title="Counterweights on this connection" items={b.cautions.map((c) => c.detail)} />}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted">Bring these sources</h3>
              <ul className="mt-1 space-y-1">
                {b.bring_sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {s.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted">
              Assembled by a fixed template from {b.edge_ids.length} reviewed relationship{b.edge_ids.length === 1 ? "" : "s"}. No language model wrote this brief.
            </p>
          </div>
        )}
      </section>

      <EvidenceDrawer request={drawer} onClose={close} onNavigate={setDrawer} nodes={nodes} edges={edges} sources={NO_SOURCES} />
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
