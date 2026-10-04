"use client";

import { useState } from "react";
import Link from "next/link";
import type { AssetEntry, GraphNode, SearchResult } from "@/lib/schemas";
import { CAUTION_LABEL, FACTOR_WEIGHTS, type OpportunityDetail, type RankedConnection, type ResearchHub } from "@/lib/analytics";
import { TopConnection } from "./ResearchSections";

type Open = (title: string, edgeIds: string[]) => void;
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function EvBtn({ ids, open, title, label = "Evidence" }: { ids: string[]; open: Open; title: string; label?: string }) {
  if (!ids.length) return null;
  return (
    <button
      onClick={() => open(title, ids)}
      aria-label={`${label}: ${title}`}
      className="shrink-0 rounded-lg border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-ink transition hover:border-brand hover:text-brand"
    >
      {label} ({ids.length})
    </button>
  );
}

/** Supported entry routes only: label, gene symbol, former gene symbol, ontology ID. */
export const ENTRY_EXAMPLES = [
  { q: "CDKL5 deficiency disorder", hint: "disease name" },
  { q: "CDKL5", hint: "gene" },
  { q: "STK9", hint: "former gene symbol" },
  { q: "MONDO:0100039", hint: "ontology ID" },
] as const;

export function EntryBreadcrumb({ result, label }: { result: SearchResult; label: (id: string) => string }) {
  const m = result.matched;
  const viaText = m.via === "alias" ? `alias “${m.matched_text}”` : m.via === "identifier" ? `identifier ${m.matched_text}` : "exact name";
  return (
    <div className="mb-4 rounded-2xl border border-line bg-white p-3 sm:p-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="How your search was resolved">
        <li className="rounded-lg bg-canvas px-2.5 py-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">You searched</span>
          <span className="font-semibold">{result.query}</span>
        </li>
        <li aria-hidden className="text-muted">→</li>
        <li className="rounded-lg bg-brand-wash px-2.5 py-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-brand">Matched entity · via {viaText}</span>
          <span className="font-semibold">
            {m.label} <span className="font-normal text-muted">({m.type.toLowerCase()})</span>
          </span>
        </li>
        <li aria-hidden className="text-muted">→</li>
        <li className="rounded-lg bg-teal-wash px-2.5 py-1">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-supported">Connected disorder</span>
          <span className="font-semibold">{label(result.disease.node_id)}</span>
        </li>
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">Try another entry:</span>
        {ENTRY_EXAMPLES.filter((e) => e.q.toLowerCase() !== result.query.toLowerCase()).map((e) => (
          <Link key={e.q} href={`/results?q=${encodeURIComponent(e.q)}`} className="rounded-full border border-line px-2 py-0.5 hover:border-brand hover:text-brand">
            {e.q} <span className="text-muted">· {e.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The first-impression result: #1 connection, why, why-not-same, asset found, next step. */
export function ResultSummary({ result, top, label }: { result: SearchResult; top?: RankedConnection; label: (id: string) => string }) {
  if (!top) return null;
  const strongest = result.asset_catalog.find((a) => a.strongest);
  const next = result.action_brief?.this_week?.next_step.text;
  return (
    <section aria-label="Result summary" className="mb-6 overflow-hidden rounded-3xl border border-line bg-white shadow-lg shadow-brand/10">
      <header className="flex flex-wrap items-end justify-between gap-3 bg-brand px-5 py-4 text-white sm:px-7">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">Strongest research opportunity for {label(result.disease.node_id)}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">#1 {label(top.disease_id)}</p>
        </div>
        <button onClick={() => scrollTo("ranking")} className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold hover:bg-white/25">
          Research connection strength: {top.score} · {top.band}
        </button>
      </header>
      <div className="grid gap-px bg-line md:grid-cols-4">
        <div className="bg-teal-wash/70 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-supported">Why this surfaced</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {top.factors.slice(0, 3).map((f) => (
              <li key={f.kind}>
                <span aria-hidden className="mr-1 font-bold text-supported">+</span>
                {FACTOR_WEIGHTS[f.kind].label}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-rose-wash/70 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-contradictory">Why this does not mean the diseases are the same</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {top.cautions.slice(0, 3).map((c) => (
              <li key={c.kind}>
                <span aria-hidden className="mr-1 font-bold text-contradictory">−</span>
                {CAUTION_LABEL[c.kind]}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-brand">Reusable asset found</h3>
          <p className="mt-2 text-sm">{strongest?.what}</p>
          <button onClick={() => scrollTo("hero")} className="mt-2 text-xs font-semibold text-brand underline">
            See reusable assets
          </button>
        </div>
        <div className="bg-ink p-4 text-white">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-white/75">What the patient group can do next</h3>
          <p className="mt-2 text-sm leading-snug">{next}</p>
          <button onClick={() => scrollTo("this-week")} className="mt-2 text-xs font-semibold text-white underline">
            Open the action workflow
          </button>
        </div>
      </div>
    </section>
  );
}

/** Decision-oriented summary of the graph: one row per ranked branch, ending where the evidence runs out. */
export function OpportunityMap({ ranked, details, label, focusId }: { ranked: RankedConnection[]; details: OpportunityDetail[]; label: (id: string) => string; focusId: string }) {
  const shortName = (id: string) => label(id).replace(/ \(NCT\d+\)$/, "").replace(/^Natural History of Rett Syndrome & Related Disorders$/, "Shared natural-history study");
  return (
    <div className="rounded-2xl border border-line bg-white p-4 sm:p-5" aria-label="Research opportunity map">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Research opportunity map: paths ranked by how actionable the evidence becomes</h3>
      <ol className="mt-3 space-y-2">
        {ranked.map((r, i) => {
          const d = details.find((x) => x.disease_id === r.disease_id)!;
          const strong = d.shared_asset_ids.length > 0;
          const steps: { t: string; tone: string }[] = [
            { t: label(focusId).replace(" deficiency disorder", "") === label(focusId) ? label(focusId) : "CDD", tone: "bg-canvas" },
            { t: label(r.disease_id), tone: strong ? "bg-teal-wash" : "bg-canvas" },
            { t: d.shared_study_ids.length ? "Shared natural-history study" : "No shared study", tone: "bg-brand-wash" },
            strong
              ? { t: "Shared asset: " + d.shared_asset_ids.map((a) => shortName(a)).join(", ").replace(/ and RTT Clinical Global Impression–Severity/, ""), tone: "bg-brand-wash" }
              : { t: "Shared study only", tone: "bg-canvas" },
            strong ? { t: `Investigators / consortium (${d.study_team_ids.length})`, tone: "bg-brand-wash" } : { t: "Further validation needed", tone: "bg-amber-wash" },
            ...(i === 0 ? [{ t: "Patient-group action", tone: "bg-ink text-white" }] : []),
          ];
          return (
            <li key={r.disease_id} className={`flex flex-wrap items-center gap-1.5 rounded-xl p-2 text-xs ${i === 0 ? "border-2 border-teal" : "border border-line opacity-90"}`}>
              <span className="mr-1 w-6 text-center font-bold text-muted">#{i + 1}</span>
              {steps.map((s, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  <span className={`rounded-lg px-2 py-1 font-medium ${s.tone}`}>{s.t}</span>
                  {j < steps.length - 1 && <span aria-hidden className="text-muted">→</span>}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted">
        The shared study&apos;s consortium also informed the CDD severity assessment (PMID 31147226). That is a property of the study, not of any one branch; branches are ranked by the
        reviewed evidence specific to each pair.
      </p>
    </div>
  );
}

/** Interactive navigator: pick a candidate, inspect why it ranked, what limits it, and what to ask next. */
export function OpportunityNavigator({
  ranked,
  details,
  hubs,
  label,
  open,
}: {
  ranked: RankedConnection[];
  details: OpportunityDetail[];
  hubs: ResearchHub[];
  label: (id: string) => string;
  open: Open;
}) {
  const [sel, setSel] = useState(ranked[0]?.disease_id);
  const r = ranked.find((x) => x.disease_id === sel) ?? ranked[0];
  const d = details.find((x) => x.disease_id === r?.disease_id);
  if (!r || !d) return null;
  const rank = ranked.indexOf(r) + 1;
  return (
    <div className="space-y-3">
      {hubs[0] && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal/40 bg-white px-4 py-3">
          <p className="text-sm">
            <span className="mr-2 rounded-md bg-teal-wash px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-supported">Research hub</span>
            <strong>{label(hubs[0].node_id)}</strong> connects {hubs[0].disease_ids.length} disorder communities.
          </p>
          <EvBtn ids={hubs[0].evidence_edge_ids} open={open} title={`Research hub: ${label(hubs[0].node_id)}`} />
        </div>
      )}
      <div role="tablist" aria-label="Ranked research opportunities" className="grid gap-2 sm:grid-cols-3">
        {ranked.map((c, i) => {
          const cd = details.find((x) => x.disease_id === c.disease_id)!;
          const active = c.disease_id === r.disease_id;
          return (
            <button
              key={c.disease_id}
              role="tab"
              aria-selected={active}
              onClick={() => setSel(c.disease_id)}
              className={`rounded-2xl border p-3 text-left transition ${active ? "border-2 border-brand bg-white shadow-md" : "border-line bg-white/70 hover:border-brand"}`}
            >
              <span className="text-xs font-bold text-muted">#{i + 1}</span>
              <span className="block font-semibold">{label(c.disease_id)}</span>
              <span className="mt-1 block text-xs">
                Strength <strong>{c.score}</strong> · {c.band}
              </span>
              <span className="mt-1 block text-xs text-muted">
                {cd.shared_asset_ids.length} shared asset{cd.shared_asset_ids.length === 1 ? "" : "s"} · {cd.study_team_ids.length} study-team investigators · {c.cautions.length} counterweights
              </span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={`Details for ${label(r.disease_id)}`}>
        <TopConnection r={r} label={label} open={open} rank={rank} />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className={`rounded-2xl p-4 text-sm ${d.shared_asset_ids.length ? "bg-teal-wash" : "bg-amber-wash"}`}>
            <h4 className="text-xs font-bold uppercase tracking-wide">Reusable assets on this path</h4>
            <p className="mt-1">{d.asset_note}</p>
            {d.shared_asset_ids.map((a) => (
              <p key={a} className="mt-1 font-medium">
                {label(a)}
              </p>
            ))}
            <p className="mt-2 text-xs text-muted">
              Shared-study team: {d.study_team_ids.map((id) => label(id)).join("; ") || "none listed"}
            </p>
          </div>
          <div className="rounded-2xl bg-ink p-4 text-sm text-white">
            <h4 className="text-xs font-bold uppercase tracking-wide text-white/75">Next investigation question</h4>
            <p className="mt-1 font-semibold leading-snug">{d.next_question}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<AssetEntry["status"], { label: string; cls: string }> = {
  supported: { label: "Supported", cls: "border-solid border-teal bg-teal-wash text-supported" },
  potentially_adaptable: { label: "Potentially adaptable", cls: "border-dashed border-brand bg-brand-wash text-brand" },
  discovery_lead: { label: "Discovery lead", cls: "border-dotted border-amber bg-amber-wash text-unknown" },
  not_established: { label: "Not established", cls: "border-double border-rose bg-rose-wash text-contradictory" },
};
const CATEGORY_LABEL: Record<AssetEntry["category"], string> = {
  shared_infrastructure: "Shared infrastructure",
  outcome_measure: "Outcome measure / assessment",
  registry_biobank: "Registry / biobank",
};

export function AssetCatalog({ assets, collaboratorCount, open }: { assets: AssetEntry[]; collaboratorCount: number; open: Open }) {
  const ordered = [...assets].sort((a, b) => Number(b.strongest) - Number(a.strongest));
  return (
    <div>
      <ul className="grid gap-3 md:grid-cols-2">
        {ordered.map((a) => {
          const st = STATUS_STYLE[a.status];
          return (
            <li key={a.asset_id} className={`rounded-2xl border bg-white p-4 ${a.strongest ? "border-2 border-teal shadow-md md:col-span-2" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                  {a.strongest && <span className="mr-1.5 rounded bg-teal px-1.5 py-0.5 text-white">Strongest asset</span>}
                  {CATEGORY_LABEL[a.category]}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
              </div>
              <p className={`mt-2 font-semibold ${a.strongest ? "text-lg" : ""}`}>{a.what}</p>
              <p className="mt-1 text-sm text-muted">{a.why_it_matters}</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <p className="flex items-start justify-between gap-2">
                  <span>{a.supported.text}</span>
                  <EvBtn ids={a.supported.evidence_edge_ids} open={open} title={a.what} />
                </p>
                <p className="flex items-start justify-between gap-2 text-ink/85">
                  <span>{a.must_validate.text}</span>
                  <EvBtn ids={a.must_validate.evidence_edge_ids} open={open} title={`Validate: ${a.what}`} />
                </p>
              </div>
            </li>
          );
        })}
        <li className="rounded-2xl border border-line bg-white p-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Investigator / consortium</span>
          <p className="mt-2 font-semibold">{collaboratorCount} relevant investigators and organizations</p>
          <button onClick={() => scrollTo("brief")} className="mt-1 text-sm font-semibold text-brand underline">
            See who is relevant, with evidence paths
          </button>
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted">Status reflects the evidence for reuse, not the asset&apos;s validity. Supported means documented in a retrieved source.</p>
    </div>
  );
}

export type { GraphNode };
