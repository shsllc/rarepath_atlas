/**
 * HPO disease annotations (official JAX HPO API, from phenotype.hpoa) → phenotypes for the disease's
 * OMIM / ORPHA identifiers with frequency, onset, sex and references, kept verbatim. Phenotypes are never
 * reduced to a shared-term count; frequency, onset, evidence and NOT annotations stay attached.
 */
import { fetchJson } from "../fetch";
import { link, type DiseaseRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const HPO_API = "https://ontology.jax.org/api/network/annotation";

/** HPO onset terms (HP:0003674 subtree) → labels, so onset is readable without another call. */
export const ONSET_LABEL: Record<string, string> = {
  "HP:0030674": "Antenatal onset",
  "HP:0011460": "Embryonal onset",
  "HP:0011461": "Fetal onset",
  "HP:0003577": "Congenital onset",
  "HP:0003623": "Neonatal onset",
  "HP:0003593": "Infantile onset",
  "HP:0410280": "Pediatric onset",
  "HP:0011463": "Childhood onset",
  "HP:0003621": "Juvenile onset",
  "HP:0003581": "Adult onset",
  "HP:0011462": "Young adult onset",
  "HP:0025708": "Early young adult onset",
  "HP:0025709": "Intermediate young adult onset",
  "HP:0025710": "Late young adult onset",
  "HP:0003596": "Middle age onset",
  "HP:0003584": "Late onset",
};
/** HPO frequency terms → labels. Frequencies may also be n/m or percentages, kept as written. */
export const FREQUENCY_LABEL: Record<string, string> = {
  "HP:0040280": "Obligate (100%)",
  "HP:0040281": "Very frequent (99–80%)",
  "HP:0040282": "Frequent (79–30%)",
  "HP:0040283": "Occasional (29–5%)",
  "HP:0040284": "Very rare (<5–1%)",
  "HP:0040285": "Excluded (0%)",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export class HpoProvider implements ResearchProvider {
  dependsOn = ["orphadata" as const, "monarch" as const];
  meta = {
    id: "hpo" as const,
    name: "Human Phenotype Ontology annotations (JAX)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Disease → HPO term annotations", "Frequency", "Age of onset", "Sex", "References (PMID / OMIM / ORPHA)"],
    homepage: "https://hpo.jax.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    // Only identifiers already tied to this disease (ORPHA verified by Orphadata, OMIM from cross-references).
    const ds = ctx.upstream.filter((r): r is DiseaseRecord => r.kind === "disease" && r.key === dKey);
    const ids = [...new Set(ds.flatMap((d) => [d.ids.orphanet?.replace(/^Orphanet:/i, "ORPHA:"), d.ids.omim]).filter((x): x is string => !!x))].slice(0, 3);
    if (ids.length === 0) return { records: [], links: [], totals: {}, notes: ["No OMIM or verified ORPHA identifier to look up."] };
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const res = await Promise.allSettled(ids.map((id) => fetchJson<any>("HPO", `${HPO_API}/${id}`, {}, 4_500)));
    let n = 0;
    res.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const src = ids[i];
      for (const [aspect, list] of Object.entries(r.value.categories ?? {}) as [string, any[]][]) {
        for (const a of list) {
          n++;
          const md = a.metadata ?? {};
          const freq = FREQUENCY_LABEL[md.frequency] ?? (md.frequency || "");
          const onset = ONSET_LABEL[md.onset] ?? (md.onset || "");
          const pKey = `phenotype:${a.id}`;
          const url = `https://hpo.jax.org/browse/disease/${src}`;
          const prov = { provider: "hpo" as const, source_id: `${src}|${a.id}`, url, retrieved_at: at, native_type: `hpoa:${aspect}` };
          records.push({ kind: "phenotype", key: pKey, label: a.name, ids: { hpo: a.id }, provenance: [prov], review_status: "machine_assembled" });
          const excluded = md.frequency === "HP:0040285";
          links.push(
            link({
              from: dKey,
              to: pKey,
              relation: excluded ? "phenotype_excluded" : "has_phenotype",
              native_evidence_type: `hpoa:${src}`,
              statement: `${a.name} is annotated on ${src}${freq ? `, frequency ${freq}` : ""}${onset ? `, onset ${onset}` : ""} (HPO annotation).`,
              qualifiers: { source: src, aspect, ...(freq ? { frequency: freq } : {}), ...(onset ? { onset } : {}), ...(md.sex ? { sex: md.sex } : {}), ...(md.sources?.length ? { references: md.sources.slice(0, 4).join(", ") } : {}) },
              provenance: [prov],
            }),
          );
        }
      }
    });
    return { records, links, totals: { hpo_annotations: n } };
  }
}
