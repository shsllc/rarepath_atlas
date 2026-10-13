/**
 * The live reviewed graph: the committed bundle plus every queue-accepted edge and the nodes it
 * introduced. Cached briefly per server instance; a decision on this instance refreshes it at once,
 * other instances pick it up when the cache expires.
 */
import type { EvidenceEdge, GraphBundle, GraphNode } from "@/lib/schemas";
import { JsonGraphService } from "@/lib/services/graph-service";
import type { GraphService } from "@/lib/services/interfaces";
import { overlayGeneration, reviewedOverlay } from "./queue";

export function mergeOverlay(b: GraphBundle, o: { nodes: GraphNode[]; edges: EvidenceEdge[] }): GraphBundle {
  const nodeIds = new Set(b.nodes.map((n) => n.id));
  const edgeIds = new Set(b.edges.map((e) => e.id));
  const nodes = [...b.nodes, ...o.nodes.filter((n) => !nodeIds.has(n.id))];
  const known = new Set(nodes.map((n) => n.id));
  // An edge is only added when both of its ends exist.
  const edges = [...b.edges, ...o.edges.filter((e) => !edgeIds.has(e.id) && known.has(e.subject_id) && known.has(e.object_id))];
  return { ...b, nodes, edges };
}

const TTL_MS = 15_000;
let cache: { at: number; gen: number; graph: GraphService } | null = null;

export async function reviewedGraph(base: JsonGraphService, now = Date.now()): Promise<GraphService> {
  const gen = overlayGeneration();
  if (cache && cache.gen === gen && now - cache.at < TTL_MS) return cache.graph;
  let graph: GraphService = base;
  try {
    const overlay = await reviewedOverlay();
    if (overlay.edges.length > 0) graph = new JsonGraphService(mergeOverlay(base.bundle(), overlay));
  } catch {
    // Storage unavailable: serve the committed reviewed bundle rather than failing the search.
  }
  cache = { at: now, gen, graph };
  return graph;
}

/** Test seam. */
export function clearReviewedGraphCache() {
  cache = null;
}
