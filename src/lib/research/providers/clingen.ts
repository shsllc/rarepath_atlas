/**
 * ClinGen → expert-curated Gene-Disease Validity (source-native classification, expert panel, mode of
 * inheritance, date), Dosage Sensitivity for those genes, and expert-panel variant classifications
 * (ClinGen Evidence Repository). Validity is kept distinct from ordinary gene "associations" and never
 * becomes a RarePath score.
 *
 * The public validity and dosage endpoints return full lists, so each is downloaded at most once per
 * server instance per day and filtered in memory.
 */
import { fetchJson } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const CLINGEN_SEARCH = "https://search.clinicalgenome.org";
export const CLINGEN_EREPO = "https://erepo.clinicalgenome.org/evrepo/api";

export const DOSAGE_SCORE: Record<string, string> = {
  "0": "No evidence available",
  "1": "Little evidence for dosage pathogenicity",
  "2": "Some evidence for dosage pathogenicity",
  "3": "Sufficient evidence for dosage pathogenicity",
  "30": "Gene associated with autosomal recessive phenotype",
  "40": "Dosage sensitivity unlikely",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type ValidityRow = { symbol: string; hgnc_id: string; ep: string; disease_name: string; mondo: string; moi: string; classification: string; report_id: string; released: string; date: string; animal_model_only: number };
type DosageRow = { symbol: string; hgnc_id: string; haplo_assertion: number | string | null; triplo_assertion: number | string | null; haplo_disease?: string; haplo_mondo?: string; date?: string; rawdate?: string };

const cache = new Map<string, { at: number; rows: Promise<unknown[]> }>();
function cachedList<T>(path: string, ttlMs = 24 * 3_600_000): Promise<T[]> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.rows as Promise<T[]>;
  const rows = fetchJson<{ rows: T[] }>("ClinGen", `${CLINGEN_SEARCH}${path}`, {}, 5_500).then((j) => j.rows ?? []);
  rows.catch(() => cache.delete(path));
  cache.set(path, { at: Date.now(), rows });
  return rows;
}
/** Test seam. */
export const clearClinGenCache = () => cache.clear();

export class ClinGenProvider implements ResearchProvider {
  needsOntologyId = true;
  meta = {
    id: "clingen" as const,
    name: "ClinGen",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Gene-Disease Validity (expert classification)", "Dosage Sensitivity", "Expert-panel variant classifications"],
    homepage: "https://clinicalgenome.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const mondo = ctx.disease.ontology_id!.replace("_", ":");
    if (!mondo.startsWith("MONDO:")) return { records: [], links: [], totals: {}, notes: ["ClinGen curations are keyed by MONDO."] };
    const at = ctx.now().toISOString();
    const dKey = `disease:${ctx.disease.ontology_id}`;
    const [validity, dosage] = await Promise.all([cachedList<ValidityRow>("/api/validity"), cachedList<DosageRow>("/api/dosage").catch(() => [] as DosageRow[])]);
    const rows = validity.filter((r) => r.mondo === mondo);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    for (const r of rows) {
      const gKey = `gene:hgnc:${r.hgnc_id}`;
      const url = `${CLINGEN_SEARCH}/kb/gene-validity/${r.report_id ? `CGGV:assertion_${r.report_id}` : ""}`.replace(/\/$/, "");
      const prov = { provider: "clingen" as const, source_id: r.report_id, url: `${CLINGEN_SEARCH}/kb/genes/${r.hgnc_id}`, retrieved_at: at, native_type: "gene_disease_validity" };
      records.push({ kind: "gene", key: gKey, label: r.symbol, ids: { hgnc: r.hgnc_id, symbol: r.symbol }, provenance: [prov], review_status: "machine_assembled" });
      links.push(
        link({
          from: gKey,
          to: dKey,
          relation: "clingen_validity",
          native_evidence_type: `clingen_validity:${r.classification}`,
          statement: `ClinGen ${r.ep} classifies the ${r.symbol}–${r.disease_name.trim()} relationship as "${r.classification}" (${r.moi}, released ${r.released}). Expert-curated gene-disease validity, preserved as ClinGen states it; not a RarePath score and not an individual diagnosis.`,
          qualifiers: { classification: r.classification, expert_panel: r.ep, mode_of_inheritance: r.moi, released: r.released, ...(r.animal_model_only ? { animal_model_only: "yes" } : {}) },
          provenance: [{ ...prov, url: url || prov.url }],
        }),
      );
      const ds = dosage.find((x) => x.hgnc_id === r.hgnc_id);
      if (ds) {
        const h = DOSAGE_SCORE[String(ds.haplo_assertion ?? "")] ?? "Not curated";
        const t = DOSAGE_SCORE[String(ds.triplo_assertion ?? "")] ?? "Not curated";
        links.push(
          link({
            from: gKey,
            to: gKey,
            relation: "dosage_sensitivity",
            native_evidence_type: `clingen_dosage:haplo=${ds.haplo_assertion ?? "na"};triplo=${ds.triplo_assertion ?? "na"}`,
            statement: `ClinGen dosage sensitivity for ${r.symbol}: haploinsufficiency — ${h}; triplosensitivity — ${t}${ds.haplo_disease ? ` (haploinsufficiency curated for ${ds.haplo_disease})` : ""}.`,
            qualifiers: { haploinsufficiency: h, triplosensitivity: t, ...(ds.haplo_disease ? { haplo_disease: ds.haplo_disease } : {}) },
            provenance: [{ provider: "clingen", source_id: `dosage:${r.hgnc_id}`, url: `${CLINGEN_SEARCH}/kb/gene-dosage/${r.hgnc_id}`, retrieved_at: at, native_type: "dosage_sensitivity" }],
          }),
        );
      }
    }
    // Expert-panel variant classifications for the first curated gene, limited to this condition.
    const gene = rows[0]?.symbol;
    let variantCount = 0;
    if (gene) {
      const ev = await fetchJson<{ variantInterpretations?: any[] }>("ClinGen", `${CLINGEN_EREPO}/classifications?gene=${encodeURIComponent(gene)}&matchMode=exact`, {}, 4_500).catch(() => null);
      const forDisease = (ev?.variantInterpretations ?? []).filter((v) => v.condition?.["@id"] === mondo);
      variantCount = forDisease.length;
      for (const v of forDisease.slice(0, 8)) {
        const hgvs: string = v.hgvs?.[0] ?? v.caid;
        const vKey = v.caid ? `variant:caid:${v.caid}` : `variant:hgvs:${hgvs}`;
        const outcome = v.guidelines?.[0]?.outcome?.label ?? "not stated";
        const url = v.uuid ? `${CLINGEN_EREPO.replace("/api", "")}/ui/classification/${v.uuid}` : `${CLINGEN_EREPO.replace("/api", "")}/ui/`;
        records.push({ kind: "variant", key: vKey, label: hgvs, ids: {}, provenance: [{ provider: "clingen", source_id: v.uuid ?? hgvs, url, retrieved_at: at, native_type: "variant_classification" }], review_status: "machine_assembled" });
        links.push(
          link({
            from: vKey,
            to: dKey,
            relation: "variant_classified_for",
            native_evidence_type: `clingen_vcep:${outcome}`,
            statement: `ClinGen expert panel classification of ${hgvs} (${gene}) for ${v.condition?.label ?? "this condition"}: ${outcome}${v.publishedDate ? ` (published ${v.publishedDate})` : ""}. Not a personal interpretation.`,
            qualifiers: { classification: outcome, review_status: "reviewed by ClinGen expert panel", ...(v.publishedDate ? { published: v.publishedDate } : {}) },
            provenance: [{ provider: "clingen", source_id: v.uuid ?? hgvs, url, retrieved_at: at, native_type: "variant_classification" }],
          }),
        );
      }
    }
    return { records, links, totals: { clingen_validity: rows.length, clingen_variant_classifications: variantCount }, notes: ["ClinGen Clinical Actionability is not queried: its reports cover adult/pediatric actionability topics rather than disease discovery."] };
  }
}
