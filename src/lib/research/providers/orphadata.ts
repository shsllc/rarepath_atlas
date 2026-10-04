/**
 * Orphadata (official Orphanet API, CC BY 4.0) → ORPHA identity and mappings, synonyms, HPO phenotypes with
 * Orphanet frequency (including "Excluded (0%)" NOT annotations), gene associations with Orphanet's own type,
 * epidemiology and natural history (verbatim).
 *
 * An ORPHA record is tied to the MONDO disease only when Orphanet and the disease share an identifier with an
 * Exact, validated mapping (GARD, OMIM). A name match alone is kept separate and flagged, never merged.
 */
import { fetchJson, normName } from "../fetch";
import { link, type DiseaseRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const ORPHADATA_API = "https://api.orphadata.com";
export const ORPHADATA_LICENCE = "Orphadata, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0)";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Res<T> = { data?: { results?: T } };

export class OrphadataProvider implements ResearchProvider {
  dependsOn = ["monarch" as const, "opentargets" as const];
  meta = {
    id: "orphadata" as const,
    name: "Orphadata (Orphanet API)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["ORPHA codes & validated mappings", "Synonyms & definitions", "HPO phenotypes with frequency (incl. excluded)", "Gene associations (Orphanet type)", "Epidemiology", "Natural history (onset, inheritance)"],
    homepage: "https://www.orphadata.com",
  };

  private get<T>(path: string) {
    return fetchJson<Res<T>>("Orphadata", `${ORPHADATA_API}${path}${path.includes("?") ? "&" : "?"}lang=en`, {}, 4_500);
  }

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    // Identifiers the MONDO/Open Targets disease already carries, used to verify the Orphanet record.
    const upstreamDisease = ctx.upstream.filter((r): r is DiseaseRecord => r.kind === "disease" && r.key === dKey);
    const xrefText = upstreamDisease.flatMap((d) => d.provenance.map((p) => p.native_type)).join(" ");
    const gardIds = new Set(upstreamDisease.map((d) => d.ids.gard).filter(Boolean).map((g) => String(g).replace(/^0+/, "")));
    for (const m of xrefText.matchAll(/GARD:0*(\d+)/g)) gardIds.add(m[1]);
    const omimIds = new Set(upstreamDisease.map((d) => d.ids.omim?.replace("OMIM:", "")).filter((x): x is string => !!x));
    const knownOrpha = upstreamDisease.map((d) => d.ids.orphanet?.replace(/^Orphanet:/i, "")).find(Boolean);

    let xr: any;
    if (knownOrpha) xr = (await this.get<any>(`/rd-cross-referencing/orphacodes/${knownOrpha}`)).data?.results;
    else xr = (await this.get<any>(`/rd-cross-referencing/orphacodes/names/${encodeURIComponent(ctx.disease.label)}`).catch(() => null))?.data?.results;
    if (!xr?.ORPHAcode) return { records: [], links: [], totals: {}, notes: ["No Orphanet record found for this disease name."] };
    const code = String(xr.ORPHAcode);

    const exact = (xr.ExternalReference ?? []).filter((e: any) => /^E \(Exact/.test(e.DisorderMappingRelation ?? "") && e.DisorderMappingValidationStatus === "Validated");
    const shared = exact.find((e: any) => (e.Source === "GARD" && gardIds.has(String(e.Reference).replace(/^0+/, ""))) || (e.Source === "OMIM" && omimIds.has(String(e.Reference))));
    const verified = !!knownOrpha || !!shared;
    const basis = knownOrpha ? `ORPHA:${code} is listed in the disease's own cross-references` : shared ? `shared identifier ${shared.Source}:${shared.Reference} (Orphanet exact, validated mapping)` : "name match only; no shared exact-mapped identifier, so kept separate";
    const oKey = verified ? dKey : `disease:orpha:${code}`;
    const url = `https://www.orpha.net/en/disease/detail/${code}`;
    const prov = (native_type: string) => ({ provider: "orphadata" as const, source_id: `ORPHA:${code}`, url, retrieved_at: at, native_type });

    const [ph, genes, epi, nh] = await Promise.all([
      this.get<any>(`/rd-phenotypes/orphacodes/${code}`).catch(() => null),
      this.get<any>(`/rd-associated-genes/orphacodes/${code}`).catch(() => null),
      this.get<any>(`/rd-epidemiology/orphacodes/${code}`).catch(() => null),
      this.get<any>(`/rd-natural_history/orphacodes/${code}`).catch(() => null),
    ]);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const omimExact = exact.filter((e: any) => e.Source === "OMIM").map((e: any) => `OMIM:${e.Reference}`);
    records.push({
      kind: "disease",
      key: oKey,
      label: xr["Preferred term"],
      ids: { orphanet: `Orphanet:${code}`, ...(omimExact[0] ? { omim: omimExact[0] } : {}), ...(verified && ctx.disease.ontology_id?.startsWith("MONDO") ? { mondo: ctx.disease.ontology_id.replace("_", ":") } : {}) },
      synonyms: xr.Synonym ?? [],
      description: xr.SummaryInformation?.[0]?.Definition ?? undefined,
      epidemiology: (epi?.data?.results?.Prevalence ?? []).slice(0, 8).map((p: any) => ({ type: p.PrevalenceType, class: p.PrevalenceClass ?? undefined, geographic: p.PrevalenceGeographic ?? undefined, qualification: p.PrevalenceQualification ?? undefined, validation: p.PrevalenceValidationStatus ?? undefined })),
      natural_history: nh?.data?.results ? { onset: nh.data.results.AverageAgeOfOnset ?? [], inheritance: nh.data.results.TypeOfInheritance ?? [] } : undefined,
      mapping_basis: basis,
      provenance: [prov(`disorder; mappings: ${exact.map((e: any) => `${e.Source}:${e.Reference}`).join(" ")}`)],
      review_status: "machine_assembled",
    });

    for (const a of ph?.data?.results?.Disorder?.HPODisorderAssociation ?? []) {
      const hp = a.HPO?.HPOId;
      if (!hp) continue;
      const pKey = `phenotype:${hp}`;
      const freq: string = a.HPOFrequency ?? "frequency not stated";
      const excluded = /^Excluded/i.test(freq);
      records.push({ kind: "phenotype", key: pKey, label: a.HPO.HPOTerm, ids: { hpo: hp }, provenance: [prov("hpo_disorder_association")], review_status: "machine_assembled" });
      links.push(
        link({
          from: oKey,
          to: pKey,
          relation: excluded ? "phenotype_excluded" : "has_phenotype",
          native_evidence_type: `orphanet_frequency:${freq}`,
          statement: excluded ? `Orphanet records ${a.HPO.HPOTerm} as EXCLUDED (absent) in ${xr["Preferred term"]}.` : `Orphanet annotates ${a.HPO.HPOTerm} on ${xr["Preferred term"]} with frequency "${freq}".`,
          qualifiers: { frequency: freq, ...(a.DiagnosticCriteria ? { diagnostic_criteria: String(a.DiagnosticCriteria) } : {}), source: `ORPHA:${code}` },
          provenance: [prov("hpo_disorder_association")],
        }),
      );
    }
    for (const g of genes?.data?.results?.DisorderGeneAssociation ?? []) {
      const refs = (g.Gene?.ExternalReference ?? []) as { Source: string; Reference: string }[];
      const ens = refs.find((r) => r.Source === "Ensembl")?.Reference;
      const hgnc = refs.find((r) => r.Source === "HGNC")?.Reference;
      const sym: string = g.Gene?.Symbol ?? refs.find((r) => r.Source === "ClinVar")?.Reference ?? "gene";
      const gKey = ens ? `gene:ensembl:${ens}` : hgnc ? `gene:hgnc:HGNC:${hgnc}` : `gene:orphanet:${normName(sym)}`;
      records.push({ kind: "gene", key: gKey, label: sym, name: g.Gene?.Name, ids: { symbol: sym, ...(ens ? { ensembl: ens } : {}), ...(hgnc ? { hgnc: `HGNC:${hgnc}` } : {}) }, provenance: [prov("disorder_gene_association")], review_status: "machine_assembled" });
      // Only Orphanet's "Disease-causing …" types are causal; modifiers, susceptibility factors, etc. stay associations.
      const causal = /disease-causing/i.test(g.DisorderGeneAssociationType ?? "");
      links.push(
        link({
          from: gKey,
          to: oKey,
          relation: causal ? "causal_gene" : "associated_with",
          native_evidence_type: `orphanet:${g.DisorderGeneAssociationType}`,
          statement: `Orphanet: ${g.DisorderGeneAssociationType} ${sym} (status: ${g.DisorderGeneAssociationStatus ?? "not stated"}). Source-native wording; not an individual's diagnosis.`,
          qualifiers: { association_type: g.DisorderGeneAssociationType ?? "", status: g.DisorderGeneAssociationStatus ?? "" },
          provenance: [prov("disorder_gene_association")],
        }),
      );
    }
    return { records, links, totals: { orphanet_phenotypes: (ph?.data?.results?.Disorder?.HPODisorderAssociation ?? []).length, orphanet_genes: (genes?.data?.results?.DisorderGeneAssociation ?? []).length }, notes: [ORPHADATA_LICENCE, `ORPHA:${code} — ${basis}`] };
  }
}
