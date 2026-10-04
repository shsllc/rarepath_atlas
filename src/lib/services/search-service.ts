import { deriveEvidenceStatus, type EvidenceCoverage, type GraphNode, type SearchResponse } from "@/lib/schemas";
import { diseaseCoverage, PARTIAL_BANNER } from "@/lib/coverage";
import type { DiscoveryService } from "@/lib/discovery";
import type { GraphService, ReusableAssetFinder, SearchService } from "./interfaces";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Assembles the results-page payload from the graph + finder. Pure orchestration, no I/O. */
export class GraphSearchService implements SearchService {
  constructor(
    private readonly graph: GraphService,
    private readonly finder: ReusableAssetFinder,
    /** Optional machine-assembled discovery layer, consulted only when the reviewed graph has no match. */
    private readonly discovery?: DiscoveryService,
  ) {}

  /** Disease, its causal genes, and those genes' mechanisms route to the disease page. */
  private focusFor(node: GraphNode): GraphNode | undefined {
    if (node.type === "Disease") return node;
    if (node.type === "Gene") {
      return this.graph.neighbors(node.id, ["caused_by_variant_in"]).find((x) => x.node.type === "Disease")?.node;
    }
    if (node.type === "Mechanism") {
      const gene = this.graph.neighbors(node.id, ["involves_mechanism"]).find((x) => x.node.type === "Gene" && x.edge.object_id === node.id);
      return gene ? this.focusFor(gene.node) : undefined;
    }
    return undefined;
  }

  async search(query: string): Promise<SearchResponse> {
    const b = this.graph.bundle();
    const focusLabel = this.graph.getNode(b.focus_disease_id)?.label ?? "the seeded disease";
    const resolved = this.graph.resolveDetailed?.(query);
    const matched = resolved?.node ?? this.graph.resolve(query);

    if (!matched) {
      if (this.discovery) {
        const outcome = await this.discovery.preview(query);
        if (outcome.kind === "preview") {
          // Reviewed wins: if the API resolves to a disease the reviewed graph already holds, show the reviewed view.
          const reviewedTwin = b.nodes.find((n) => n.type === "Disease" && n.external_ids.some((x) => x.id === outcome.preview.disease.id));
          if (reviewedTwin && norm(reviewedTwin.label) !== norm(query)) return this.search(reviewedTwin.label);
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
      const diseases = this.graph.neighbors(matched.id, ["has_phenotype"]).map((x) => x.node.label);
      return {
        query,
        found: false,
        message: `"${matched.label}" is a symptom, not a disease. In the demo data it is annotated on: ${diseases.join(", ") || "no diseases"}. Symptom-first search is not yet supported.`,
        suggestions: diseases,
      };
    }

    const focus = this.focusFor(matched);
    // Other supported diseases resolve to their reviewed coverage only: never the focus journey's brief or ranking.
    if (focus && focus.id !== b.focus_disease_id) {
      const coverage = diseaseCoverage(b).find((d) => d.node_id === focus.id);
      if (coverage) {
        const ids = new Set(coverage.reviewed_edge_ids);
        return {
          query,
          found: false,
          partial: true,
          matched: { node_id: matched.id, label: matched.label, type: matched.type, via: resolved?.via, matched_text: resolved?.matched_text },
          banner: PARTIAL_BANNER,
          coverage,
          edges: b.edges.filter((e) => ids.has(e.id)),
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

    const genes = this.graph.neighbors(focus.id, ["caused_by_variant_in"]).map((x) => x.node);
    const mechanisms = genes.flatMap((g) => this.graph.neighbors(g.id, ["involves_mechanism"]).filter((x) => x.edge.subject_id === g.id).map((x) => x.node));
    const phenotypes = this.graph.neighbors(focus.id, ["has_phenotype"]).map((x) => x.node);
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
