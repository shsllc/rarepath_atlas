/** PubMed (NCBI E-utilities) → papers by PMID, publication types (preprints flagged), journal, authors. Merged with Europe PMC by DOI / PMID. */
import { contactEmail, fetchJson, normDoi } from "../fetch";
import { link, type PaperRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";
import { EUTILS } from "./clinvar";
import { paperKey } from "./europepmc";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PubMed indexes some preprints (NIH Preprint Pilot); their publication type says so. */
export function pubmedStatus(pubtypes: string[]): PaperRecord["publication_status"] {
  if (pubtypes.some((t) => /preprint/i.test(t))) return "preprint";
  return pubtypes.length ? "peer_reviewed" : "unknown";
}

export class PubMedProvider implements ResearchProvider {
  meta = {
    id: "pubmed" as const,
    name: "PubMed (NCBI E-utilities)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Papers (PMID / PMCID / DOI)", "Publication types (preprints flagged)", "Journal", "Authors"],
    homepage: "https://pubmed.ncbi.nlm.nih.gov",
  };

  private params() {
    const p = new URLSearchParams({ tool: "rarepath-atlas", retmode: "json" });
    if (contactEmail()) p.set("email", contactEmail());
    if (process.env.NCBI_API_KEY) p.set("api_key", process.env.NCBI_API_KEY);
    return p.toString();
  }

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const label = ctx.disease.label.replace(/"/g, "");
    const term = `"${label}"[Title/Abstract]`;
    const s = await fetchJson<any>("PubMed", `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=8&sort=relevance&${this.params()}`, {}, 4_500);
    const ids: string[] = s.esearchresult?.idlist ?? [];
    const total = Number(s.esearchresult?.count ?? 0);
    if (ids.length === 0) return { records: [], links: [], totals: { pubmed_papers: total } };
    const sum = await fetchJson<any>("PubMed", `${EUTILS}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&${this.params()}`, {}, 4_500);
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    for (const uid of (sum.result?.uids ?? []) as string[]) {
      const r = sum.result[uid];
      if (!r || r.error) continue;
      const aid = (type: string) => (r.articleids ?? []).find((x: any) => x.idtype === type)?.value as string | undefined;
      const ids = { pmid: uid, doi: normDoi(aid("doi")), pmcid: aid("pmc") };
      const key = paperKey(ids, `pubmed:${uid}`);
      const pubtypes: string[] = r.pubtype ?? [];
      const prov = { provider: "pubmed" as const, source_id: uid, url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`, retrieved_at: at, native_type: pubtypes.join("; ") || "PubMed record" };
      const year = /^(\d{4})/.exec(String(r.pubdate ?? r.sortpubdate ?? ""))?.[1];
      records.push({
        kind: "paper",
        key,
        label: String(r.title ?? "").replace(/<[^>]+>/g, "").replace(/\.$/, ""),
        ids: Object.fromEntries(Object.entries(ids).filter(([, v]) => v)) as PaperRecord["ids"],
        year: year ? Number(year) : undefined,
        venue: r.fulljournalname || r.source || undefined,
        publication_status: pubmedStatus(pubtypes),
        publication_types: pubtypes,
        authors: ((r.authors ?? []) as any[]).map((a) => a.name).filter(Boolean).slice(0, 12),
        update_notices: [],
        provenance: [prov],
        review_status: "machine_assembled",
      });
      links.push(link({ from: key, to: dKey, relation: "mentions_disease", native_evidence_type: "search:relevance", statement: `PubMed returns this record for ${term}.`, discovery_lead: true, provenance: [prov] }));
    }
    return { records, links, totals: { pubmed_papers: total } };
  }
}
