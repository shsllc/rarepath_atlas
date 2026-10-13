/**
 * Reviewed journey for any disease: what the reviewed graph says about it, the counter-evidence,
 * a ranking of neighbouring research communities, and, when the evidence allows, a generated
 * Research Action Brief.
 *
 * Everything here is deterministic and built only from edges that pass `isReviewedEvidenceEdge`
 * (curated bundle edges and queue-reviewed edges). No model writes any of it, and every statement
 * in the brief points back to the reviewed edges it came from.
 */
import { deriveEvidenceStatus, type EvidenceEdge, type EvidenceStatus, type GraphBundle, type GraphNode, type Predicate } from "@/lib/schemas";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import { opportunityDetails, rankResearchConnections, type OpportunityDetail, type RankCaution, type RankedConnection } from "@/lib/analytics";

export interface JourneyFact {
  edge_id: string;
  predicate: Predicate;
  direction: "out" | "in";
  other_id: string;
  other_label: string;
  other_type: GraphNode["type"];
  status: EvidenceStatus;
  stance: "supports" | "contradicts" | "qualifies";
  source: string;
  source_url: string;
  quote: string;
  /** Present for queue-reviewed edges. */
  review?: { by_name: string; at: string; note: string };
}

export interface GeneratedBrief {
  kind: "generated";
  partner_id: string;
  partner_label: string;
  opportunity: string;
  why: { text: string; edge_ids: string[] }[];
  assets: { id: string; label: string }[];
  studies: { id: string; label: string }[];
  team: { id: string; label: string }[];
  question: string;
  bring_sources: { label: string; url: string }[];
  must_validate: string[];
  does_not_mean: string[];
  cautions: RankCaution[];
  edge_ids: string[];
}

export interface DiseaseJourney {
  disease_id: string;
  facts: JourneyFact[];
  /** Contradicted, contradicting or qualifying evidence, always shown next to the rest. */
  counter: JourneyFact[];
  ranked: RankedConnection[];
  details: OpportunityDetail[];
  brief: GeneratedBrief | null;
  /** Why there is no brief, when there is none. */
  brief_blocker?: string;
  reviewers: string[];
}

const COUNTER_PREDICATES: Predicate[] = ["clinically_differs_from"];

export function shortName(n: GraphNode | undefined): string {
  return n?.aliases.find((a) => /^[A-Z0-9-]{2,8}$/.test(a)) ?? n?.label ?? "this disease";
}

export function buildJourney(bundle: Pick<GraphBundle, "nodes" | "edges">, diseaseId: string): DiseaseJourney {
  const nodes = new Map(bundle.nodes.map((n) => [n.id, n]));
  const reviewed = bundle.edges.filter(isReviewedEvidenceEdge);

  const facts: JourneyFact[] = reviewed
    .filter((e) => e.subject_id === diseaseId || e.object_id === diseaseId)
    .flatMap((e) => {
      const direction = e.subject_id === diseaseId ? "out" : "in";
      const other = nodes.get(direction === "out" ? e.object_id : e.subject_id);
      if (!other) return [];
      const stance = e.evidence.find((x) => x.stance !== "supports")?.stance ?? "supports";
      return [
        {
          edge_id: e.id,
          predicate: e.predicate,
          direction,
          other_id: other.id,
          other_label: other.label,
          other_type: other.type,
          status: deriveEvidenceStatus(e),
          stance,
          source: e.source,
          source_url: e.source_url,
          quote: e.quoted_or_structured_evidence,
          review: e.review ? { by_name: e.review.by_name, at: e.review.at, note: e.review.note } : undefined,
        } satisfies JourneyFact,
      ];
    });
  const counter = facts.filter((f) => f.status === "contradictory" || f.stance !== "supports" || COUNTER_PREDICATES.includes(f.predicate));

  const ranked = rankResearchConnections(bundle.nodes, bundle.edges, diseaseId);
  const details = opportunityDetails(bundle.nodes, bundle.edges, diseaseId, ranked);
  const reviewers = [...new Set(reviewed.filter((e) => e.review && (e.subject_id === diseaseId || e.object_id === diseaseId)).map((e) => e.review!.by_name))];

  const { brief, blocker } = generateBrief(diseaseId, nodes, reviewed, ranked, details);
  return { disease_id: diseaseId, facts, counter, ranked, details, brief, brief_blocker: blocker, reviewers };
}

function generateBrief(
  focusId: string,
  nodes: Map<string, GraphNode>,
  reviewed: EvidenceEdge[],
  ranked: RankedConnection[],
  details: OpportunityDetail[],
): { brief: GeneratedBrief | null; blocker?: string } {
  const top = ranked[0];
  if (!top) return { brief: null, blocker: "No other disease shares a reviewed study, research asset or clinical feature with this one yet." };
  const d = details.find((x) => x.disease_id === top.disease_id)!;
  if (d.shared_asset_ids.length === 0 && d.shared_study_ids.length === 0)
    return { brief: null, blocker: "The closest connection rests only on shared clinical features. A brief needs a reviewed shared study or research asset." };

  const focus = shortName(nodes.get(focusId));
  const partner = nodes.get(top.disease_id)?.label ?? top.disease_id;
  const pick = (ids: string[]) => ids.map((id) => ({ id, label: nodes.get(id)?.label ?? id }));
  const assets = pick(d.shared_asset_ids);
  const studies = pick(d.shared_study_ids);
  const team = pick(d.study_team_ids);
  const edgeIds = [...new Set(top.factors.flatMap((f) => f.evidence_edge_ids))];
  const byId = new Map(reviewed.map((e) => [e.id, e]));
  const bring_sources = edgeIds
    .map((id) => byId.get(id))
    .filter((e): e is EvidenceEdge => !!e && !!e.source_url)
    .map((e) => ({ label: e.source, url: e.source_url }))
    .filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i);

  const opportunity = assets.length
    ? `${assets[0].label} has been applied in both ${focus} and ${partner}: compare how it performs across the two before relying on it in either.`
    : `Use ${studies[0].label}, which already enrols both communities, to compare ${focus} and ${partner} data.`;

  return {
    brief: {
      kind: "generated",
      partner_id: top.disease_id,
      partner_label: partner,
      opportunity,
      why: top.factors.map((f) => ({ text: f.detail, edge_ids: f.evidence_edge_ids })),
      assets,
      studies,
      team,
      question: d.next_question,
      bring_sources,
      must_validate: [
        assets.length
          ? `Whether ${assets[0].label} measures the same thing in ${focus} as in ${partner}.`
          : `Which variables in ${studies[0].label} were collected the same way for both groups.`,
        "That each source below still says what is quoted: records can be updated or retracted.",
        "Data-access and reuse terms, with the study team or data owner, before planning anything.",
      ],
      does_not_mean: [
        `${focus} and ${partner} are not shown to be the same disease or to share a mechanism.`,
        "No treatment is shown to transfer between these communities.",
        "The connection score counts reviewed research links. It is not a measure of similarity or of how well anything works.",
        "This is a research lead built from reviewed sources, not medical advice.",
      ],
      cautions: top.cautions,
      edge_ids: edgeIds,
    },
  };
}
