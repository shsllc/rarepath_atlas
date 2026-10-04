/**
 * ClinVar via NCBI E-utilities → variant records for the disease (restricted to its top causal gene),
 * with germline classification, review status, conditions and last evaluation, kept verbatim.
 * Never a personal interpretation: a classification is not a diagnosis.
 */
import { contactEmail, fetchJson } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/** ClinVar review status → star rating, as ClinVar defines it. */
export const REVIEW_STARS: Record<string, number> = {
  "practice guideline": 4,
  "reviewed by expert panel": 3,
  "criteria provided, multiple submitters, no conflicts": 2,
  "criteria provided, conflicting classifications": 1,
  "criteria provided, conflicting interpretations": 1,
  "criteria provided, single submitter": 1,
  "no assertion criteria provided": 0,
  "no classification provided": 0,
  "no assertion provided": 0,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ClinVarProvider implements ResearchProvider {
  dependsOn = ["monarch" as const, "opentargets" as const];
  meta = {
    id: "clinvar" as const,
    name: "ClinVar (NCBI E-utilities)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Variant records (VCV)", "Germline classification", "Review status (stars)", "Conditions", "Last evaluated"],
    homepage: "https://www.ncbi.nlm.nih.gov/clinvar",
  };

  private params() {
    const p = new URLSearchParams({ tool: "rarepath-atlas", retmode: "json" });
    if (contactEmail()) p.set("email", contactEmail());
    if (process.env.NCBI_API_KEY) p.set("api_key", process.env.NCBI_API_KEY);
    return p.toString();
  }

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    // Causal gene from Monarch, else the strongest Open Targets genetic gene (first gene record upstream).
    const gene = ctx.upstream.find((r) => r.kind === "gene" && r.provenance.some((p) => p.provider === "monarch"))?.label ?? ctx.upstream.find((r) => r.kind === "gene")?.label;
    const term = gene ? `("${ctx.disease.label}") AND ${gene}[gene]` : `"${ctx.disease.label}"`;
    const s = await fetchJson<any>("ClinVar", `${EUTILS}/esearch.fcgi?db=clinvar&term=${encodeURIComponent(term)}&retmax=8&${this.params()}`, {}, 4_500);
    const ids: string[] = s.esearchresult?.idlist ?? [];
    const total = Number(s.esearchresult?.count ?? 0);
    if (ids.length === 0) return { records: [], links: [], totals: { clinvar_records: total } };
    const sum = await fetchJson<any>("ClinVar", `${EUTILS}/esummary.fcgi?db=clinvar&id=${ids.join(",")}&${this.params()}`, {}, 4_500);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    for (const id of sum.result?.uids ?? []) {
      const v = sum.result[id];
      const vcv: string = v.accession ?? `VCV${id}`;
      const gc = v.germline_classification ?? {};
      const review: string = gc.review_status ?? "not stated";
      const cls: string = gc.description ?? "not stated";
      const rs = (v.variation_set?.[0]?.variation_xrefs ?? []).find((x: any) => x.db_source === "dbSNP")?.db_id;
      const url = `https://www.ncbi.nlm.nih.gov/clinvar/variation/${v.uid ?? id}/`;
      const vKey = rs ? `variant:rsid:rs${rs}` : `variant:vcv:${vcv}`;
      const traits = (gc.trait_set ?? v.trait_set ?? []).map((t: any) => t.trait_name).filter(Boolean).slice(0, 4);
      const prov = { provider: "clinvar" as const, source_id: vcv, url, retrieved_at: at, native_type: `germline_classification:${cls}` };
      records.push({ kind: "variant", key: vKey, label: v.title ?? vcv, ids: { vcv, ...(rs ? { rsid: `rs${rs}` } : {}) }, provenance: [prov], review_status: "machine_assembled" });
      links.push(
        link({
          from: vKey,
          to: dKey,
          relation: "variant_classified_for",
          native_evidence_type: `clinvar:${cls}`,
          statement: `ClinVar ${vcv}: "${cls}" (review status: ${review}; ${REVIEW_STARS[review] ?? 0}★)${traits.length ? ` for ${traits.join("; ")}` : ""}${gc.last_evaluated ? `, last evaluated ${gc.last_evaluated}` : ""}. A database classification, not a personal interpretation or diagnosis.`,
          qualifiers: { classification: cls, review_status: review, stars: String(REVIEW_STARS[review] ?? 0), ...(gc.last_evaluated ? { last_evaluated: gc.last_evaluated } : {}), ...(traits.length ? { conditions: traits.join("; ") } : {}) },
          provenance: [prov],
        }),
      );
    }
    return { records, links, totals: { clinvar_records: total } };
  }
}
