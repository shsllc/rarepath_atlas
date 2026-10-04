import { deriveEvidenceStatus, type EvidenceCoverage, type GraphNode, type SearchResponse } from "@/lib/schemas";
import type { GraphService, ReusableAssetFinder, SearchService } from "./interfaces";

/** Assembles the results-page payload from the graph + finder. Pure orchestration, no I/O. */
export class GraphSearchService implements SearchService {
  constructor(
    private readonly graph: GraphService,
    private readonly finder: ReusableAssetFinder,
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
      return {
        query,
        found: false,
        message: `No supported match for "${query}". This prototype currently covers one verified journey (CDKL5 deficiency disorder); we only show connections we can trace to a retrieved source.`,
        suggestions: [focusLabel, "CDKL5", "CDD"],
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
