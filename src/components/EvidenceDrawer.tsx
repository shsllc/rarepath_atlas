"use client";

import { useEffect, useState } from "react";
import { deriveEvidenceStatus, type EvidenceEdge, type GraphNode } from "@/lib/schemas";
import { PREDICATE_LABEL } from "@/lib/format";
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
                <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-ink/80">{e.quoted_or_structured_evidence}</blockquote>
                {e.contradiction_status !== "none" && (
                  <p className="mt-2 rounded bg-contradictory-bg p-2 text-sm text-contradictory">
                    <strong>{e.contradiction_status}:</strong> {e.contradiction_notes}
                  </p>
                )}
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
                  <dt>Source</dt>
                  <dd>
                    <a href={e.source_url} target="_blank" rel="noreferrer" className="text-ink underline">
                      {e.source}
                    </a>
                  </dd>
                  <dt>Source type</dt>
                  <dd>{e.source_type}</dd>
                  <dt>Evidence type</dt>
                  <dd>{e.evidence_type}</dd>
                  <dt>Retrieved</dt>
                  <dd>{e.retrieval_date}</dd>
                  <dt>Edge id</dt>
                  <dd className="font-mono">{e.id}</dd>
                </dl>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
