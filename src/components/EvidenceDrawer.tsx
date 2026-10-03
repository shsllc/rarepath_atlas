"use client";

import { useEffect, useRef, useState } from "react";
import { deriveEvidenceStatus, type EvidenceEdge, type EvidenceItem, type GraphNode, type SourceRecord } from "@/lib/schemas";
import { METHOD_LABEL, PREDICATE_LABEL } from "@/lib/format";
import type { DrawerTarget } from "@/lib/graph-view";
import { FixtureChip, StatusBadge } from "./StatusBadge";

interface Props {
  request: DrawerTarget | null;
  onClose: () => void;
  onNavigate: (t: DrawerTarget) => void;
  nodes: Map<string, GraphNode>;
  edges: Map<string, EvidenceEdge>;
  sources: Map<string, SourceRecord>;
}

interface Explanation {
  why_it_matters: string;
  evidence_shows: string;
  does_not_show: string;
  next_question: string;
  word_count: number;
  quality_issues: string[];
}
type Explain = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "done"; e: Explanation };

export function EvidenceDrawer({ request, onClose, onNavigate, nodes, edges, sources }: Props) {
  const [explain, setExplain] = useState<Explain>({ state: "idle" });
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  const isOpen = request !== null;

  // Focus moves into the dialog on open and returns to the opener on close.
  useEffect(() => {
    if (isOpen) {
      openerRef.current ??= document.activeElement;
      closeRef.current?.focus();
    } else if (openerRef.current instanceof HTMLElement) {
      openerRef.current.focus();
      openerRef.current = null;
    }
  }, [isOpen, request]);

  useEffect(() => {
    setExplain({ state: "idle" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onClose]);

  if (!request) return null;
  const label = (id: string) => nodes.get(id)?.label ?? id;
  const node = request.kind === "node" ? nodes.get(request.nodeId) : undefined;
  const edgeIds =
    request.kind === "edges"
      ? request.edgeIds
      : [...edges.values()].filter((e) => e.subject_id === request.nodeId || e.object_id === request.nodeId).map((e) => e.id);
  const list = edgeIds.map((id) => edges.get(id)).filter((e): e is EvidenceEdge => !!e);
  const title = request.kind === "edges" ? request.title : (node?.label ?? request.nodeId);

  async function runExplain() {
    setExplain({ state: "loading" });
    let res: Response;
    try {
      res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edge_ids: edgeIds.slice(0, 12), audience: "family" }),
      });
    } catch {
      setExplain({ state: "error", message: "Could not reach the explanation service. The evidence below is unchanged. Please try again." });
      return;
    }
    let json: { error?: string } & Partial<Explanation> = {};
    try {
      json = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok || !json.why_it_matters) {
      setExplain({ state: "error", message: json.error ?? "The explanation service is unavailable right now. The evidence below is unchanged. Please try again." });
    } else setExplain({ state: "done", e: json as Explanation });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Evidence details">
      <button className="absolute inset-0 bg-black/30" aria-label="Close evidence" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{request.kind === "node" ? `Entity · ${node?.type ?? ""}` : "Evidence trail"}</p>
            <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded px-2 py-1 text-muted hover:bg-canvas" aria-label="Close evidence panel">
            ✕
          </button>
        </div>

        {node && <NodeDetails node={node} sources={sources} />}

        {list.length > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-canvas p-3 text-sm" data-testid="explain-panel">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Explain this connection</span>
              <button onClick={runExplain} disabled={explain.state === "loading"} className="rounded bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                {explain.state === "loading" ? "Explaining…" : "Explain (OpenAI)"}
              </button>
            </div>
            {explain.state === "error" && (
              <div role="status" className="mt-2 rounded border border-line bg-white p-2 text-sm">
                <p>{explain.message}</p>
                <button onClick={runExplain} className="mt-1 text-xs font-medium underline">
                  Try again
                </button>
              </div>
            )}
            {explain.state === "loading" && (
              <p role="status" className="mt-2 text-xs text-muted">
                Writing a plain-language summary of the quotes below…
              </p>
            )}
            {explain.state === "done" && (
              <div className="mt-3 space-y-3">
                <ExplainPart title="Why this connection matters" text={explain.e.why_it_matters} />
                <ExplainPart title="What the evidence shows" text={explain.e.evidence_shows} />
                <ExplainPart title="What it does not show" text={explain.e.does_not_show} />
                <ExplainPart title="Next question to ask" text={explain.e.next_question} strong />
                <p className="text-xs text-muted">
                  AI-generated from the quotes below by the OpenAI Path Explainer ({explain.e.word_count} words). Not medical advice.
                  {explain.e.quality_issues?.length > 0 && ` Quality check flagged: ${explain.e.quality_issues.join("; ")}.`}
                </p>
              </div>
            )}
          </div>
        )}

        {request.kind === "node" && <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Evidence-backed relationships ({list.length})</h3>}
        <ol className="mt-6 space-y-4">
          {list.map((e) => {
            const status = deriveEvidenceStatus(e);
            return (
              <li key={e.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} />
                  <span className="text-xs text-muted">confidence: {e.confidence}</span>
                  {e.inferred && <span className="text-xs font-medium text-inferred">inferred = true</span>}
                  <span className="text-xs text-muted">
                    AI involvement:{" "}
                    {e.evidence.some((x) => x.method === "openai_extractor")
                      ? e.evidence.every((x) => x.method === "openai_extractor")
                        ? "OpenAI extracted (unreviewed)"
                        : "OpenAI corroborated"
                      : "none"}
                  </span>
                  {e.source_type === "demo_fixture" && <FixtureChip />}
                </div>
                <p className="mt-2 font-medium">
                  <button className="text-left hover:underline" onClick={() => onNavigate({ kind: "node", nodeId: e.subject_id })}>
                    {label(e.subject_id)}
                  </button>{" "}
                  <span className="font-normal text-muted">{PREDICATE_LABEL[e.predicate]}</span>{" "}
                  <button className="text-left hover:underline" onClick={() => onNavigate({ kind: "node", nodeId: e.object_id })}>
                    {label(e.object_id)}
                  </button>
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

function ExplainPart({ title, text, strong }: { title: string; text: string; strong?: boolean }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <p className={strong ? "font-medium" : ""}>{text}</p>
    </div>
  );
}

function NodeDetails({ node, sources }: { node: GraphNode; sources: Map<string, SourceRecord> }) {
  const provenance = node.external_ids.length
    ? "Identifiers verified against retrieved records."
    : "Curated entity; every relationship below cites its own source.";
  const paperSrc = node.type === "Paper" && node.pmid ? sources.get(`pubmed:${node.pmid}`) : undefined;
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-line p-3 text-sm">
      {node.lay_summary && <p>{node.lay_summary}</p>}
      {node.description && <p className="text-muted">{node.description}</p>}
      {node.type === "Paper" && (
        <p className="text-xs text-muted">
          {node.journal} · {node.pub_date} · {node.authors.slice(0, 3).join(", ")}
          {node.authors.length > 3 ? " et al." : ""}
          {node.publication_status === "preprint" && <span className="ml-1 rounded bg-yellow-100 px-1 font-semibold text-yellow-900">Preprint — not peer reviewed</span>}
        </p>
      )}
      {node.type === "Study" && (
        <p className="text-xs text-muted">
          {node.conditions.join("; ")} · {node.status?.toLowerCase()} · enrollment {node.enrollment} · sponsor {node.sponsor}
        </p>
      )}
      {node.external_ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.external_ids.map((x) => (
            <a key={x.system + x.id} href={x.url} target="_blank" rel="noreferrer" className="rounded border border-line px-1.5 py-0.5 font-mono text-xs underline">
              {x.id.includes(":") || x.id.startsWith(x.system) ? x.id : `${x.system}:${x.id}`}
            </a>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        {provenance}
        {paperSrc && ` Retrieved ${paperSrc.retrieval_date} via ${paperSrc.retrieved_via}.`}
      </p>
    </div>
  );
}
