/**
 * Persistence for source-curated promotions: one record per disease, replaced each time the rules run
 * on a fresh discovery preview (so claims that disappear from a source disappear here too), plus a
 * list of edges curators have withdrawn, which the rules never re-promote.
 */
import crypto from "node:crypto";
import type { EvidenceEdge, GraphNode } from "@/lib/schemas";
import type { DiscoveryPreview } from "@/lib/discovery";
import { getStore } from "@/lib/store";
import { appendAudit, bumpOverlayGeneration } from "@/lib/review/queue";
import type { Reviewer } from "@/lib/review/auth";
import { applyRules, RULES, RULES_VERSION, type CurationResult, type RuleId } from "./rules";

interface Stored extends CurationResult {
  rules_version: string;
  promoted_at: string;
}

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 20);
const K = {
  disease: (key: string) => `curated/disease/${hash(key)}`,
  withdrawn: (edgeId: string) => `curated/withdrawn/${hash(edgeId)}`,
};
const RULES_ACTOR = { id: "rules", name: `Source-curation rules v${RULES_VERSION}` };

async function withdrawnIds(): Promise<Set<string>> {
  const st = getStore();
  const keys = await st.list("curated/withdrawn/");
  const rows = await Promise.all(keys.map((k) => st.get<{ edge_id: string }>(k)));
  return new Set(rows.filter((r): r is { edge_id: string } => !!r).map((r) => r.edge_id));
}

/**
 * Run the rules on a preview and store the result. Returns true when the stored edges changed
 * (callers then re-read the graph). Failures never break a search.
 */
export async function promoteFromPreview(p: DiscoveryPreview, bundleNodes: GraphNode[], focusDiseaseId: string, now = new Date()): Promise<boolean> {
  try {
    const result = applyRules(p, bundleNodes, { now, withdrawn: await withdrawnIds(), focusDiseaseId });
    const key = K.disease(result.disease_key);
    const prev = await getStore().get<Stored>(key);
    const ids = (r?: { edges: EvidenceEdge[] } | null) => (r?.edges ?? []).map((e) => e.id).sort().join(",");
    if (prev && ids(prev) === ids(result) && prev.rules_version === RULES_VERSION) return false;
    if (!prev && result.edges.length === 0) return false;
    // Keep each edge's original promotion time when it was already promoted.
    const before = new Map((prev?.edges ?? []).map((e) => [e.id, e]));
    for (const e of result.edges) {
      const old = before.get(e.id);
      if (old?.curation && e.curation) {
        e.curation.promoted_at = old.curation.promoted_at;
        e.created_at = old.created_at;
      }
    }
    await getStore().set<Stored>(key, { ...result, rules_version: RULES_VERSION, promoted_at: now.toISOString() });
    bumpOverlayGeneration();
    const added = result.edges.filter((e) => !before.has(e.id)).length;
    const removed = [...before.keys()].filter((id) => !result.edges.some((e) => e.id === id)).length;
    const counts = (Object.entries(result.counts) as [RuleId, number][]).map(([r, n]) => `${RULES[r].title}: ${n}`).join("; ");
    await appendAudit(RULES_ACTOR, "auto_promoted", `${result.disease_label}: ${added} added, ${removed} removed (${counts || "none"})`, now);
    return true;
  } catch (e) {
    console.error(`[curation] promotion failed: ${(e as Error).message}`);
    return false;
  }
}

/** All source-curated edges and the nodes they introduced, excluding withdrawn ones. */
export async function curatedOverlay(): Promise<{ nodes: GraphNode[]; edges: EvidenceEdge[] }> {
  const st = getStore();
  const keys = await st.list("curated/disease/");
  const rows = (await Promise.all(keys.map((k) => st.get<Stored>(k)))).filter((r): r is Stored => !!r);
  const withdrawn = await withdrawnIds();
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, EvidenceEdge>();
  for (const r of rows) {
    for (const n of r.nodes) nodes.set(n.id, n);
    for (const e of r.edges) if (!withdrawn.has(e.id)) edges.set(e.id, e);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** A curator withdraws one rule-promoted edge; it leaves the graph and is never re-promoted. */
export async function withdrawCurated(edgeId: string, by: Reviewer, note: string, now = new Date()) {
  if (!/^edge:sc:[a-f0-9]{24}$/.test(edgeId)) throw new Error("Not a source-curated edge.");
  const n = note.trim();
  if (n.length < 5) throw new Error("A note is required to withdraw.");
  await getStore().set(K.withdrawn(edgeId), { edge_id: edgeId, by: by.id, by_name: by.name, at: now.toISOString(), note: n.slice(0, 2000) });
  bumpOverlayGeneration();
  await appendAudit({ id: by.id, name: by.name }, "withdrawn", `Withdrew source-curated ${edgeId}`, now, n);
}

/** Per-disease promotions for the curator page, newest first, withdrawn edges left out. */
export async function listCurated(): Promise<{ disease_label: string; promoted_at: string; rules_version: string; edges: EvidenceEdge[]; nodes: GraphNode[] }[]> {
  const st = getStore();
  const keys = await st.list("curated/disease/");
  const withdrawn = await withdrawnIds();
  const rows = (await Promise.all(keys.map((k) => st.get<Stored>(k)))).filter((r): r is Stored => !!r);
  return rows
    .map((r) => ({ disease_label: r.disease_label, promoted_at: r.promoted_at, rules_version: r.rules_version, nodes: r.nodes, edges: r.edges.filter((e) => !withdrawn.has(e.id)) }))
    .sort((a, b) => b.promoted_at.localeCompare(a.promoted_at));
}
