/**
 * Discovery layer: a machine-assembled research preview for diseases outside the reviewed slice.
 *
 * Built at query time from structured public research APIs (Open Targets Platform, GWAS Catalog v2).
 * Every relationship is stamped review_status = "machine_assembled", eligible_for_ranking = false,
 * eligible_for_action = false, and keeps its source identifiers. Nothing here is ever written into the
 * reviewed bundle, scored by Research Connection Strength, or used by a Research Action Brief.
 */
import type { EvidenceEdge, GraphNode, Predicate } from "@/lib/schemas";
import { GWAS_WEB, GwasCatalogClient, type GwasAssociation } from "@/lib/providers/gwas";
import { OPEN_TARGETS_WEB, OpenTargetsClient, SourceUnavailableError, type OTDisease, type OTSearchHit } from "@/lib/providers/opentargets";

export const DISCOVERY_LABEL = "MACHINE-ASSEMBLED DISCOVERY GRAPH";
export const DISCOVERY_SUBLABEL = "NOT YET ANALYST REVIEWED";
export const DISCOVERY_EXPLAINER =
  "These connections can help identify where to investigate next. They do not yet participate in RarePath's reviewed ranking or Research Action Brief.";

/** Open Targets datatype ids → plain labels. "clinical" means a drug-trial target, not a genetic cause. */
export const DATATYPE_LABEL: Record<string, string> = {
  genetic_association: "Genetic association",
  genetic_literature: "Curated gene panel / literature",
  somatic_mutation: "Somatic mutation",
  clinical: "Drug-trial target (not a genetic cause)",
  known_drug: "Drug-trial target (not a genetic cause)",
  affected_pathway: "Affected pathway",
  rna_expression: "RNA expression",
  literature: "Text-mined literature",
  animal_model: "Animal model",
};
const GENETIC = new Set(["genetic_association", "genetic_literature", "somatic_mutation"]);

export type DiscoveryTarget = { symbol: string; name: string; ensembl_id: string; url: string; evidence_types: string[]; genetic: boolean; edge_id: string };
export type DiscoveryVariant = { label: string; variant_id: string; rs_id?: string; gene?: string; clinical_significance: string[]; source_review_status?: string; record_id?: string; url: string; edge_id: string };
export type DiscoveryGwas = { rs_id: string; p_value: string; mapped_genes: string[]; accession?: string; pubmed_id?: string; url: string; edge_id: string };
export type DiscoveryDrug = { chembl_id: string; name: string; drug_type?: string; stage: string; url: string };
export type DiscoveryRelated = { id: string; name: string; relation: "broader" | "narrower"; url: string; edge_id: string };
export type DiscoverySource = { name: string; url: string; version?: string; retrieved_at: string; ok: boolean; note?: string };

export type DiscoveryPreview = {
  tier: "machine_assembled";
  eligible_for_ranking: false;
  eligible_for_action: false;
  disease: { id: string; source_id: string; label: string; description?: string; url: string; identifiers: { system: string; id: string }[]; synonyms: string[]; therapeutic_areas: string[] };
  match: { query: string; exact: boolean; alternatives: { id: string; name: string }[] };
  targets: DiscoveryTarget[];
  variants: DiscoveryVariant[];
  gwas: DiscoveryGwas[];
  drugs: DiscoveryDrug[];
  related: DiscoveryRelated[];
  phenotypes: { id: string; name: string; url: string }[];
  counts: { genes: number; variants: number; gwas_associations: number; drug_candidates: number; related_diseases: number; phenotypes: number };
  sources: DiscoverySource[];
  warnings: string[];
  nodes: GraphNode[];
  edges: EvidenceEdge[];
};

export type DiscoveryOutcome = { kind: "preview"; preview: DiscoveryPreview } | { kind: "no_match" } | { kind: "unavailable"; message: string };

export interface DiscoveryService {
  preview(query: string): Promise<DiscoveryOutcome>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const colon = (id: string) => id.replace("_", ":");
const ID_RE = /^(MONDO|EFO|Orphanet|HP|OTAR|DOID)[:_]\d+$/i;
const STAGE: Record<string, string> = { APPROVAL: "Approved (per source)", PHASE_4: "Phase 4", PHASE_3: "Phase 3", PHASE_2: "Phase 2", PHASE_1: "Phase 1", EARLY_PHASE_1: "Early phase 1" };
const stageRank = (label: string) => {
  const i = Object.values(STAGE).indexOf(label);
  return i < 0 ? 99 : i;
};
const XREF_KEEP = ["OMIM", "Orphanet", "ORPHANET", "GARD", "DOID", "MESH", "MeSH", "MEDGEN", "NCIT", "UMLS"];

function edge(id: string, subject_id: string, predicate: Predicate, object_id: string, source: string, source_url: string, statement: string, retrieved: string): EvidenceEdge {
  return {
    id,
    subject_id,
    predicate,
    object_id,
    source,
    source_url,
    retrieval_date: retrieved,
    source_type: "research_platform",
    evidence_type: "machine_assembled",
    quoted_or_structured_evidence: statement,
    evidence: [
      {
        id: `ev:${id}`,
        source,
        source_url,
        retrieval_date: retrieved,
        source_type: "research_platform",
        evidence_type: "machine_assembled",
        quoted_or_structured_evidence: statement,
        method: "structured_api",
        stance: "supports",
      },
    ],
    // Not reviewed by RarePath: confidence is deliberately "insufficient" so no view can show it as Known.
    confidence: "insufficient",
    inferred: false,
    contradiction_status: "none",
    created_at: retrieved,
    review_status: "machine_assembled",
    eligible_for_ranking: false,
    eligible_for_action: false,
  };
}

function pValue(a: GwasAssociation): string {
  if (a.pvalue_mantissa != null && a.pvalue_exponent != null) return `${a.pvalue_mantissa}×10^${a.pvalue_exponent}`;
  return a.p_value != null ? String(a.p_value) : "not stated";
}

export class OpenDataDiscoveryService implements DiscoveryService {
  private cache = new Map<string, { at: number; value: DiscoveryOutcome }>();

  constructor(
    private readonly ot = new OpenTargetsClient(),
    private readonly gwasClient: GwasCatalogClient | null = new GwasCatalogClient(),
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 60 * 60 * 1000,
  ) {}

  async preview(raw: string): Promise<DiscoveryOutcome> {
    const query = raw.trim().slice(0, 120);
    if (query.length < 2) return { kind: "no_match" };
    const key = norm(query);
    const hit = this.cache.get(key);
    if (hit && this.now().getTime() - hit.at < this.ttlMs) return hit.value;
    const value = await this.assemble(query);
    // Failures are not cached, so a transient outage recovers on the next search.
    if (value.kind !== "unavailable") {
      if (this.cache.size > 200) this.cache.clear();
      this.cache.set(key, { at: this.now().getTime(), value });
    }
    return value;
  }

  private async assemble(query: string): Promise<DiscoveryOutcome> {
    const retrieved = this.now().toISOString().slice(0, 10);
    try {
      let hits: OTSearchHit[] = [];
      let id: string;
      if (ID_RE.test(query)) id = query.replace(":", "_");
      else {
        hits = (await this.ot.searchDiseases(query)).hits;
        if (hits.length === 0) return { kind: "no_match" };
        const q = norm(query);
        id = (hits.find((h) => norm(h.name) === q) ?? hits[0]).id;
      }

      const [detail, gwasRes] = await Promise.all([
        this.ot.disease(id),
        this.gwasClient ? this.gwasClient.associationsForTrait(id).then((r) => ({ ok: true as const, r }), (e) => ({ ok: false as const, e })) : Promise.resolve(null),
      ]);
      const d = detail.disease;
      if (!d) return { kind: "no_match" };

      const genetic = (d.associatedTargets?.rows ?? []).filter((r) => r.datatypeScores.some((s) => GENETIC.has(s.id))).slice(0, 3);
      let variantsRes: Awaited<ReturnType<OpenTargetsClient["clinvarVariants"]>> | null = null;
      let variantWarning: string | undefined;
      try {
        variantsRes = await this.ot.clinvarVariants(d.id, genetic.map((r) => r.target.id));
      } catch {
        variantWarning = "ClinVar variant evidence could not be loaded from Open Targets this time.";
      }

      return { kind: "preview", preview: this.build(query, d, hits, detail, gwasRes, variantsRes, variantWarning, retrieved) };
    } catch (e) {
      if (e instanceof SourceUnavailableError) {
        return { kind: "unavailable", message: "The public discovery sources could not be reached right now. RarePath's reviewed results are unaffected; please try again shortly." };
      }
      throw e;
    }
  }

  private build(
    query: string,
    d: OTDisease,
    hits: OTSearchHit[],
    detail: { apiVersion: string; dataVersion: string },
    gwasRes: { ok: true; r: { total: number; rows: GwasAssociation[] } } | { ok: false; e: unknown } | null,
    variantsRes: { count: number; rows: import("@/lib/providers/opentargets").OTVariantEvidence[] } | null,
    variantWarning: string | undefined,
    retrieved: string,
  ): DiscoveryPreview {
    const diseaseNodeId = `disc:disease:${d.id}`;
    const diseaseUrl = `${OPEN_TARGETS_WEB}/disease/${d.id}`;
    const nodes: GraphNode[] = [];
    const edges: EvidenceEdge[] = [];
    const exactSyn = d.synonyms?.find((s) => s.relation === "hasExactSynonym")?.terms ?? [];
    const q = norm(query);
    const exact = norm(d.name) === q || exactSyn.some((t) => norm(t) === q) || norm(colon(d.id)) === q || norm(d.id) === q;

    nodes.push({
      id: diseaseNodeId,
      type: "Disease",
      label: d.name,
      aliases: exactSyn,
      external_ids: [{ system: d.id.split("_")[0], id: colon(d.id), url: diseaseUrl, verification: "pending" }],
      description: d.description ?? undefined,
      verification: "pending",
      inheritance: [],
    });

    const targets: DiscoveryTarget[] = (d.associatedTargets?.rows ?? []).slice(0, 12).map((r) => {
      const gid = `disc:gene:${r.target.id}`;
      nodes.push({ id: gid, type: "Gene", label: r.target.approvedSymbol, symbol: r.target.approvedSymbol, aliases: [], external_ids: [{ system: "Ensembl", id: r.target.id, verification: "pending" }], description: r.target.approvedName, verification: "pending" });
      const types = r.datatypeScores.map((s) => s.id);
      const labels = [...new Set(types.map((t) => DATATYPE_LABEL[t] ?? t.replace(/_/g, " ")))];
      const url = `${OPEN_TARGETS_WEB}/evidence/${r.target.id}/${d.id}`;
      const e = edge(`edge:disc:ot:${d.id}|associated_with|${r.target.id}`, diseaseNodeId, "associated_with", gid, "Open Targets Platform", url, `Open Targets lists ${r.target.approvedSymbol} as associated with ${d.name}. Evidence types: ${labels.join(", ")}.`, retrieved);
      edges.push(e);
      return { symbol: r.target.approvedSymbol, name: r.target.approvedName, ensembl_id: r.target.id, url, evidence_types: labels, genetic: types.some((t) => GENETIC.has(t)), edge_id: e.id };
    });

    const variants: DiscoveryVariant[] = (variantsRes?.rows ?? []).map((v) => {
      const rs = v.variantRsId ?? v.variant?.rsIds?.[0] ?? undefined;
      const vid = v.variant?.id ?? rs ?? "unknown";
      const nodeId = `disc:variant:${vid}`;
      if (!nodes.some((n) => n.id === nodeId)) nodes.push({ id: nodeId, type: "Variant", label: rs ?? vid, aliases: [], external_ids: rs ? [{ system: "dbSNP", id: rs, url: `https://www.ncbi.nlm.nih.gov/snp/${rs}`, verification: "pending" }] : [], verification: "pending" });
      const url = v.studyId?.startsWith("RCV") ? `https://www.ncbi.nlm.nih.gov/clinvar/${v.studyId}/` : rs ? `https://www.ncbi.nlm.nih.gov/snp/${rs}` : diseaseUrl;
      const sig = v.clinicalSignificances ?? [];
      const e = edge(
        `edge:disc:clinvar:${v.studyId ?? vid}|associated_with|${d.id}`,
        nodeId,
        "associated_with",
        diseaseNodeId,
        "ClinVar via Open Targets",
        url,
        `ClinVar record ${v.studyId ?? ""} classifies this ${v.target?.approvedSymbol ?? ""} variant for ${d.name} as: ${sig.join(", ") || "not stated"} (ClinVar review status: ${v.confidence ?? "not stated"}).`.replace(/\s+/g, " "),
        retrieved,
      );
      edges.push(e);
      return { label: rs ?? vid, variant_id: vid, rs_id: rs, gene: v.target?.approvedSymbol, clinical_significance: sig, source_review_status: v.confidence ?? undefined, record_id: v.studyId ?? undefined, url, edge_id: e.id };
    });

    const gwas: DiscoveryGwas[] =
      gwasRes && gwasRes.ok
        ? gwasRes.r.rows.map((a) => {
            const rs = a.snp_allele?.[0]?.rs_id ?? "variant";
            const url = a.accession_id ? `${GWAS_WEB}/studies/${a.accession_id}` : `${GWAS_WEB}/efotraits/${d.id}`;
            const nodeId = `disc:variant:${rs}`;
            if (!nodes.some((n) => n.id === nodeId)) nodes.push({ id: nodeId, type: "Variant", label: rs, aliases: [], external_ids: [], verification: "pending" });
            const e = edge(`edge:disc:gwas:${a.association_id}`, nodeId, "associated_with", diseaseNodeId, "GWAS Catalog", url, `GWAS Catalog association ${a.association_id}: ${rs} with ${d.name}, p = ${pValue(a)}${a.accession_id ? ` (study ${a.accession_id})` : ""}.`, retrieved);
            edges.push(e);
            return { rs_id: rs, p_value: pValue(a), mapped_genes: a.mapped_genes ?? [], accession: a.accession_id ?? undefined, pubmed_id: a.pubmed_id ?? undefined, url, edge_id: e.id };
          })
        : [];

    const related: DiscoveryRelated[] = [
      ...(d.parents ?? []).map((p) => ({ ...p, relation: "broader" as const })),
      ...(d.children ?? []).slice(0, 8).map((c) => ({ ...c, relation: "narrower" as const })),
    ].map((r) => {
      const nodeId = `disc:disease:${r.id}`;
      nodes.push({ id: nodeId, type: "Disease", label: r.name, aliases: [], external_ids: [{ system: r.id.split("_")[0], id: colon(r.id), verification: "pending" }], verification: "pending", inheritance: [] });
      const [sub, obj] = r.relation === "broader" ? [diseaseNodeId, nodeId] : [nodeId, diseaseNodeId];
      const e = edge(`edge:disc:onto:${r.relation === "broader" ? `${d.id}|subclass_of|${r.id}` : `${r.id}|subclass_of|${d.id}`}`, sub, "subclass_of", obj, "Disease ontology via Open Targets", diseaseUrl, `Ontology hierarchy: ${r.relation === "broader" ? `${d.name} is classified under ${r.name}` : `${r.name} is classified under ${d.name}`}.`, retrieved);
      edges.push(e);
      return { id: colon(r.id), name: r.name, relation: r.relation, url: `${OPEN_TARGETS_WEB}/disease/${r.id}`, edge_id: e.id };
    });

    const phenotypes = (d.phenotypes?.rows ?? [])
      .map((r) => r.phenotypeHPO)
      .filter((p): p is { id: string; name: string } => !!p)
      .map((p) => ({ id: colon(p.id), name: p.name, url: `https://hpo.jax.org/browse/term/${colon(p.id)}` }));

    const drugs: DiscoveryDrug[] = (d.drugAndClinicalCandidates?.rows ?? [])
      .filter((r) => r.drug)
      .map((r) => ({ chembl_id: r.drug!.id, name: r.drug!.name, drug_type: r.drug!.drugType ?? undefined, stage: STAGE[r.maxClinicalStage ?? ""] ?? (r.maxClinicalStage ?? "Stage not stated").replace(/_/g, " ").toLowerCase(), url: `${OPEN_TARGETS_WEB}/drug/${r.drug!.id}` }))
      .sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
      .slice(0, 10);

    const identifiers = [
      { system: d.id.split("_")[0], id: colon(d.id) },
      ...(d.dbXRefs ?? [])
        .filter((x) => XREF_KEEP.includes(x.split(":")[0]))
        .slice(0, 7)
        .map((x) => ({ system: x.split(":")[0], id: x })),
    ];

    const warnings: string[] = [];
    if (!exact) warnings.push(`Closest Open Targets match for "${query}". Check that this is the disease you meant.`);
    if (variantWarning) warnings.push(variantWarning);
    if (gwasRes && !gwasRes.ok) warnings.push("The GWAS Catalog could not be reached this time; genome-wide association results are not shown.");

    const sources: DiscoverySource[] = [
      { name: "Open Targets Platform", url: diseaseUrl, version: `API ${detail.apiVersion}, data ${detail.dataVersion}`, retrieved_at: retrieved, ok: true },
      ...(this.gwasClient ? [{ name: "GWAS Catalog (REST API v2)", url: `${GWAS_WEB}/efotraits/${d.id}`, retrieved_at: retrieved, ok: !!gwasRes?.ok, note: gwasRes?.ok ? undefined : "unavailable" }] : []),
    ];

    return {
      tier: "machine_assembled",
      eligible_for_ranking: false,
      eligible_for_action: false,
      disease: { id: colon(d.id), source_id: d.id, label: d.name, description: d.description ?? undefined, url: diseaseUrl, identifiers, synonyms: exactSyn.slice(0, 8), therapeutic_areas: (d.therapeuticAreas ?? []).map((t) => t.name) },
      match: { query, exact, alternatives: hits.filter((h) => h.id !== d.id).slice(0, 4).map((h) => ({ id: colon(h.id), name: h.name })) },
      targets,
      variants,
      gwas,
      drugs,
      related,
      phenotypes,
      counts: {
        genes: d.associatedTargets?.count ?? 0,
        variants: variantsRes?.count ?? 0,
        gwas_associations: gwasRes && gwasRes.ok ? gwasRes.r.total : 0,
        drug_candidates: d.drugAndClinicalCandidates?.count ?? 0,
        related_diseases: (d.parents?.length ?? 0) + (d.children?.length ?? 0),
        phenotypes: d.phenotypes?.count ?? 0,
      },
      sources,
      warnings,
      nodes,
      edges,
    };
  }
}
