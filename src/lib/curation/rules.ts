/**
 * Source-curated promotion: published, versioned rules that move claims from expert-curated sources
 * into the evidence graph without a person reviewing each one.
 *
 * A claim qualifies only when the SOURCE itself is a curation (an expert panel, a curated annotation,
 * a registry's own structured field) and the rule's exact criteria hold. Everything else stays
 * machine-assembled until a reviewer looks at it. Every promoted edge records which rule promoted it,
 * the rule version, when, and the source-native detail it relied on; curators can withdraw any of them.
 *
 * Licensing: OMIM-derived content is never promoted (see the licence review); only Orphanet-sourced
 * HPO annotations and Orphadata (CC BY 4.0) phenotypes are used.
 */
import crypto from "node:crypto";
import type { Confidence, EvidenceEdge, GraphNode } from "@/lib/schemas";
import type { DiscoveryPreview } from "@/lib/discovery";
import { PROVIDER_NAME, toCandidateEdge } from "@/lib/discovery";
import type { ResearchLink, ResearchRecord } from "@/lib/research/types";
import { recordToNode, SOURCE_TYPE } from "@/lib/review/queue";

export const RULES_VERSION = "2026-10-21.1";

export type RuleId = "clingen_validity" | "clingen_disputed" | "orphanet_causal_gene" | "trial_condition_exact" | "curated_phenotype";

export const RULES: Record<RuleId, { title: string; criteria: string }> = {
  clingen_validity: {
    title: "ClinGen gene-disease validity",
    criteria: "A ClinGen expert panel classifies the gene-disease relationship as Definitive, Strong or Moderate (not based on animal models alone).",
  },
  clingen_disputed: {
    title: "ClinGen disputed or refuted",
    criteria: "A ClinGen expert panel classifies the relationship as Disputed or Refuted. Recorded as counter-evidence.",
  },
  orphanet_causal_gene: {
    title: "Orphanet causal gene",
    criteria: 'Orphanet records a "Disease-causing" gene association with status "Assessed".',
  },
  trial_condition_exact: {
    title: "Registered study condition",
    criteria: "A ClinicalTrials.gov record lists the disease's exact name or a recognised synonym among its conditions (search-only matches are not promoted).",
  },
  curated_phenotype: {
    title: "Curated phenotype annotation",
    criteria: "Orphanet, or an Orphanet-sourced HPO annotation, records the feature with a stated frequency. Excluded features and OMIM-sourced annotations are not promoted.",
  },
};

export interface CurationResult {
  disease_key: string;
  disease_label: string;
  edges: EvidenceEdge[];
  nodes: GraphNode[];
  counts: Partial<Record<RuleId, number>>;
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const CLINGEN_CONFIDENCE: Record<string, Confidence> = { definitive: "high", strong: "high", moderate: "moderate" };

/** Which rule (if any) promotes this link, with its confidence and the source detail. Pure. */
export function ruleFor(
  l: ResearchLink,
  ctx: { diseaseKey: string; names: Set<string>; byKey: Map<string, ResearchRecord> },
): { rule: RuleId; confidence: Confidence; detail: string; contradicted?: boolean } | null {
  const touches = l.from === ctx.diseaseKey || l.to === ctx.diseaseKey;
  if (!touches) return null;
  const q = l.qualifiers ?? {};
  const provider = l.provenance[0]?.provider;
  switch (l.relation) {
    case "clingen_validity": {
      const c = String(q.classification ?? "").trim().toLowerCase();
      if (q.animal_model_only === "yes") return null;
      if (CLINGEN_CONFIDENCE[c]) return { rule: "clingen_validity", confidence: CLINGEN_CONFIDENCE[c], detail: `ClinGen ${q.expert_panel ?? ""}: ${q.classification} (released ${q.released ?? "date not stated"})`.replace(/\s+/g, " ") };
      if (c === "disputed" || c === "refuted") return { rule: "clingen_disputed", confidence: "high", detail: `ClinGen ${q.expert_panel ?? ""}: ${q.classification}`.replace(/\s+/g, " "), contradicted: true };
      return null;
    }
    case "causal_gene": {
      if (provider !== "orphadata") return null; // Monarch causal genes are often OMIM-derived.
      const type = String(q.association_type ?? "");
      const status = String(q.status ?? "");
      if (/disease-causing/i.test(type) && /^assessed$/i.test(status.trim())) return { rule: "orphanet_causal_gene", confidence: "high", detail: `Orphanet: ${type} (${status})` };
      return null;
    }
    case "studies_condition": {
      if (provider !== "clinicaltrials") return null;
      const study = ctx.byKey.get(l.from);
      if (!study || study.kind !== "study") return null;
      const match = study.conditions.find((c) => ctx.names.has(norm(c)));
      if (!match) return null;
      return { rule: "trial_condition_exact", confidence: "high", detail: `${study.ids.nct ?? study.label} lists "${match}" as a condition` };
    }
    case "has_phenotype": {
      const freq = String(q.frequency ?? "").trim();
      if (!freq || /not stated|excluded/i.test(freq)) return null;
      if (provider === "orphadata") return { rule: "curated_phenotype", confidence: "moderate", detail: `Orphanet frequency: ${freq}` };
      if (provider === "hpo" && /^ORPHA:/i.test(String(q.source ?? ""))) return { rule: "curated_phenotype", confidence: "moderate", detail: `HPO annotation (${q.source}), frequency ${freq}` };
      return null;
    }
    default:
      return null;
  }
}

export const curatedEdgeId = (rule: RuleId, linkKey: string) => `edge:sc:${crypto.createHash("sha256").update(`${rule}|${linkKey}`).digest("hex").slice(0, 24)}`;

/**
 * Apply every rule to one disease's discovery preview. Pure apart from the clock.
 * `withdrawn` holds edge ids a curator withdrew; they are never re-promoted.
 */
export function applyRules(p: DiscoveryPreview, bundleNodes: GraphNode[], opts: { now?: Date; withdrawn?: Set<string>; focusDiseaseId?: string } = {}): CurationResult {
  const now = (opts.now ?? new Date()).toISOString();
  const diseaseKey = p.disease.source_id ? `disease:${p.disease.source_id}` : `disease:query:${p.disease.label.toLowerCase()}`;
  const byKey = new Map(p.records.map((r) => [r.key, r]));
  const names = new Set([p.disease.label, ...p.disease.synonyms, p.match.query].map(norm).filter((x) => x.length >= 4));
  const result: CurationResult = { disease_key: diseaseKey, disease_label: p.disease.label, edges: [], nodes: [], counts: {} };
  const diseaseRec = byKey.get(diseaseKey);
  const diseaseNode = diseaseRec ? recordToNode(diseaseRec, bundleNodes) : null;
  // The hand-curated focus journey is never changed by rules.
  if (!diseaseNode || diseaseNode.id === opts.focusDiseaseId) return result;

  const nodes = new Map<string, GraphNode>();
  for (const l of p.links) {
    const hit = ruleFor(l, { diseaseKey, names, byKey });
    if (!hit) continue;
    const id = curatedEdgeId(hit.rule, l.key);
    if (opts.withdrawn?.has(id)) continue;
    const base = toCandidateEdge(l);
    if (!base) continue;
    const subjRec = byKey.get(base.subject_id);
    const objRec = byKey.get(base.object_id);
    const subj = subjRec && recordToNode(subjRec, bundleNodes);
    const obj = objRec && recordToNode(objRec, bundleNodes);
    if (!subj || !obj) continue;
    const provider = l.provenance[0].provider;
    const sourceType = SOURCE_TYPE[provider];
    const stance = hit.contradicted ? ("contradicts" as const) : ("supports" as const);
    result.edges.push({
      ...base,
      id,
      subject_id: subj.id,
      object_id: obj.id,
      source: PROVIDER_NAME[provider],
      source_type: sourceType,
      evidence_type: "curated_annotation",
      evidence: base.evidence.map((ev) => ({ ...ev, source: PROVIDER_NAME[provider], source_type: sourceType, evidence_type: "curated_annotation" as const, stance })),
      confidence: hit.confidence,
      inferred: false,
      contradiction_status: hit.contradicted ? "contradicted" : "none",
      contradiction_notes: hit.contradicted ? hit.detail : undefined,
      created_at: now,
      review_status: "source_curated",
      eligible_for_ranking: true,
      eligible_for_action: true,
      curation: { rule: hit.rule, rule_title: RULES[hit.rule].title, rule_version: RULES_VERSION, promoted_at: now, detail: hit.detail },
    });
    for (const n of [subj, obj]) if (n.id.startsWith("rv:")) nodes.set(n.id, n);
    result.counts[hit.rule] = (result.counts[hit.rule] ?? 0) + 1;
  }
  result.nodes = [...nodes.values()];
  return result;
}
