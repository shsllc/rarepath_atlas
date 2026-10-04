/** GWAS Catalog REST v2 → statistical trait associations with mapped genes. Association is not causation. */
import { GWAS_WEB, GwasCatalogClient } from "@/lib/providers/gwas";
import { SourceUnavailableError } from "@/lib/providers/opentargets";
import { ProviderError, researchFetch } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchProvider, type ResearchRecord, type ResearchLink } from "../types";

export class GwasProvider implements ResearchProvider {
  needsOntologyId = true;
  meta = {
    id: "gwas" as const,
    name: "GWAS Catalog (REST API v2)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Trait associations", "Variants", "Mapped genes", "Studies (GCST)", "Ontology trait ids"],
    homepage: "https://www.ebi.ac.uk/gwas",
  };
  private client = new GwasCatalogClient(researchFetch, 5_000);

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const id = ctx.disease.ontology_id!;
    const at = ctx.now().toISOString();
    let res;
    try {
      res = await this.client.associationsForTrait(id, 6);
    } catch (e) {
      throw e instanceof SourceUnavailableError ? new ProviderError("GWAS Catalog", "network", e.message) : e;
    }
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = `disease:${id}`;
    for (const a of res.rows) {
      const rs = a.snp_allele?.[0]?.rs_id ?? `assoc-${a.association_id}`;
      const vKey = /^rs\d+$/.test(rs) ? `variant:rsid:${rs}` : `variant:gwas:${rs}`;
      const url = a.accession_id ? `${GWAS_WEB}/studies/${a.accession_id}` : `${GWAS_WEB}/efotraits/${id}`;
      const pv = a.pvalue_mantissa != null && a.pvalue_exponent != null ? `${a.pvalue_mantissa}×10^${a.pvalue_exponent}` : String(a.p_value ?? "not stated");
      records.push({ kind: "variant", key: vKey, label: rs, ids: /^rs\d+$/.test(rs) ? { rsid: rs } : {}, provenance: [{ provider: "gwas", source_id: String(a.association_id), url, retrieved_at: at, native_type: "association" }], review_status: "machine_assembled" });
      links.push(
        link({
          from: vKey,
          to: dKey,
          relation: "gwas_association",
          native_evidence_type: "gwas_association",
          statement: `GWAS Catalog reports a statistical association between ${rs} and ${ctx.disease.label} (p = ${pv}${a.accession_id ? `, study ${a.accession_id}` : ""}${a.mapped_genes?.length ? `; mapped genes: ${a.mapped_genes.join(", ")}` : ""}). Association is not causation and says nothing about any individual.`,
          provenance: [{ provider: "gwas", source_id: String(a.association_id), url, retrieved_at: at, native_type: "association" }],
        }),
      );
    }
    return { records, links, totals: { gwas_associations: res.total } };
  }
}
