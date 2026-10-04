/** Open Targets Platform → genes, ClinVar variants, recorded drug candidates, ontology neighbours, phenotypes, same-gene diseases. */
import { OPEN_TARGETS_WEB, OpenTargetsClient, SourceUnavailableError } from "@/lib/providers/opentargets";
import { fetchJson, ProviderError, researchFetch } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

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
export const GENETIC = new Set(["genetic_association", "genetic_literature", "somatic_mutation"]);
const STAGE: Record<string, string> = { APPROVAL: "Approved (per source)", PHASE_4: "Phase 4", PHASE_3: "Phase 3", PHASE_2: "Phase 2", PHASE_1: "Phase 1", EARLY_PHASE_1: "Early phase 1" };
export const stageLabel = (s: string | null) => STAGE[s ?? ""] ?? (s ? s.replace(/_/g, " ").toLowerCase() : "Stage not stated");
export const stageRank = (label: string) => {
  const i = Object.values(STAGE).indexOf(label);
  return i < 0 ? 99 : i;
};
const colon = (id: string) => id.replace("_", ":");
const XREF: Record<string, "omim" | "orphanet"> = { OMIM: "omim", Orphanet: "orphanet", ORPHANET: "orphanet" };

const OTHER_DISEASES = `query Other($id: String!) {
  target(ensemblId: $id) { associatedDiseases(page: { index: 0, size: 6 }) { count rows { score disease { id name } } } }
}`;

export class OpenTargetsProvider implements ResearchProvider {
  needsOntologyId = true;
  meta = {
    id: "opentargets" as const,
    name: "Open Targets Platform",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Diseases", "Genes / targets", "Target–disease evidence types", "ClinVar variants", "Drug & clinical-candidate records", "Ontology neighbours", "HPO phenotypes"],
    homepage: "https://platform.opentargets.org",
  };
  private client = new OpenTargetsClient(researchFetch, 5_000);

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const id = ctx.disease.ontology_id!;
    const at = ctx.now().toISOString();
    const p = (source_id: string, url: string, native_type: string) => ({ provider: "opentargets" as const, source_id, url, retrieved_at: at, native_type });
    let detail;
    try {
      detail = await this.client.disease(id);
    } catch (e) {
      throw e instanceof SourceUnavailableError ? new ProviderError("Open Targets", "network", e.message) : e;
    }
    const d = detail.disease;
    if (!d) return { records: [], links: [], totals: {} };
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = `disease:${id}`;
    const dUrl = `${OPEN_TARGETS_WEB}/disease/${id}`;
    const ids: ResearchRecord["ids"] = { [id.startsWith("MONDO") ? "mondo" : "efo"]: colon(id) };
    for (const x of d.dbXRefs ?? []) {
      const sys = XREF[x.split(":")[0]];
      if (sys && !ids[sys]) ids[sys] = x;
    }
    const synonyms = d.synonyms?.find((s) => s.relation === "hasExactSynonym")?.terms ?? [];
    records.push({ kind: "disease", key: dKey, label: d.name, ids, synonyms, description: d.description ?? undefined, provenance: [p(id, dUrl, "disease")], review_status: "machine_assembled" });

    const rows = d.associatedTargets?.rows ?? [];
    for (const r of rows) {
      const gKey = `gene:ensembl:${r.target.id}`;
      const url = `${OPEN_TARGETS_WEB}/evidence/${r.target.id}/${id}`;
      records.push({ kind: "gene", key: gKey, label: r.target.approvedSymbol, name: r.target.approvedName, ids: { ensembl: r.target.id, symbol: r.target.approvedSymbol }, provenance: [p(r.target.id, `${OPEN_TARGETS_WEB}/target/${r.target.id}`, "target")], review_status: "machine_assembled" });
      const types = r.datatypeScores.map((s) => s.id);
      const labels = [...new Set(types.map((t) => DATATYPE_LABEL[t] ?? t.replace(/_/g, " ")))];
      links.push(
        link({
          from: dKey,
          to: gKey,
          relation: "associated_with",
          native_evidence_type: types.join(","),
          statement: `Open Targets lists ${r.target.approvedSymbol} as associated with ${d.name}. Evidence types: ${labels.join(", ")}.`,
          source_score: { name: "Open Targets association score (source-computed, not a RarePath score)", value: Math.round(r.score * 1000) / 1000 },
          provenance: [p(`${r.target.id}/${id}`, url, "target_disease_association")],
        }),
      );
    }

    // ClinVar variants for the strongest genetically associated genes, and other diseases listed for the top gene.
    const genetic = rows.filter((r) => r.datatypeScores.some((s) => GENETIC.has(s.id))).slice(0, 3);
    const notes: string[] = [];
    const [variants, others] = await Promise.all([
      this.client.clinvarVariants(id, genetic.map((r) => r.target.id)).catch(() => (notes.push("ClinVar variant evidence could not be loaded."), null)),
      genetic[0]
        ? fetchJson<{ data?: { target?: { associatedDiseases?: { rows: { score: number; disease: { id: string; name: string } }[] } } } }>(
            "Open Targets",
            "https://api.platform.opentargets.org/api/v4/graphql",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: OTHER_DISEASES, variables: { id: genetic[0].target.id } }) },
            5_000,
          ).catch(() => null)
        : Promise.resolve(null),
    ]);
    for (const v of variants?.rows ?? []) {
      const rs = v.variantRsId ?? v.variant?.rsIds?.[0] ?? undefined;
      const vid = v.variant?.id ?? rs ?? "unknown";
      const vKey = rs ? `variant:rsid:${rs}` : `variant:ot:${vid}`;
      const url = v.studyId?.startsWith("RCV") ? `https://www.ncbi.nlm.nih.gov/clinvar/${v.studyId}/` : rs ? `https://www.ncbi.nlm.nih.gov/snp/${rs}` : dUrl;
      records.push({ kind: "variant", key: vKey, label: rs ?? vid, ids: { ...(rs ? { rsid: rs } : {}), ...(v.studyId ? { clinvar: v.studyId } : {}) }, provenance: [p(vid, url, "eva")], review_status: "machine_assembled" });
      const sig = (v.clinicalSignificances ?? []).join(", ") || "not stated";
      links.push(
        link({
          from: vKey,
          to: dKey,
          relation: "variant_classified_for",
          native_evidence_type: `clinvar:${sig}`,
          statement: `ClinVar record ${v.studyId ?? ""} classifies this ${v.target?.approvedSymbol ?? ""} variant for ${d.name} as: ${sig} (ClinVar review status: ${v.confidence ?? "not stated"}).`.replace(/\s+/g, " "),
          provenance: [{ ...p(v.studyId ?? vid, url, "eva"), provider: "opentargets" }],
        }),
      );
    }
    const top = genetic[0];
    for (const o of others?.data?.target?.associatedDiseases?.rows ?? []) {
      if (!top || o.disease.id === id) continue;
      const oKey = `disease:${o.disease.id}`;
      records.push({ kind: "disease", key: oKey, label: o.disease.name, ids: { [o.disease.id.startsWith("MONDO") ? "mondo" : "efo"]: colon(o.disease.id) }, synonyms: [], provenance: [p(o.disease.id, `${OPEN_TARGETS_WEB}/disease/${o.disease.id}`, "disease")], review_status: "machine_assembled" });
      links.push(
        link({
          from: `gene:ensembl:${top.target.id}`,
          to: oKey,
          relation: "gene_associated_with_other_disease",
          native_evidence_type: "target_disease_association",
          statement: `Open Targets also lists ${top.target.approvedSymbol} as associated with ${o.disease.name}. A shared gene does not mean a shared mechanism or shared response to any intervention.`,
          discovery_lead: true,
          source_score: { name: "Open Targets association score (source-computed, not a RarePath score)", value: Math.round(o.score * 1000) / 1000 },
          provenance: [p(`${top.target.id}/${o.disease.id}`, `${OPEN_TARGETS_WEB}/evidence/${top.target.id}/${o.disease.id}`, "target_disease_association")],
        }),
      );
    }
    for (const [rel, list] of [["broader", d.parents ?? []], ["narrower", (d.children ?? []).slice(0, 8)]] as const) {
      for (const r of list) {
        const rKey = `disease:${r.id}`;
        records.push({ kind: "disease", key: rKey, label: r.name, ids: { [r.id.startsWith("MONDO") ? "mondo" : "efo"]: colon(r.id) }, synonyms: [], provenance: [p(r.id, `${OPEN_TARGETS_WEB}/disease/${r.id}`, "disease")], review_status: "machine_assembled" });
        links.push(
          link({
            from: rel === "broader" ? dKey : rKey,
            to: rel === "broader" ? rKey : dKey,
            relation: "subclass_of",
            native_evidence_type: "ontology_parent",
            statement: `Ontology hierarchy: ${rel === "broader" ? `${d.name} is classified under ${r.name}` : `${r.name} is classified under ${d.name}`}. Hierarchy only, not clinical similarity.`,
            provenance: [p(r.id, dUrl, "ontology_parent")],
          }),
        );
      }
    }
    for (const r of d.phenotypes?.rows ?? []) {
      if (!r.phenotypeHPO) continue;
      const hp = colon(r.phenotypeHPO.id);
      records.push({ kind: "phenotype", key: `phenotype:${hp}`, label: r.phenotypeHPO.name, ids: { hpo: hp }, provenance: [p(hp, `https://hpo.jax.org/browse/term/${hp}`, "hpo")], review_status: "machine_assembled" });
      links.push(link({ from: dKey, to: `phenotype:${hp}`, relation: "has_phenotype", native_evidence_type: "disease_phenotype", statement: `${r.phenotypeHPO.name} is annotated on ${d.name} (HPO via Open Targets).`, provenance: [p(hp, dUrl, "disease_phenotype")] }));
    }
    for (const r of d.drugAndClinicalCandidates?.rows ?? []) {
      if (!r.drug) continue;
      const k = `drug:chembl:${r.drug.id}`;
      records.push({ kind: "drug", key: k, label: r.drug.name, ids: { chembl: r.drug.id }, stage: stageLabel(r.maxClinicalStage), drug_type: r.drug.drugType ?? undefined, provenance: [p(r.drug.id, `${OPEN_TARGETS_WEB}/drug/${r.drug.id}`, "clinical_indication")], review_status: "machine_assembled" });
      links.push(
        link({
          from: k,
          to: dKey,
          relation: "recorded_drug_candidate",
          native_evidence_type: `clinical_stage:${r.maxClinicalStage ?? "unknown"}`,
          statement: `Open Targets records ${r.drug.name} for ${d.name} with highest clinical stage "${stageLabel(r.maxClinicalStage)}". Research discovery only; not a recommendation.`,
          provenance: [p(r.drug.id, `${OPEN_TARGETS_WEB}/drug/${r.drug.id}`, "clinical_indication")],
        }),
      );
    }
    return {
      records,
      links,
      totals: { genes: d.associatedTargets?.count ?? 0, variants: variants?.count ?? 0, drug_candidates: d.drugAndClinicalCandidates?.count ?? 0, phenotypes: d.phenotypes?.count ?? 0 },
      notes: [...notes, `API ${detail.apiVersion}, data ${detail.dataVersion}`],
    };
  }
}
