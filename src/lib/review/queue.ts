/**
 * Review workflow: the only path from machine-assembled discovery to reviewed evidence.
 *
 *   propose  → a signed-in reviewer sends one discovery link to the queue (server re-derives it; the
 *              client never supplies the claim)
 *   decide   → a signed-in reviewer checks the source and accepts (supports / qualifies / contradicts)
 *              or rejects, with a note; accepting writes a reviewed edge + its endpoint nodes
 *   revoke   → a reviewer withdraws an accepted edge (kept in history, removed from the reviewed graph)
 *
 * Every action appends an immutable audit event. Nothing is ever promoted automatically.
 */
import crypto from "node:crypto";
import type { EvidenceEdge, GraphNode, SourceType } from "@/lib/schemas";
import type { Confidence } from "@/lib/schemas";
import { getStore } from "@/lib/store";
import type { DiscoveryPreview } from "@/lib/discovery";
import { toCandidateEdge, PROVIDER_NAME } from "@/lib/discovery";
import type { ProviderId, ResearchLink, ResearchRecord } from "@/lib/research/types";
import type { Reviewer } from "./auth";

export type ReviewStatus = "pending" | "accepted" | "rejected" | "revoked";
export type ReviewOutcome = "supports" | "qualifies" | "contradicts" | "rejected";

export interface ReviewItem {
  id: string;
  created_at: string;
  proposed_by: { id: string; name: string };
  disease: { id: string; label: string; query: string };
  link: ResearchLink;
  candidate_edge: EvidenceEdge;
  records: ResearchRecord[];
  status: ReviewStatus;
  decision?: { by: string; by_name: string; at: string; outcome: ReviewOutcome; confidence?: Confidence; note: string; source_checked: boolean };
  revoked?: { by: string; by_name: string; at: string; note: string };
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: { id: string; name: string };
  action: "proposed" | "accepted" | "rejected" | "revoked";
  item_id: string;
  summary: string;
  note?: string;
}

let auditSeq = 0;
/** Bumped whenever this instance changes the reviewed overlay, so cached graphs refresh immediately. */
let generation = 0;
export const overlayGeneration = () => generation;
const K = {
  item: (id: string) => `review/items/${id}`,
  // The per-process sequence keeps events written in the same millisecond in order.
  audit: (at: string, id: string) => `review/audit/${at.replace(/[:.]/g, "-")}-${String(++auditSeq % 1e6).padStart(6, "0")}-${id}`,
  edge: (itemId: string) => `reviewed/edges/${itemId}`,
  node: (nodeId: string) => `reviewed/nodes/${encodeURIComponent(nodeId)}`,
};

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const itemIdFor = (diseaseId: string, linkKey: string) => crypto.createHash("sha256").update(`${diseaseId}|${linkKey}`).digest("hex").slice(0, 20);

async function audit(actor: Reviewer, action: AuditEvent["action"], item: ReviewItem, now: Date, note?: string) {
  const at = now.toISOString();
  const ev: AuditEvent = { id: crypto.randomBytes(6).toString("hex"), at, actor: { id: actor.id, name: actor.name }, action, item_id: item.id, summary: item.link.statement.slice(0, 240), note };
  await getStore().create(K.audit(at, ev.id), ev);
}

/** Send one machine-assembled link from a server-side discovery preview to the queue (idempotent). */
export async function propose(preview: DiscoveryPreview, linkKey: string, by: Reviewer, now = new Date()): Promise<{ item: ReviewItem; created: boolean }> {
  const link = preview.links.find((l) => l.key === linkKey);
  if (!link) throw new ReviewError("That relationship is not in the current discovery preview.", 404);
  const candidate = toCandidateEdge(link);
  if (!candidate) throw new ReviewError("This relationship type cannot be promoted into the reviewed graph.", 422);
  const diseaseId = preview.disease.id ?? `query:${preview.match.query.toLowerCase()}`;
  const id = itemIdFor(diseaseId, link.key);
  const existing = await getStore().get<ReviewItem>(K.item(id));
  if (existing) return { item: existing, created: false };
  const records = preview.records.filter((r) => r.key === link.from || r.key === link.to);
  const item: ReviewItem = {
    id,
    created_at: now.toISOString(),
    proposed_by: { id: by.id, name: by.name },
    disease: { id: diseaseId, label: preview.disease.label, query: preview.match.query },
    link,
    candidate_edge: candidate,
    records,
    status: "pending",
  };
  const created = await getStore().create(K.item(id), item);
  if (!created) return { item: (await getStore().get<ReviewItem>(K.item(id)))!, created: false };
  await audit(by, "proposed", item, now);
  return { item, created: true };
}

export async function getItem(id: string) {
  if (!/^[a-f0-9]{20}$/.test(id)) return null;
  return getStore().get<ReviewItem>(K.item(id));
}

export async function listItems(status?: ReviewStatus): Promise<ReviewItem[]> {
  const keys = await getStore().list("review/items/");
  const items = (await Promise.all(keys.map((k) => getStore().get<ReviewItem>(k)))).filter((x): x is ReviewItem => !!x);
  return items.filter((i) => !status || i.status === status).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listAudit(limit = 200): Promise<AuditEvent[]> {
  const keys = (await getStore().list("review/audit/")).slice(-limit).reverse();
  return (await Promise.all(keys.map((k) => getStore().get<AuditEvent>(k)))).filter((x): x is AuditEvent => !!x);
}

const SOURCE_TYPE: Record<ProviderId, SourceType> = {
  europepmc: "literature",
  openalex: "literature",
  crossref: "literature",
  trialpubs: "literature",
  clinicaltrials: "trial_registry",
  isrctn: "trial_registry",
  euctr: "trial_registry",
  monarch: "ontology",
  orphadata: "ontology",
  hpo: "ontology",
  clinvar: "variant_database",
  clingen: "variant_database",
  opentargets: "research_platform",
  gwas: "research_platform",
  datacite: "research_platform",
  alliance: "research_platform",
};

const colon = (s: string) => s.replace("_", ":");
/** Map a discovery record to a reviewed-graph node; reuse a bundle node when a stable identifier matches. */
export function recordToNode(r: ResearchRecord, bundleNodes: GraphNode[] = []): GraphNode | null {
  const idOf = (sys: string, id?: string) => (id ? [{ system: sys, id, verification: "verified" as const }] : []);
  const base = { id: `rv:${r.key}`, label: r.label, aliases: [], verification: "verified" as const };
  let node: GraphNode | null = null;
  switch (r.kind) {
    case "disease":
      node = { ...base, type: "Disease", inheritance: [], external_ids: [...idOf("MONDO", r.ids.mondo), ...idOf("ORPHA", r.ids.orphanet), ...idOf("OMIM", r.ids.omim), ...idOf("EFO", r.ids.efo)] };
      break;
    case "gene":
      node = { ...base, type: "Gene", symbol: r.ids.symbol ?? r.label, external_ids: [...idOf("HGNC", r.ids.hgnc), ...idOf("Ensembl", r.ids.ensembl)] };
      break;
    case "variant":
      node = { ...base, type: "Variant", external_ids: [...idOf("dbSNP", r.ids.rsid), ...idOf("ClinVar", r.ids.vcv)] };
      break;
    case "phenotype":
      node = { ...base, type: "Phenotype", external_ids: idOf("HPO", r.ids.hpo) };
      break;
    case "paper":
      node = { ...base, type: "Paper", authors: r.authors, pmid: r.ids.pmid, pmcid: r.ids.pmcid, doi: r.ids.doi, year: r.year, journal: r.venue, publication_status: r.publication_status, external_ids: idOf("PMID", r.ids.pmid) };
      break;
    case "study":
      node = { ...base, type: "Study", study_type: r.infrastructure.some((f) => f.flag === "natural_history") ? "natural_history" : r.infrastructure.some((f) => f.flag === "registry") ? "registry" : r.study_type === "INTERVENTIONAL" ? "interventional" : r.study_type === "OBSERVATIONAL" ? "observational" : "other", status: r.status_label, nct: r.ids.nct, conditions: r.conditions, enrollment: r.enrollment, sponsor: r.sponsor, start_date: r.start_date, completion_date: r.completion_date, external_ids: idOf("NCT", r.ids.nct) };
      break;
    case "person":
      node = { ...base, type: "Researcher", affiliation: r.affiliations[0], external_ids: idOf("ORCID", r.ids.orcid) };
      break;
    case "dataset":
      node = { ...base, type: "ResearchAsset", asset_kind: "research_infrastructure", owner_disease_id: "", external_ids: idOf("DOI", r.ids.doi) };
      break;
    case "outcome_measure":
      node = { ...base, type: "ResearchAsset", asset_kind: "outcome_measure", owner_disease_id: "", external_ids: [] };
      break;
    case "model":
      node = { ...base, type: "ResearchAsset", asset_kind: "disease_model", owner_disease_id: "", external_ids: idOf("Model", r.ids.model) };
      break;
    default:
      return null;
  }
  // Reuse an existing reviewed-bundle node when any stable identifier matches.
  const ids = new Set(node.external_ids.map((x) => `${x.system}:${x.id}`.toLowerCase()));
  const twin = bundleNodes.find((n) => n.type === node!.type && n.external_ids.some((x) => ids.has(`${x.system}:${x.id}`.toLowerCase()) || ids.has(colon(`${x.system}:${x.id}`).toLowerCase())));
  return twin ?? node;
}

export interface Decision {
  outcome: ReviewOutcome;
  confidence?: Confidence;
  note: string;
  source_checked: boolean;
}

export async function decide(id: string, by: Reviewer, d: Decision, bundleNodes: GraphNode[] = [], now = new Date()): Promise<ReviewItem> {
  const item = await getItem(id);
  if (!item) throw new ReviewError("Review item not found.", 404);
  if (item.status !== "pending") throw new ReviewError(`This item is already ${item.status}.`, 409);
  const note = (d.note ?? "").trim().slice(0, 2000);
  if (d.outcome !== "rejected" && !d.source_checked) throw new ReviewError("Open the source and confirm it supports the statement before accepting.");
  if ((d.outcome === "rejected" || d.outcome === "contradicts" || d.outcome === "qualifies") && note.length < 5) throw new ReviewError("A note is required when rejecting, qualifying or recording a contradiction.");
  if (d.outcome !== "rejected" && !["high", "moderate", "low"].includes(d.confidence ?? "")) throw new ReviewError("Choose a confidence level.");
  const at = now.toISOString();
  item.decision = { by: by.id, by_name: by.name, at, outcome: d.outcome, confidence: d.outcome === "rejected" ? undefined : d.confidence, note, source_checked: d.source_checked };

  if (d.outcome === "rejected") {
    item.status = "rejected";
  } else {
    const c = item.candidate_edge;
    const nodeFor = (key: string) => {
      const r = item.records.find((x) => x.key === key);
      return r ? recordToNode(r, bundleNodes) : null;
    };
    const subj = nodeFor(c.subject_id);
    const obj = nodeFor(c.object_id);
    if (!subj || !obj) throw new ReviewError("One end of this relationship cannot be represented in the reviewed graph.", 422);
    const provider = item.link.provenance[0].provider;
    const sourceType = SOURCE_TYPE[provider];
    const stance = d.outcome === "contradicts" ? "contradicts" : d.outcome === "qualifies" ? "qualifies" : "supports";
    const edge: EvidenceEdge = {
      ...c,
      id: `edge:rev:${item.id}`,
      subject_id: subj.id,
      object_id: obj.id,
      source: PROVIDER_NAME[provider],
      source_type: sourceType,
      evidence_type: "curated_annotation",
      evidence: c.evidence.map((ev) => ({ ...ev, source_type: sourceType, evidence_type: "curated_annotation" as const, stance })),
      confidence: d.confidence!,
      inferred: false,
      contradiction_status: d.outcome === "contradicts" ? "contradicted" : "none",
      contradiction_notes: d.outcome === "contradicts" ? note : undefined,
      created_at: at,
      review_status: "reviewed",
      eligible_for_ranking: true,
      eligible_for_action: true,
      review: { by: by.id, by_name: by.name, at, item_id: item.id, outcome: d.outcome, note, source_checked: true },
    };
    for (const n of [subj, obj]) if (n.id.startsWith("rv:")) await getStore().set(K.node(n.id), n);
    await getStore().set(K.edge(item.id), edge);
    generation++;
    item.status = "accepted";
  }
  await getStore().set(K.item(item.id), item);
  await audit(by, d.outcome === "rejected" ? "rejected" : "accepted", item, now, note || undefined);
  return item;
}

export async function revoke(id: string, by: Reviewer, note: string, now = new Date()): Promise<ReviewItem> {
  const item = await getItem(id);
  if (!item) throw new ReviewError("Review item not found.", 404);
  if (item.status !== "accepted") throw new ReviewError("Only accepted items can be revoked.", 409);
  const n = (note ?? "").trim();
  if (n.length < 5) throw new ReviewError("A note is required to revoke.");
  await getStore().delete(K.edge(item.id));
  generation++;
  item.status = "revoked";
  item.revoked = { by: by.id, by_name: by.name, at: now.toISOString(), note: n.slice(0, 2000) };
  await getStore().set(K.item(item.id), item);
  await audit(by, "revoked", item, now, n);
  return item;
}

/** All accepted reviewed edges and the nodes they introduced (to be merged with the bundle). */
export async function reviewedOverlay(): Promise<{ nodes: GraphNode[]; edges: EvidenceEdge[] }> {
  const s = getStore();
  const [edgeKeys, nodeKeys] = await Promise.all([s.list("reviewed/edges/"), s.list("reviewed/nodes/")]);
  const edges = (await Promise.all(edgeKeys.map((k) => s.get<EvidenceEdge>(k)))).filter((e): e is EvidenceEdge => !!e);
  const nodes = (await Promise.all(nodeKeys.map((k) => s.get<GraphNode>(k)))).filter((n): n is GraphNode => !!n);
  return { nodes, edges };
}
