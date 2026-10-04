/**
 * Alliance of Genome Resources → orthologs of the disease's causal gene and the experimental disease
 * models annotated to those model-organism genes. PRECLINICAL / MODEL-ORGANISM DISCOVERY only: a model
 * never implies human clinical relevance.
 */
import { fetchJson } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const ALLIANCE_API = "https://www.alliancegenome.org/api";
const MODEL_SPECIES = /^(MGI|ZFIN|RGD|FB|WB):/;

/* eslint-disable @typescript-eslint/no-explicit-any */
export class AllianceProvider implements ResearchProvider {
  dependsOn = ["monarch" as const, "clingen" as const];
  meta = {
    id: "alliance" as const,
    name: "Alliance of Genome Resources",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Orthologs (with confidence)", "Experimental disease models (mouse, zebrafish, rat, fly, worm)", "Model phenotypes"],
    homepage: "https://www.alliancegenome.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const hgnc = ctx.upstream.find((r) => r.kind === "gene" && r.ids.hgnc)?.ids.hgnc;
    if (!hgnc) return { records: [], links: [], totals: {}, notes: ["No HGNC-identified causal gene to look up."] };
    const human = ctx.upstream.find((r) => r.kind === "gene" && r.ids.hgnc === hgnc)!;
    const orth = await fetchJson<{ total: number; results: any[] }>("Alliance", `${ALLIANCE_API}/gene/${hgnc}/orthologs?limit=20`, {}, 4_500);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const hKey = `gene:hgnc:${hgnc}`;
    const orthologs = (orth.results ?? [])
      .map((r) => r.geneToGeneOrthologyGenerated)
      .filter((g) => g?.objectGene?.primaryExternalId)
      .map((g) => ({ id: g.objectGene.primaryExternalId as string, symbol: g.objectGene.geneSymbol?.displayText as string, taxon: g.objectGene.taxon?.name as string, best: g.isBestScore?.name === "Yes", confidence: (g.confidence?.name as string) ?? "" }));
    for (const o of orthologs) {
      const oKey = `gene:alliance:${o.id}`;
      records.push({ kind: "gene", key: oKey, label: o.symbol, taxon: o.taxon, ids: { symbol: `${o.symbol} (${o.taxon})` }, provenance: [{ provider: "alliance", source_id: o.id, url: `https://www.alliancegenome.org/gene/${o.id}`, retrieved_at: at, native_type: "ortholog" }], review_status: "machine_assembled" });
      links.push(link({ from: oKey, to: hKey, relation: "ortholog_of", native_evidence_type: `orthology:${o.confidence}${o.best ? ":best" : ""}`, statement: `${o.symbol} (${o.taxon}) is an ortholog of human ${human.label} (Alliance, confidence: ${o.confidence || "not stated"}${o.best ? ", best score" : ""}).`, qualifiers: { species: o.taxon, confidence: o.confidence }, provenance: [{ provider: "alliance", source_id: `${hgnc}|${o.id}`, url: `https://www.alliancegenome.org/gene/${hgnc}`, retrieved_at: at, native_type: "orthology" }] }));
    }
    // Disease models for the best-scoring mouse and zebrafish orthologs.
    const targets = ["Mus musculus", "Danio rerio"].map((sp) => orthologs.find((o) => o.taxon === sp && o.best) ?? orthologs.find((o) => o.taxon === sp)).filter((o): o is (typeof orthologs)[number] => !!o && MODEL_SPECIES.test(o.id));
    let modelTotal = 0;
    const res = await Promise.allSettled(targets.map((t) => fetchJson<{ total: number; results: any[] }>("Alliance", `${ALLIANCE_API}/gene/${t.id}/models?limit=6`, {}, 4_500)));
    res.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const t = targets[i];
      modelTotal += r.value.total ?? 0;
      for (const m of r.value.results ?? []) {
        const id: string | undefined = m.model?.primaryExternalId;
        if (!id) continue;
        const name = String(m.model?.name?.displayText ?? m.model?.name ?? id).replace(/<[^>]+>/g, "");
        const ctxs = (m.diseaseModels ?? []).map((d: any) => `${(d.associationType ?? "").replace(/_/g, " ").toLowerCase()} ${d.diseaseModel ?? ""}`.trim()).filter(Boolean);
        const mKey = `model:${id}`;
        const url = `https://www.alliancegenome.org/gene/${t.id}`;
        records.push({ kind: "model", key: mKey, label: name, ids: { model: id }, species: t.taxon, model_type: "affected genomic model", disease_context: ctxs.join("; ") || undefined, provenance: [{ provider: "alliance", source_id: id, url, retrieved_at: at, native_type: "affected_genomic_model" }], review_status: "machine_assembled" });
        links.push(link({ from: mKey, to: `gene:alliance:${t.id}`, relation: "model_of", native_evidence_type: "affected_genomic_model", statement: `${name} (${t.taxon}) is an experimental model involving ${t.symbol}${ctxs.length ? `; annotated as ${ctxs.slice(0, 2).join("; ")}` : ""}. Preclinical: does not establish human clinical relevance.`, qualifiers: { species: t.taxon, ...(ctxs.length ? { disease_context: ctxs.slice(0, 3).join("; ") } : {}) }, provenance: [{ provider: "alliance", source_id: id, url, retrieved_at: at, native_type: "affected_genomic_model" }] }));
      }
    });
    return { records, links, totals: { orthologs: orth.total ?? orthologs.length, model_organism_models: modelTotal } };
  }
}
