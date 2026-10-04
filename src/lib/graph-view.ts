/**
 * Pure view model for the evidence graph (no Cytoscape import, so it is unit-testable).
 * The component in src/components/EvidenceGraph.tsx renders what this returns.
 */
import { deriveEvidenceStatus, type EvidenceEdge, type EvidenceStatus, type GraphNode } from "@/lib/schemas";
import { PREDICATE_LABEL } from "@/lib/format";

export type NodeCategory = "disease" | "study" | "asset" | "organization" | "other";

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  disease: "Diseases",
  study: "Research studies & papers",
  asset: "Research assets",
  organization: "Organizations & investigators",
  other: "Genes & features",
};

export function categoryOf(n: GraphNode): NodeCategory {
  switch (n.type) {
    case "Disease":
      return "disease";
    case "Study":
    case "Paper":
      return "study";
    case "ResearchAsset":
      return "asset";
    case "PatientOrganization":
    case "Researcher":
      return "organization";
    default:
      return "other";
  }
}

/** Edge CSS-like class per evidence status. Must match STATUS_META in StatusBadge.tsx. */
export const EDGE_STATUS_CLASS: Record<EvidenceStatus, string> = {
  supported: "status-supported", // solid
  inferred: "status-inferred", // dashed
  contradictory: "status-contradictory", // double (outline)
  unknown: "status-unknown", // dotted
};

/** Analyst-unreviewed OpenAI extractions (quote-verified, model-mapped). Hidden by default. */
export const isUnreviewedAiEdge = (e: EvidenceEdge) => e.evidence_type === "llm_extraction" || e.id.startsWith("edge:ai:");

/** Nodes shown in the default, judge-facing view (centered on the focus disease). */
export const DEFAULT_NODE_IDS = [
  "disease:cdd",
  "disease:rett",
  "disease:foxg1",
  "disease:mdd",
  "study:nhs",
  "asset:rtt-css",
  "asset:cdd-severity",
  "org:ifcr",
  "org:irsf",
  "paper:32472944",
  "paper:35483386",
];

/**
 * Reviewed edges shown in the default view: the story a judge needs, without the
 * redundant/symmetric edges (all still available under "Show full graph").
 */
export const DEFAULT_EDGE_IDS = [
  "edge:history",
  "edge:variant-claim",
  "edge:costudy-rett",
  "edge:differs-rett",
  "edge:costudy-foxg1",
  "edge:costudy-mdd",
  "edge:cdd-in-nhs",
  "edge:css-cdd",
  "edge:nhs-informed-sa",
  "edge:sa-cdd",
  "edge:ifcr-informed-sa",
  "edge:org-ifcr",
  "edge:org-irsf",
  "edge:nhs-paper",
  "edge:cdd-review",
];

/** Hand-placed positions for the default view: diseases left, focus centre, research right, orgs top/bottom. */
export const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  "disease:cdd": { x: 0, y: 0 },
  "disease:rett": { x: -380, y: -70 },
  "disease:foxg1": { x: -380, y: 110 },
  "disease:mdd": { x: -380, y: 260 },
  "org:irsf": { x: -380, y: -260 },
  "org:ifcr": { x: 330, y: -300 },
  "study:nhs": { x: 330, y: -130 },
  "paper:32472944": { x: 640, y: -130 },
  "asset:rtt-css": { x: 330, y: 60 },
  "asset:cdd-severity": { x: 330, y: 240 },
  "paper:35483386": { x: 0, y: 300 },
};

export interface GraphFilters {
  categories: Record<NodeCategory, boolean>;
  showAll: boolean; // false = default curated neighbourhood
  supportedOnly: boolean;
  includeInferred: boolean;
  includeUnreviewedAi: boolean;
}

export const DEFAULT_FILTERS: GraphFilters = {
  categories: { disease: true, study: true, asset: true, organization: true, other: false },
  showAll: false,
  supportedOnly: false,
  includeInferred: true,
  includeUnreviewedAi: false,
};

export interface ViewNode {
  id: string;
  label: string;
  type: string;
  category: NodeCategory;
  classes: string;
}
export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  status: EvidenceStatus;
  classes: string;
}

const SHORT_PREDICATE: Partial<Record<EvidenceEdge["predicate"], string>> = {
  co_studied_with: "studied together",
  historically_classified_with: "historically grouped",
  classified_as_variant_of: "“Rett variant” (contradicted)",
  clinically_differs_from: "differs clinically",
  phenotypically_overlaps: "shares features",
  studied_in: "enrolled in",
  applied_to: "applied in",
  informed_development_of: "informed",
  authored: "authored",
  described_in: "described in",
  supports_community: "supports",
  produced_asset: "produced",
  caused_by_variant_in: "caused by",
  has_phenotype: "feature",
  investigates: "investigates",
};

const shortLabel = (n: GraphNode) => {
  if (n.type === "Paper") return `${n.journal ?? "Paper"} ${n.year ?? ""}${n.publication_status === "preprint" ? " (preprint)" : ""}`.trim();
  if (n.type === "Study" && n.nct) return `Natural-history study\n${n.nct}`.replace("Natural-history study", n.study_type === "biobank" ? "Biobank" : "Natural-history study");
  return n.label.length > 42 ? n.label.slice(0, 40) + "…" : n.label;
};

export function buildGraphView(nodes: GraphNode[], edges: EvidenceEdge[], focusId: string, f: GraphFilters): { nodes: ViewNode[]; edges: ViewEdge[] } {
  const allowedIds = new Set(f.showAll ? nodes.map((n) => n.id) : DEFAULT_NODE_IDS);
  const visible = nodes.filter((n) => allowedIds.has(n.id) && (n.id === focusId || f.categories[categoryOf(n)]));
  const visibleIds = new Set(visible.map((n) => n.id));

  const viewEdges: ViewEdge[] = [];
  for (const e of edges) {
    if (!visibleIds.has(e.subject_id) || !visibleIds.has(e.object_id)) continue;
    if (!f.showAll && !DEFAULT_EDGE_IDS.includes(e.id)) continue;
    const ai = isUnreviewedAiEdge(e);
    if (ai && !f.includeUnreviewedAi) continue;
    const status = deriveEvidenceStatus(e);
    if (f.supportedOnly && status !== "supported") continue;
    if (!f.includeInferred && status === "inferred") continue;
    viewEdges.push({
      id: e.id,
      source: e.subject_id,
      target: e.object_id,
      label: (ai ? "AI-extracted · " : "") + (SHORT_PREDICATE[e.predicate] ?? PREDICATE_LABEL[e.predicate]),
      status,
      classes: [EDGE_STATUS_CLASS[status], ai ? "unreviewed-ai" : ""].filter(Boolean).join(" "),
    });
  }

  // Keep nodes that have at least one visible edge (plus the focus), so filters never strand islands.
  const connected = new Set(viewEdges.flatMap((e) => [e.source, e.target]));
  const viewNodes: ViewNode[] = visible
    .filter((n) => n.id === focusId || connected.has(n.id))
    .map((n) => ({ id: n.id, label: shortLabel(n), type: n.type, category: categoryOf(n), classes: [`cat-${categoryOf(n)}`, n.id === focusId ? "focus" : ""].filter(Boolean).join(" ") }));

  return { nodes: viewNodes, edges: viewEdges };
}

/** What the drawer should open when a graph element is tapped. */
export type DrawerTarget = { kind: "edges"; title: string; edgeIds: string[] } | { kind: "node"; nodeId: string };

export function drawerTargetFor(kind: "edge" | "node", id: string, edges: EvidenceEdge[], label: (id: string) => string): DrawerTarget | null {
  if (kind === "node") return { kind: "node", nodeId: id };
  const e = edges.find((x) => x.id === id);
  if (!e) return null;
  return { kind: "edges", title: `${label(e.subject_id)} ${PREDICATE_LABEL[e.predicate]} ${label(e.object_id)}`, edgeIds: [e.id] };
}
