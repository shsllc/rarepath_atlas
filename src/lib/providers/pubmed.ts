import type { SourceRecord } from "@/lib/schemas";
import type { LiteratureProvider } from "@/lib/services/interfaces";
import { getJson, getText, normalizeText, today } from "./http";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function ncbiParams(): string {
  const p = new URLSearchParams({ tool: "rarepath-atlas" });
  if (process.env.NCBI_EMAIL) p.set("email", process.env.NCBI_EMAIL);
  if (process.env.NCBI_API_KEY) p.set("api_key", process.env.NCBI_API_KEY);
  return p.toString();
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

interface ESummary {
  result: Record<string, { title: string; pubdate: string; source: string; authors: { name: string }[]; articleids: { idtype: string; value: string }[]; pubtype: string[] }> & { uids: string[] };
}

/** PubMed abstracts via E-utilities (esummary for metadata, efetch XML for the structured abstract). */
export class PubMedProvider implements LiteratureProvider {
  async fetchAbstracts(pmids: string[]): Promise<SourceRecord[]> {
    const ids = pmids.join(",");
    const summary = await getJson<ESummary>(`${EUTILS}/esummary.fcgi?db=pubmed&id=${ids}&retmode=json&${ncbiParams()}`);
    const xml = await getText(`${EUTILS}/efetch.fcgi?db=pubmed&id=${ids}&retmode=xml&${ncbiParams()}`);
    const articles = xml.split("<PubmedArticle>").slice(1);

    return pmids.map((pmid) => {
      const s = summary.result[pmid];
      if (!s) throw new Error(`PubMed returned no summary for PMID ${pmid}`);
      const art = articles.find((a) => new RegExp(`<PMID[^>]*>${pmid}</PMID>`).test(a));
      if (!art) throw new Error(`PubMed returned no record for PMID ${pmid}`);
      const parts = [...art.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((m) => {
        const label = /Label="([^"]+)"/.exec(m[1])?.[1];
        return normalizeText((label ? `${label}: ` : "") + decode(m[2]));
      });
      if (parts.length === 0) throw new Error(`No abstract for PMID ${pmid}`);
      // Author + first affiliation lines (public PubMed metadata) so collaborator links are quote-verifiable.
      // Contact details are stripped: no email addresses are ever stored.
      const authorLines = [...art.matchAll(/<Author[ >][\s\S]*?<\/Author>/g)].map((m) => {
        const a = m[0];
        const last = /<LastName>([\s\S]*?)<\/LastName>/.exec(a)?.[1];
        const ini = /<Initials>([\s\S]*?)<\/Initials>/.exec(a)?.[1];
        const coll = /<CollectiveName>([\s\S]*?)<\/CollectiveName>/.exec(a)?.[1];
        const aff = /<Affiliation>([\s\S]*?)<\/Affiliation>/.exec(a)?.[1];
        const name = coll ? decode(coll) : `${decode(last ?? "")} ${ini ?? ""}`.trim();
        const affClean = aff
          ? normalizeText(decode(aff).replace(/Electronic address:\s*\S+/gi, "").replace(/\S+@\S+/g, "")).replace(/[\s;,.]+$/, "")
          : "";
        return `Author: ${name}${affClean ? ` — ${affClean}` : ""}`;
      });
      parts.push(...authorLines);
      const id = (t: string) => s.articleids.find((a) => a.idtype === t)?.value;
      return {
        id: `pubmed:${pmid}`,
        kind: "pubmed_abstract",
        title: normalizeText(decode(s.title)),
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        retrieval_date: today(),
        retrieved_via: "NCBI E-utilities esummary + efetch (db=pubmed)",
        text: parts.join("\n"),
        citation: { pmid, pmcid: id("pmc"), doi: id("doi") },
        authors: s.authors.map((a) => a.name),
        pub_date: s.pubdate,
        journal: s.source,
        publication_types: s.pubtype,
        meta: {},
      } satisfies SourceRecord;
    });
  }

  /**
   * Selected sentences from PMC full text. Only proceeds when the PMC license
   * permits text mining or open reuse; never scrapes publisher sites.
   */
  async fetchPmcExcerpt(pmcid: string, pmid: string, sentenceFilter: (s: string) => boolean): Promise<SourceRecord | null> {
    const num = pmcid.replace(/^PMC/, "");
    const xml = await getText(`${EUTILS}/efetch.fcgi?db=pmc&id=${num}&${ncbiParams()}`);
    const license = normalizeText(decode(/<license[\s\S]*?<\/license>/.exec(xml)?.[0] ?? ""));
    if (!/text mining|creative commons|CC BY|open access/i.test(license)) return null;
    const body = /<body>([\s\S]*?)<\/body>/.exec(xml)?.[1] ?? "";
    const text = normalizeText(decode(body.replace(/<xref[^>]*>[\s\S]*?<\/xref>/g, "")));
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(sentenceFilter);
    if (sentences.length === 0) return null;
    const title = normalizeText(decode(/<article-title>([\s\S]*?)<\/article-title>/.exec(xml)?.[1] ?? pmcid));
    return {
      id: `pmc:${pmcid}`,
      kind: "pmc_excerpt",
      title: `${title} (selected full-text sentences)`,
      url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
      retrieval_date: today(),
      retrieved_via: "NCBI E-utilities efetch (db=pmc)",
      text: sentences.join("\n"),
      citation: { pmid, pmcid },
      authors: [],
      publication_types: [],
      license_note: `PMC license: "${license}" Only short excerpts are stored.`,
      meta: { sentence_count: sentences.length },
    };
  }
}
