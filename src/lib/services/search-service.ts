import { deriveEvidenceStatus, type EvidenceCoverage, type GraphNode, type SearchResponse } from "@/lib/schemas";
import { diseaseCoverage, PARTIAL_BANNER } from "@/lib/coverage";
import type { DiscoveryPreview, DiscoveryService } from "@/lib/discovery";
import { buildJourney } from "@/lib/journey";
import type { GraphService, ReusableAssetFinder, SearchService } from "./interfaces";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Assembles the results-page payload from the graph + finder. Pure orchestration, no I/O. */
export class GraphSearchService implements SearchService {
  constructor(
    private readonly graph: GraphService,
    private readonly finder: ReusableAssetFinder,
    /** Optional machine-assembled discovery layer, consulted only when the reviewed graph has no match. */
    private readonly discovery?: DiscoveryService,
    /** The live reviewed graph (bundle + queue-accepted edges). Defaults to the bundle alone. */
    private readonly graphSource?: () => Promise<GraphService>,
    /** Applies the source-curation rules to a discovery preview; true when the graph changed. */
    private readonly promoter?: (preview: DiscoveryPreview) => Promise<boolean>,
  ) {}

  /** Disease, its causal genes, and those genes' mechanisms route to the disease page. */
  private focusFor(node: GraphNode, graph: GraphService): GraphNode | undefined {
    if (node.type === "Disease") return node;
    if (node.type === "Gene") {
      return graph.neighbors(node.id, ["caused_by_variant_in"]).find((x) => x.node.type === "Disease")?.node;
    }
    if (node.type === "Mechanism") {
      const gene = graph.neighbors(node.id, ["involves_mechanism"]).find((x) => x.node.type === "Gene" && x.edge.object_id === node.id);
      return gene ? this.focusFor(gene.node, graph) : undefined;
    }
    return undefined;
  }

  /** `preview` is passed through when a discovery result resolved to a disease the reviewed graph holds. */
  async search(query: string, preview?: DiscoveryPreview, promoted = false): Promise<SearchResponse> {
    const graph = (await this.graphSource?.()) ?? this.graph;
    const b = graph.bundle();
    const focusLabel = graph.getNode(b.focus_disease_id)?.label ?? "the seeded disease";
    const resolved = graph.resolveDetailed?.(query);
    const matched = resolved?.node ?? graph.resolve(query);

    if (!matched) {
      if (this.discovery) {
        const outcome = await this.discovery.preview(query);
        if (outcome.kind === "preview") {
          // Expert-curated claims are promoted by rule, then the search runs once more on the updated graph.
          if (!promoted && this.promoter && (await this.promoter(outcome.preview))) return this.search(query, outcome.preview, true);
          // Reviewed wins: if the API resolves to a disease the reviewed graph already holds, show the reviewed view.
          const reviewedTwin = b.nodes.find((n) => n.type === "Disease" && n.external_ids.some((x) => x.id === outcome.preview.disease.id));
          if (reviewedTwin && norm(reviewedTwin.label) !== norm(query)) return this.search(reviewedTwin.label, outcome.preview, true);
          return { query, found: false, discovery: true, preview: outcome.preview, full_journey: { label: focusLabel, query: "CDKL5" } };
        }
        if (outcome.kind === "unavailable") {
          return { query, found: false, message: `No reviewed match for "${query}". ${outcome.message}`, suggestions: [focusLabel, "CDKL5"] };
        }
      }
      return {
        query,
        found: false,
        message: `No supported match for "${query}". RarePath currently covers one fully verified journey (${focusLabel}) plus a few diseases at partial-evidence depth; we only show connections we can trace to a retrieved source.`,
        suggestions: [focusLabel, "CDKL5", ...diseaseCoverage(b).filter((d) => !d.is_focus).map((d) => d.label)],
      };
    }

    if (matched.type === "Phenotype") {
      const diseases = graph.neighbors(matched.id, ["has_phenotype"]).map((x) => x.node.label);
      return {
        query,
        found: false,
        message: `"${matched.label}" is a symptom, not a disease. In the demo data it is annotated on: ${diseases.join(", ") || "no diseases"}. Symptom-first search is not yet supported.`,
        suggestions: diseases,
      };
    }

    const focus = this.focusFor(matched, graph);
    // Other supported diseases resolve to their reviewed coverage only: never the focus journey's brief or ranking.
    if (focus && focus.id !== b.focus_disease_id) {
      const coverage = diseaseCoverage(b).find((d) => d.node_id === focus.id);
      if (coverage) {
        // Diseases introduced by the review queue also keep their machine-assembled discovery view.
        if (!preview && focus.id.startsWith("rv:") && this.discovery) {
          const outcome = await this.discovery.preview(focus.label);
          if (outcome.kind === "preview") preview = outcome.preview;
        }
        if (!promoted && preview && this.promoter && (await this.promoter(preview))) return this.search(query, preview, true);
        const journey = buildJourney(b, focus.id);
        const ids = new Set([
          ...coverage.reviewed_edge_ids,
          ...journey.facts.map((f) => f.edge_id),
          ...journey.ranked.flatMap((r) => [...r.factors, ...r.cautions].flatMap((f) => f.evidence_edge_ids)),
        ]);
        const edges = b.edges.filter((e) => ids.has(e.id));
        const nodeIds = new Set([focus.id, ...edges.flatMap((e) => [e.subject_id, e.object_id]), ...journey.ranked.map((r) => r.disease_id)]);
        return {
          query,
          found: false,
          partial: true,
          matched: { node_id: matched.id, label: matched.label, type: matched.type, via: resolved?.via, matched_text: resolved?.matched_text },
          banner: PARTIAL_BANNER,
          coverage,
          edges,
          nodes: b.nodes.filter((n) => nodeIds.has(n.id)),
          journey,
          preview,
          full_journey: { label: focusLabel, query: "CDKL5" },
        };
      }
    }
    if (!focus || focus.id !== b.focus_disease_id) {
      return {
        query,
        found: false,
        message: `"${matched.label}" exists in the demo graph only as a connected community. Search for ${focusLabel} to see the full journey.`,
        suggestions: [focusLabel],
      };
    }

    const genes = graph.neighbors(focus.id, ["caused_by_variant_in"]).map((x) => x.node);
    const mechanisms = genes.flatMap((g) => graph.neighbors(g.id, ["involves_mechanism"]).filter((x) => x.edge.subject_id === g.id).map((x) => x.node));
    const phenotypes = graph.neighbors(focus.id, ["has_phenotype"]).map((x) => x.node);
    const orgs = b.nodes.filter((n) => n.type === "PatientOrganization");
    const researchers = b.nodes.filter((n) => n.type === "Researcher");
    const studies = b.nodes.filter((n) => n.type === "Study");

    const coverage: EvidenceCoverage = { supported: 0, inferred: 0, contradictory: 0, unknown: 0 };
    for (const e of b.edges) coverage[deriveEvidenceStatus(e)]++;

    return {
      query,
      found: true,
      is_fixture: b.is_fixture,
      fixture_warning: b.fixture_warning,
      matched: { node_id: matched.id, label: matched.label, type: matched.type, via: resolved?.via, matched_text: resolved?.matched_text },
      collaborators: b.collaborators,
      action_brief: b.action_brief,
      asset_catalog: b.asset_catalog,
      disease: {
        node_id: focus.id,
        gene_ids: genes.map((n) => n.id),
        mechanism_ids: mechanisms.map((n) => n.id),
        phenotype_ids: phenotypes.map((n) => n.id),
        coverage,
      },
      connections: this.finder.findConnections(focus.id),
      opportunities: this.finder.findOpportunities(focus.id),
      people: {
        organization_ids: orgs.map((n) => n.id),
        researcher_ids: researchers.map((n) => n.id),
        study_ids: studies.map((n) => n.id),
      },
      gaps: b.gaps,
      sources: b.sources,
      build_info: b.build_info,
      nodes: b.nodes,
      edges: b.edges,
    };
  }
}
