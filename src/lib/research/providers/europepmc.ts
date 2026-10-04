/** Europe PMC REST → papers (PMID/PMCID/DOI), abstracts, publication status, authors (ORCID), grants, open-access full text. */
import { SourceRecord } from "@/lib/schemas";
import { fetchJson, normDoi, normOrcid, ProviderError } from "../fetch";
import { link, type PaperRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const EPMC_API = "https://www.ebi.ac.uk/europepmc/webservices/rest";

/* eslint-disable @typescript-eslint/no-explicit-any */
type EpmcResult = any;

export function paperKey(ids: { doi?: string; pmid?: string; pmcid?: string }, fallback: string) {
  return ids.doi ? `paper:doi:${ids.doi}` : ids.pmid ? `paper:pmid:${ids.pmid}` : ids.pmcid ? `paper:pmcid:${ids.pmcid}` : `paper:${fallback}`;
}

/** Preprints are never peer reviewed: source PPR or a "preprint" publication type. */
export function epmcPublicationStatus(r: EpmcResult): PaperRecord["publication_status"] {
  const types: string[] = r.pubTypeList?.pubType ?? [];
  if (r.source === "PPR" || types.some((t) => /preprint/i.test(t))) return "preprint";
  if (r.source === "MED" || r.source === "PMC") return "peer_reviewed";
  return "unknown";
}

export class EuropePmcProvider implements ResearchProvider {
  meta = {
    id: "europepmc" as const,
    name: "Europe PMC",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Papers (PMID / PMCID / DOI)", "Abstracts", "Publication status (preprint flagged)", "Authors & ORCID", "Affiliations", "Grants", "Open-access full text"],
    homepage: "https://europepmc.org",
  };

  private search(q: string, size: number) {
    return fetchJson<{ hitCount: number; resultList: { result: EpmcResult[] } }>("Europe PMC", `${EPMC_API}/search?query=${encodeURIComponent(q)}&resultType=core&pageSize=${size}&format=json`, {}, 5_000);
  }

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const term = `"${ctx.disease.label.replace(/"/g, "")}"`;
    const [rel, cited, recent] = await Promise.all([this.search(term, 8), this.search(`${term} sort_cited:y`, 4).catch(() => null), this.search(`${term} sort_date:y`, 5).catch(() => null)]);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    const seen = new Set<string>();
    const add = (r: EpmcResult, bucket: "relevance" | "cited" | "recent") => {
      const ids = { doi: normDoi(r.doi), pmid: r.pmid as string | undefined, pmcid: r.pmcid as string | undefined };
      const key = paperKey(ids, `epmc:${r.source}:${r.id}`);
      const url = ids.pmid ? `https://europepmc.org/article/MED/${ids.pmid}` : `https://europepmc.org/article/${r.source}/${r.id}`;
      const prov = { provider: "europepmc" as const, source_id: `${r.source}:${r.id}`, url, retrieved_at: at, native_type: (r.pubTypeList?.pubType ?? [r.source]).join("; ") };
      if (!seen.has(key)) {
        seen.add(key);
        const authors = (r.authorList?.author ?? []) as any[];
        const fullTextOA = r.isOpenAccess === "Y" && r.inEPMC === "Y" && !!ids.pmcid;
        records.push({
          kind: "paper",
          key,
          label: String(r.title ?? "").replace(/<[^>]+>/g, "").replace(/\.$/, ""),
          ids: Object.fromEntries(Object.entries(ids).filter(([, v]) => v)) as PaperRecord["ids"],
          year: r.pubYear ? Number(r.pubYear) : undefined,
          venue: r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher,
          publication_status: epmcPublicationStatus(r),
          publication_types: r.pubTypeList?.pubType ?? [],
          open_access: r.isOpenAccess === "Y",
          full_text_available: fullTextOA,
          full_text_url: fullTextOA ? `${EPMC_API}/${ids.pmcid}/fullTextXML` : undefined,
          cited_by_count: typeof r.citedByCount === "number" ? r.citedByCount : undefined,
          abstract: r.abstractText ? String(r.abstractText).replace(/<[^>]+>/g, "").slice(0, 600) : undefined,
          authors: authors.map((a) => a.fullName).filter(Boolean).slice(0, 12),
          update_notices: [],
          provenance: [prov],
          review_status: "machine_assembled",
        });
        links.push(link({ from: key, to: dKey, relation: "mentions_disease", native_evidence_type: `search:${bucket}`, statement: `Europe PMC returns this record for the search ${term}.`, discovery_lead: true, provenance: [prov] }));
        // Authors become person records only with an ORCID; others stay as names on the paper (no name-only identity).
        for (const a of authors.slice(0, 12)) {
          const orcid = a.authorId?.type === "ORCID" ? normOrcid(a.authorId.value) : undefined;
          if (!orcid) continue;
          const pKey = `person:orcid:${orcid}`;
          const aff = (a.authorAffiliationDetailsList?.authorAffiliation ?? []).map((x: any) => x.affiliation).filter(Boolean).slice(0, 2);
          records.push({ kind: "person", key: pKey, label: a.fullName, ids: { orcid }, affiliations: aff, roles: [], provenance: [prov], review_status: "machine_assembled" });
          links.push(link({ from: pKey, to: key, relation: "authored", native_evidence_type: "author_list", statement: `${a.fullName} (ORCID ${orcid}) is listed as an author.`, provenance: [prov] }));
        }
        for (const g of (r.grantsList?.grant ?? []) as any[]) {
          if (!g.agency) continue;
          const gKey = g.grantId ? `grant:${g.agency.toLowerCase()}:${g.grantId}` : `grant:${g.agency.toLowerCase()}`;
          records.push({ kind: "grant", key: gKey, label: g.grantId ? `${g.agency} ${g.grantId}` : g.agency, ids: g.grantId ? { grant: g.grantId } : {}, funder: g.agency, provenance: [prov], review_status: "machine_assembled" });
          links.push(link({ from: key, to: gKey, relation: "funded_by", native_evidence_type: "grant_list", statement: `Funding acknowledged: ${g.agency}${g.grantId ? ` ${g.grantId}` : ""}.`, provenance: [prov] }));
        }
      }
    };
    for (const r of rel.resultList?.result ?? []) add(r, "relevance");
    for (const r of cited?.resultList?.result ?? []) add(r, "cited");
    for (const r of recent?.resultList?.result ?? []) add(r, "recent");
    return {
      records,
      links,
      totals: { papers: rel.hitCount ?? 0 },
      notes: [...(cited ? [] : ["Most-cited query did not return."]), ...(recent ? [] : ["Recent-papers query did not return."])],
    };
  }

  /** Open-access full text as a SourceRecord for the OpenAI Evidence Extractor (offline pipeline). */
  async fetchFullText(pmcid: string): Promise<SourceRecord> {
    const res = await fetch(`${EPMC_API}/${pmcid}/fullTextXML`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new ProviderError("Europe PMC", "http", String(res.status));
    const xml = await res.text();
    const body = /<body[\s\S]*?<\/body>/i.exec(xml)?.[0] ?? xml;
    const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return SourceRecord.parse({
      id: `epmc:${pmcid}`,
      kind: "pmc_excerpt",
      title: /<article-title>([\s\S]*?)<\/article-title>/i.exec(xml)?.[1]?.replace(/<[^>]+>/g, "") ?? pmcid,
      url: `https://europepmc.org/article/PMC/${pmcid}`,
      retrieval_date: new Date().toISOString().slice(0, 10),
      retrieved_via: "Europe PMC fullTextXML",
      text,
      citation: { pmcid },
      license_note: "Europe PMC open-access subset; check the article licence before reuse.",
    });
  }
}
