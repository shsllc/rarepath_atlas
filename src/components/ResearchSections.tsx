"use client";

import type { ActionBrief, Collaborator, EvidenceEdge, GraphNode } from "@/lib/schemas";
import { BAND_THRESHOLDS, FACTOR_WEIGHTS, type RankedConnection, type ResearchHub } from "@/lib/analytics";

type Open = (title: string, edgeIds: string[]) => void;

function EvBtn({ ids, open, title, label = "Evidence" }: { ids: string[]; open: Open; title: string; label?: string }) {
  if (ids.length === 0) return null;
  return (
    <button
      onClick={() => open(title, ids)}
      className="shrink-0 rounded-lg border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-ink transition hover:border-brand hover:text-brand"
      aria-label={`${label}: ${title}`}
    >
      {label} ({ids.length})
    </button>
  );
}

const BAND_STYLE: Record<RankedConnection["band"], string> = {
  Strongest: "bg-teal-wash text-supported border-teal/40",
  Moderate: "bg-brand-wash text-brand border-brand/30",
  Limited: "bg-canvas text-muted border-line",
};

export function RankingIntro() {
  return (
    <p className="text-sm font-medium text-ink">
        <span className="mr-2 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Research connection strength</span>
        RarePath ranks opportunities to investigate, not biological equivalence.
    </p>
  );
}

export function RankingFormula() {
  return (
      <details className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">How this ranking is calculated</summary>
        <ul className="mt-2 space-y-1 text-muted">
          {Object.values(FACTOR_WEIGHTS).map((w) => (
            <li key={w.label}>
              <strong className="text-ink">+{w.points}</strong> {w.label}
            </li>
          ))}
          <li>
            Bands: Strongest ≥ {BAND_THRESHOLDS.strongest} points; Moderate ≥ {BAND_THRESHOLDS.moderate}; otherwise Limited.
          </li>
          <li>Only analyst-reviewed, sourced relationships count. AI-only extractions, inferred and contradicted links add no points. Counterweights are always listed.</li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          This ranks research paths worth investigating. It is not a measure of biological, clinical or treatment similarity.
        </p>
      </details>
  );
}

/** Graph analytics: transparent research-connection ranking + research hubs. */
export function RankingPanel({ ranked, hubs, label, open }: { ranked: RankedConnection[]; hubs: ResearchHub[]; label: (id: string) => string; open: Open }) {
  const max = Math.max(...ranked.map((r) => r.score), 1);
  return (
    <div className="space-y-4">
      {hubs[0] && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal/40 bg-white px-4 py-3">
          <p className="text-sm">
            <span className="mr-2 rounded-md bg-teal-wash px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-supported">Research hub</span>
            <strong>{label(hubs[0].node_id)}</strong> connects {hubs[0].disease_ids.length} disorder communities:{" "}
            {hubs[0].disease_ids.map(label).join(", ")}.
          </p>
          <EvBtn ids={hubs[0].evidence_edge_ids} open={open} title={`Research hub: ${label(hubs[0].node_id)}`} />
        </div>
      )}

      <RankingIntro />

      {ranked[0] && <TopConnection r={ranked[0]} label={label} open={open} />}

      <ol className="space-y-3">
        {ranked.slice(1).map((r, idx) => {
          const i = idx + 1;
          return (
          <li key={r.disease_id} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-3 text-lg font-semibold">
                <span className="text-sm font-bold text-muted">#{i + 1}</span>
                {label(r.disease_id)}
              </h3>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[r.band]}`}>
                {r.band} research connection · {r.score} {r.score === 1 ? "point" : "points"}
              </span>
            </div>
            {/* score bar: one segment per factor, labelled — never color alone */}
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-canvas" role="img" aria-label={`${r.score} of ${max} evidence points`}>
              {r.factors.map((f, j) => (
                <span key={j} className={j % 2 ? "bg-teal" : "bg-brand"} style={{ width: `${(f.points / max) * 100}%` }} />
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-supported">Why it ranked</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {r.factors.map((f, j) => (
                    <li key={j} className="flex items-start justify-between gap-2">
                      <span>
                        <span className="mr-1.5 inline-block min-w-8 rounded bg-canvas px-1 text-center text-xs font-semibold">+{f.points}</span>
                        {FACTOR_WEIGHTS[f.kind].label}: <span className="text-muted">{f.detail}</span>
                      </span>
                      <EvBtn ids={f.evidence_edge_ids} open={open} title={`${label(r.disease_id)}: ${FACTOR_WEIGHTS[f.kind].label}`} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-contradictory">What limits the connection</h4>
                <ul className="mt-2 space-y-2 text-sm">
                  {r.cautions.map((c, j) => (
                    <li key={j} className="flex items-start justify-between gap-2">
                      <span>
                        <span aria-hidden className="mr-1.5 text-contradictory">▲</span>
                        {c.detail}
                      </span>
                      <EvBtn ids={c.evidence_edge_ids} open={open} title={`${label(r.disease_id)}: ${c.detail}`} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
          );
        })}
      </ol>

      <RankingFormula />
    </div>
  );
}

/** The #1 connection, explained in two columns. The score is deliberately secondary to the reasons. */
export function TopConnection({ r, label, open, rank = 1 }: { r: RankedConnection; label: (id: string) => string; open: Open; rank?: number }) {
  return (
    <article aria-label={`Why ${label(r.disease_id)} ranked number ${rank}`} className="overflow-hidden rounded-3xl border border-line bg-white shadow-md shadow-brand/10">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Why this ranked #{rank}</p>
          <h3 className="mt-0.5 text-2xl font-semibold tracking-tight">{label(r.disease_id)}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BAND_STYLE[r.band]}`}>
          {r.score} — {r.band} research connection
        </span>
      </header>
      <div className="grid md:grid-cols-2">
        <div className="bg-teal-wash/70 p-5 sm:p-6">
          <h4 className="text-xs font-bold uppercase tracking-wide text-supported">Evidence raising the connection</h4>
          <ul className="mt-3 space-y-2.5 text-sm">
            {r.factors.map((f, j) => (
              <li key={j} className="flex items-start justify-between gap-2">
                <span>
                  <span aria-hidden className="mr-1.5 font-bold text-supported">+</span>
                  {FACTOR_WEIGHTS[f.kind].label}
                  <span className="block pl-4 text-xs text-muted">{f.detail}</span>
                </span>
                <EvBtn ids={f.evidence_edge_ids} open={open} title={`${label(r.disease_id)}: ${FACTOR_WEIGHTS[f.kind].label}`} />
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-rose-wash/70 p-5 sm:p-6">
          <h4 className="text-xs font-bold uppercase tracking-wide text-contradictory">Why this does not mean the diseases are the same</h4>
          <ul className="mt-3 space-y-2.5 text-sm">
            {r.cautions.map((c, j) => (
              <li key={j} className="flex items-start justify-between gap-2">
                <span>
                  <span aria-hidden className="mr-1.5 font-bold text-contradictory">−</span>
                  {c.detail}
                </span>
                <EvBtn ids={c.evidence_edge_ids} open={open} title={`${label(r.disease_id)}: ${c.detail}`} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

/** Collaborator cards: relevance only, public metadata, no contact details. */
export function CollaboratorCards({ collaborators, nodes, open, compact = false }: { collaborators: Collaborator[]; nodes: Map<string, GraphNode>; open: Open; compact?: boolean }) {
  return (
    <div>
      <ul className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
        {collaborators.map((c) => {
          const n = nodes.get(c.node_id);
          return (
            <li key={c.node_id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{n?.type === "PatientOrganization" ? "Organization" : "Investigator"} · relevant to this research path</p>
                  <h4 className="mt-0.5 font-semibold">{n?.label ?? c.node_id}</h4>
                </div>
                <EvBtn ids={c.evidence_edge_ids} open={open} title={`${n?.label ?? c.node_id}: evidence path`} label="Evidence path" />
              </div>
              <p className="mt-1 text-sm">{c.role}</p>
              {!compact && <p className="mt-2 text-sm text-muted">{c.why_relevant}</p>}
              {c.identity_note && <p className="mt-1 text-xs text-muted">{c.identity_note}</p>}
              <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">A question that would make sense: </span>
                {c.collaboration_question}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">From public PubMed author, ClinicalTrials.gov investigator and organization metadata. Relevance does not indicate availability or willingness to collaborate. No contact details are stored.</p>
    </div>
  );
}

/** Research Action Brief: the one-page output a patient-group leader can take into a research conversation. */
export function ActionBriefPanel({
  brief,
  collaborators,
  nodes,
  open,
}: {
  brief: ActionBrief;
  collaborators: Collaborator[];
  nodes: Map<string, GraphNode>;
  open: Open;
}) {
  const who = collaborators.filter((c) => brief.who_is_relevant.includes(c.node_id));
  const Row = ({ title, tone = "", children }: { title: string; tone?: string; children: React.ReactNode }) => (
    <div className={`rounded-2xl p-4 sm:p-5 ${tone || "bg-white border border-line"}`}>
      <h3 className="text-xs font-bold uppercase tracking-wide">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
  const Lines = ({ lines, icon }: { lines: { text: string; evidence_edge_ids: string[] }[]; icon?: string }) => (
    <ul className="space-y-2 text-sm leading-relaxed">
      {lines.map((l, i) => (
        <li key={i} className="flex items-start justify-between gap-3">
          <span>
            {icon && (
              <span aria-hidden className="mr-1.5">
                {icon}
              </span>
            )}
            {l.text}
          </span>
          <EvBtn ids={l.evidence_edge_ids} open={open} title={l.text.slice(0, 80)} />
        </li>
      ))}
    </ul>
  );
  return (
    <article aria-label="Research Action Brief" className="overflow-hidden rounded-3xl border-2 border-brand bg-white shadow-lg shadow-brand/10">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-brand px-5 py-4 text-white sm:px-7">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">Research Action Brief · CDKL5 deficiency disorder</p>
          <p className="mt-1 text-lg font-semibold leading-snug sm:text-xl">{brief.opportunity.text}</p>
        </div>
        <button
          onClick={() => open("Research Action Brief: opportunity", brief.opportunity.evidence_edge_ids)}
          className="rounded-lg border border-white/40 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10"
        >
          Evidence ({brief.opportunity.evidence_edge_ids.length})
        </button>
      </header>
      <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
        <Row title="Why it surfaced">
          <Lines lines={brief.why_surfaced} icon="●" />
        </Row>
        <Row title="Existing assets">
          <Lines lines={brief.existing_assets} icon="◇" />
        </Row>
        <div className="lg:col-span-2">
          <Row title="Who is relevant to this research path" tone="bg-brand-wash">
            <CollaboratorCards collaborators={who} nodes={nodes} open={open} compact />
          </Row>
        </div>
        <Row title="Bring these sources">
          <ul className="space-y-2 text-sm">
            {brief.bring_sources.map((b) => (
              <li key={b.url} className="flex items-start justify-between gap-3">
                <a href={b.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-brand">
                  {b.label}
                </a>
                <EvBtn ids={b.evidence_edge_ids} open={open} title={b.label} />
              </li>
            ))}
          </ul>
        </Row>
        <Row title="Question to ask" tone="bg-ink text-white [&_button]:text-ink">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-semibold leading-snug">{brief.question.text}</p>
            <EvBtn ids={brief.question.evidence_edge_ids} open={open} title="Question to ask" />
          </div>
          <p className="mt-2 text-xs text-white/70">A research question, not medical advice.</p>
        </Row>
        <Row title="What must be validated" tone="bg-amber-wash">
          <Lines lines={brief.must_validate} icon="?" />
        </Row>
        <Row title="What this does not mean" tone="bg-rose-wash">
          <Lines lines={brief.does_not_mean} icon="▲" />
        </Row>
      </div>
    </article>
  );
}

export type { EvidenceEdge };
