"use client";

import { useEffect, useState } from "react";
import { deriveEvidenceStatus, type EvidenceEdge, type EvidenceItem, type GraphNode } from "@/lib/schemas";
import { METHOD_LABEL, PREDICATE_LABEL } from "@/lib/format";
import { FixtureChip, StatusBadge } from "./StatusBadge";

export interface DrawerRequest {
  title: string;
  edgeIds: string[];
}

interface Props {
  request: DrawerRequest | null;
  onClose: () => void;
  nodes: Map<string, GraphNode>;
  edges: Map<string, EvidenceEdge>;
}

type Explain = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "done"; text: string; caveats: string[] };

export function EvidenceDrawer({ request, onClose, nodes, edges }: Props) {
  const [explain, setExplain] = useState<Explain>({ state: "idle" });

  useEffect(() => {
    setExplain({ state: "idle" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onClose]);

  if (!request) return null;
  const list = request.edgeIds.map((id) => edges.get(id)).filter((e): e is EvidenceEdge => !!e);
  const label = (id: string) => nodes.get(id)?.label ?? id;

  async function runExplain() {
    setExplain({ state: "loading" });
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edge_ids: request!.edgeIds, audience: "family" }),
    });
    const json = await res.json();
    if (!res.ok) setExplain({ state: "error", message: json.error ?? `HTTP ${res.status}` });
    else setExplain({ state: "done", text: json.plain_language, caveats: json.caveats ?? [] });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Evidence details">
      <button className="absolute inset-0 bg-black/30" aria-label="Close evidence" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Evidence trail</p>
            <h2 className="mt-1 text-lg font-semibold">{request.title}</h2>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-muted hover:bg-canvas" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-line bg-canvas p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Explain in plain language</span>
            <button onClick={runExplain} disabled={explain.state === "loading"} className="rounded bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
              {explain.state === "loading" ? "Explaining…" : "Explain (OpenAI)"}
            </button>
          </div>
          {explain.state === "error" && <p className="mt-2 text-contradictory">{explain.message}</p>}
          {explain.state === "done" && (
            <div className="mt-2 space-y-2">
              <p>{explain.text}</p>
              {explain.caveats.length > 0 && (
                <ul className="list-disc pl-5 text-muted">
                  {explain.caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">AI-generated summary of the evidence below. Not medical advice.</p>
            </div>
          )}
        </div>

        <ol className="mt-6 space-y-4">
          {list.map((e) => {
            const status = deriveEvidenceStatus(e);
            return (
              <li key={e.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <span className="text-xs text-muted">confidence: {e.confidence}</span>
                  {e.inferred && <span className="text-xs font-medium text-inferred">inferred = true</span>}
                  {e.source_type === "demo_fixture" && <FixtureChip />}
                </div>
                <p className="mt-2 font-medium">
                  {label(e.subject_id)} <span className="font-normal text-muted">{PREDICATE_LABEL[e.predicate]}</span> {label(e.object_id)}
                </p>
                {e.evidence_type === "llm_extraction" && (
                  <p className="mt-2 rounded bg-canvas p-2 text-xs text-muted">
                    Found by the OpenAI Evidence Extractor. The quote is verified verbatim in the source, but this relationship has not been reviewed by an analyst.
                  </p>
                )}
                {e.contradiction_status !== "none" && (
                  <p className="mt-2 rounded bg-contradictory-bg p-2 text-sm text-contradictory">
                    <strong>{e.contradiction_status}:</strong> {e.contradiction_notes}
                  </p>
                )}
                <ul className="mt-3 space-y-3">
                  {(e.evidence.length ? e.evidence : [fallbackItem(e)]).map((ev) => (
                    <EvidenceItemView key={ev.id} ev={ev} />
                  ))}
                </ul>
                <p className="mt-2 font-mono text-[10px] text-muted">{e.id}</p>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

function fallbackItem(e: EvidenceEdge): EvidenceItem {
  return {
    id: `${e.id}:primary`,
    source: e.source,
    source_url: e.source_url,
    retrieval_date: e.retrieval_date,
    source_type: e.source_type,
    evidence_type: e.evidence_type,
    quoted_or_structured_evidence: e.quoted_or_structured_evidence,
    method: e.source_type === "demo_fixture" ? "fixture" : "analyst_quote",
    stance: "supports",
  };
}

const STANCE = {
  supports: { label: "Supports", cls: "text-supported" },
  contradicts: { label: "Contradicts", cls: "text-contradictory" },
  qualifies: { label: "Limitation / caveat", cls: "text-muted" },
} as const;

function CitationLinks({ c }: { c: EvidenceItem["citation"] }) {
  if (!c) return null;
  const links: [string, string][] = [];
  if (c.pmid) links.push([`PMID ${c.pmid}`, `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`]);
  if (c.pmcid) links.push([c.pmcid, `https://pmc.ncbi.nlm.nih.gov/articles/${c.pmcid}/`]);
  if (c.doi) links.push([`DOI ${c.doi}`, `https://doi.org/${c.doi}`]);
  if (c.nct) links.push([c.nct, `https://clinicaltrials.gov/study/${c.nct}`]);
  if (links.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {links.map(([t, u]) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="text-ink underline">
          {t}
        </a>
      ))}
    </span>
  );
}

function EvidenceItemView({ ev }: { ev: EvidenceItem }) {
  const stance = STANCE[ev.stance ?? "supports"];
  return (
    <li className="rounded border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`font-semibold ${stance.cls}`}>{stance.label}</span>
        {ev.method === "openai_extractor" && <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">OpenAI extracted</span>}
        {ev.source_type === "demo_fixture" && <FixtureChip />}
      </div>
      <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-ink/80">&ldquo;{ev.quoted_or_structured_evidence}&rdquo;</blockquote>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
        <dt>Source</dt>
        <dd>
          <a href={ev.source_url} target="_blank" rel="noreferrer" className="text-ink underline">
            {ev.source}
          </a>
        </dd>
        {ev.citation && (ev.citation.pmid || ev.citation.nct || ev.citation.doi) && (
          <>
            <dt>Citation</dt>
            <dd>
              <CitationLinks c={ev.citation} />
            </dd>
          </>
        )}
        <dt>Source type</dt>
        <dd>{ev.source_type.replace(/_/g, " ")}</dd>
        <dt>How obtained</dt>
        <dd>
          {METHOD_LABEL[ev.method ?? "fixture"]}
          {ev.extraction && ` · ${ev.extraction.model}`}
        </dd>
        <dt>Retrieved</dt>
        <dd>{ev.retrieval_date}</dd>
      </dl>
    </li>
  );
}
