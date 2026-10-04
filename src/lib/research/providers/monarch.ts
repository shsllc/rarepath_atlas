/**
 * Monarch Initiative v3 → disease entity and cross-references, curated causal genes (with their knowledge
 * source), and cross-species disease models. Strong discovery / normalization source; never reviewed evidence.
 */
import { fetchJson } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const MONARCH_API = "https://api-v3.monarchinitiative.org/v3/api";
const infores = (s?: string) => (s ? s.replace("infores:", "") : "unknown source");

/* eslint-disable @typescript-eslint/no-explicit-any */
export class MonarchProvider implements ResearchProvider {
  needsOntologyId = true;
  meta = {
    id: "monarch" as const,
    name: "Monarch Initiative (v3)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Disease identity & cross-references", "Curated causal genes (with knowledge source)", "Cross-species disease models", "Association counts"],
    homepage: "https://monarchinitiative.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const id = ctx.disease.ontology_id!.replace("_", ":");
    if (!id.startsWith("MONDO:")) return { records: [], links: [], totals: {}, notes: ["Monarch is queried for MONDO diseases only."] };
    const at = ctx.now().toISOString();
    const [entity, causal, models] = await Promise.all([
      fetchJson<any>("Monarch", `${MONARCH_API}/entity/${id}`, {}, 5_000),
      fetchJson<{ total: number; items: any[] }>("Monarch", `${MONARCH_API}/association?object=${id}&category=biolink:CausalGeneToDiseaseAssociation&limit=20`, {}, 5_000).catch(() => null),
      fetchJson<{ total: number; items: any[] }>("Monarch", `${MONARCH_API}/association?object=${id}&category=biolink:GenotypeToDiseaseAssociation&limit=12`, {}, 5_000).catch(() => null),
    ]);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = `disease:${ctx.disease.ontology_id}`;
    const url = `https://monarchinitiative.org/${id}`;
    const prov = (source_id: string, native_type: string, u = url) => ({ provider: "monarch" as const, source_id, url: u, retrieved_at: at, native_type });
    const xrefs: string[] = entity.xref ?? [];
    const gard = xrefs.find((x) => x.startsWith("GARD:"));
    records.push({
      kind: "disease",
      key: dKey,
      label: entity.name,
      ids: { mondo: id, ...(gard ? { gard: gard.replace("GARD:", "").replace(/^0+/, "") } : {}), ...(xrefs.find((x) => x.startsWith("OMIM:")) ? { omim: xrefs.find((x) => x.startsWith("OMIM:")) } : {}) },
      synonyms: entity.exact_synonym ?? [],
      description: entity.description ?? undefined,
      provenance: [{ ...prov(id, "disease"), native_type: `disease; xrefs: ${xrefs.slice(0, 20).join(" ")}` }],
      review_status: "machine_assembled",
    });
    for (const a of causal?.items ?? []) {
      const sym = a.subject_label;
      const gKey = a.subject?.startsWith("HGNC:") ? `gene:hgnc:${a.subject}` : `gene:monarch:${a.subject}`;
      records.push({ kind: "gene", key: gKey, label: sym, ids: { ...(a.subject?.startsWith("HGNC:") ? { hgnc: a.subject } : {}), symbol: sym }, provenance: [prov(a.subject, "gene", `https://monarchinitiative.org/${a.subject}`)], review_status: "machine_assembled" });
      links.push(
        link({
          from: gKey,
          to: dKey,
          relation: "causal_gene",
          native_evidence_type: `${a.predicate} (${infores(a.primary_knowledge_source)})`,
          statement: `Monarch lists ${sym} as a causal gene for ${entity.name} (knowledge source: ${infores(a.primary_knowledge_source)}). A curated gene–disease relationship, not an individual's diagnosis.`,
          qualifiers: { knowledge_source: infores(a.primary_knowledge_source), predicate: a.predicate },
          provenance: [prov(a.id ?? `${a.subject}|${id}`, "causal_gene_to_disease")],
        }),
      );
    }
    for (const m of models?.items ?? []) {
      const mKey = `model:${m.subject}`;
      const label = String(m.subject_label ?? m.subject).replace(/<[^>]+>/g, "");
      records.push({ kind: "model", key: mKey, label, ids: { model: m.subject }, species: m.subject_taxon_label ?? "unspecified species", model_type: "genotype", disease_context: entity.name, provenance: [prov(m.subject, "genotype_to_disease", `https://monarchinitiative.org/${m.subject}`)], review_status: "machine_assembled" });
      links.push(
        link({
          from: mKey,
          to: dKey,
          relation: "model_of",
          native_evidence_type: `${m.predicate} (${infores(m.primary_knowledge_source)})`,
          statement: `${label} (${m.subject_taxon_label ?? "model organism"}) is recorded as a model of ${entity.name} by ${infores(m.primary_knowledge_source)}. Preclinical evidence; it does not establish human clinical relevance.`,
          qualifiers: { species: m.subject_taxon_label ?? "", knowledge_source: infores(m.primary_knowledge_source), ...(m.publications?.length ? { publications: m.publications.slice(0, 3).join(", ") } : {}) },
          provenance: [prov(m.id ?? m.subject, "genotype_to_disease")],
        }),
      );
    }
    const counts = Object.fromEntries((entity.association_counts ?? []).map((c: any) => [c.label, c.count]));
    return { records, links, totals: { monarch_causal_genes: causal?.total ?? 0, monarch_models: models?.total ?? 0, monarch_variant_associations: counts["Variant to Disease"] ?? 0 } };
  }
}
