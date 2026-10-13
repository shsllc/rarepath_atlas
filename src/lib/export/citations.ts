/**
 * BibTeX and RIS exports for a search. Reviewed sources (bundle papers and the sources of reviewed
 * relationships) come first; machine-assembled discovery papers follow and are tagged as such in a
 * note/keyword, so they are never mistaken for reviewed evidence in a reference manager.
 */
import type { SearchResponse } from "@/lib/schemas";
import { isReviewedEvidenceEdge } from "@/lib/graph-view";
import type { DiscoveryPreview, PaperView } from "@/lib/discovery";

export interface Citation {
  id: string;
  type: "article" | "preprint" | "web";
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  pmid?: string;
  url?: string;
  accessed?: string;
  tier: "reviewed" | "machine_assembled";
}

const fromPaperView = (p: PaperView): Citation => ({
  id: p.key,
  type: p.publication_status === "preprint" ? "preprint" : "article",
  title: p.label,
  authors: p.authors,
  year: p.year,
  journal: p.venue,
  doi: p.ids.doi,
  pmid: p.ids.pmid,
  url: p.url,
  tier: "machine_assembled",
});

function fromPreview(p: DiscoveryPreview): Citation[] {
  const l = p.literature;
  return [...l.top, ...l.most_cited, ...l.recent, ...l.preprints].map(fromPaperView);
}

export function citationsFor(r: SearchResponse): Citation[] {
  const out: Citation[] = [];
  if (("found" in r && r.found) || "partial" in r) {
    const nodes = r.nodes;
    for (const n of nodes)
      if (n.type === "Paper")
        out.push({ id: n.id, type: n.publication_status === "preprint" ? "preprint" : "article", title: n.label, authors: n.authors, year: n.year, journal: n.journal, doi: n.doi, pmid: n.pmid, url: n.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${n.pmid}/` : n.doi ? `https://doi.org/${n.doi}` : undefined, tier: "reviewed" });
    for (const e of r.edges.filter(isReviewedEvidenceEdge))
      for (const ev of e.evidence)
        out.push({ id: `src:${ev.source_url}`, type: ev.citation?.pmid || ev.citation?.doi ? "article" : "web", title: ev.source, authors: [], pmid: ev.citation?.pmid, doi: ev.citation?.doi, url: ev.source_url, accessed: ev.retrieval_date, tier: "reviewed" });
    if ("partial" in r && r.preview) out.push(...fromPreview(r.preview));
  } else if ("discovery" in r) out.push(...fromPreview(r.preview));

  // One entry per work: DOI, then PMID, then URL. A reviewed entry wins over a discovery one.
  const seen = new Map<string, Citation>();
  const keyOf = (c: Citation) => (c.doi ? `doi:${c.doi.toLowerCase()}` : c.pmid ? `pmid:${c.pmid}` : `url:${c.url ?? c.id}`);
  for (const c of out) {
    const k = keyOf(c);
    const prev = seen.get(k);
    if (!prev) seen.set(k, c);
    else if (prev.tier === "machine_assembled" && c.tier === "reviewed") seen.set(k, { ...c, title: c.type === "web" ? prev.title : c.title, authors: c.authors.length ? c.authors : prev.authors, year: c.year ?? prev.year, journal: c.journal ?? prev.journal });
    else if (prev.type === "web" && c.type !== "web" && prev.tier === c.tier) seen.set(k, { ...c, accessed: prev.accessed });
  }
  return [...seen.values()];
}

const NOTE = (c: Citation) => (c.tier === "reviewed" ? "RarePath Atlas: reviewed evidence" : "RarePath Atlas: machine-assembled discovery, not reviewed");
const bibEsc = (s: string) => s.replace(/[\\{}]/g, "").replace(/[&%$#_]/g, (m) => `\\${m}`);

function bibKey(c: Citation, used: Set<string>) {
  const surname = (c.authors[0] ?? c.journal ?? "source").split(/[\s,]+/)[0].normalize("NFKD").replace(/[^A-Za-z]/g, "") || "source";
  const base = `${surname.toLowerCase()}${c.year ?? ""}`;
  let k = base;
  for (let i = 0; used.has(k); i++) k = `${base}${String.fromCharCode(97 + (i % 26))}${i >= 26 ? i : ""}`;
  used.add(k);
  return k;
}

export function toBibTeX(cs: Citation[]): string {
  const used = new Set<string>();
  return cs
    .map((c) => {
      const kind = c.type === "article" ? "article" : "misc";
      const f: [string, string | undefined][] = [
        ["title", c.title],
        ["author", c.authors.length ? c.authors.join(" and ") : undefined],
        ["journal", c.type === "article" ? c.journal : undefined],
        ["howpublished", c.type !== "article" ? (c.type === "preprint" ? `Preprint${c.journal ? `, ${c.journal}` : ""}` : undefined) : undefined],
        ["year", c.year ? String(c.year) : undefined],
        ["doi", c.doi],
        ["pmid", c.pmid],
        ["url", c.url],
        ["urldate", c.accessed],
        ["note", `${c.type === "preprint" ? "Not peer reviewed. " : ""}${NOTE(c)}`],
      ];
      const body = f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${k === "url" || k === "doi" ? v!.replace(/[{}]/g, "") : bibEsc(v!)}}`);
      return `@${kind}{${bibKey(c, used)},\n${body.join(",\n")}\n}`;
    })
    .join("\n\n");
}

export function toRIS(cs: Citation[]): string {
  return cs
    .map((c) => {
      const lines = [`TY  - ${c.type === "article" ? "JOUR" : c.type === "preprint" ? "UNPB" : "ELEC"}`, `TI  - ${c.title}`];
      for (const a of c.authors) lines.push(`AU  - ${a}`);
      if (c.year) lines.push(`PY  - ${c.year}`);
      if (c.journal) lines.push(`${c.type === "article" ? "JO" : "PB"}  - ${c.journal}`);
      if (c.doi) lines.push(`DO  - ${c.doi}`);
      if (c.pmid) lines.push(`AN  - PMID:${c.pmid}`);
      if (c.url) lines.push(`UR  - ${c.url}`);
      if (c.accessed) lines.push(`Y2  - ${c.accessed}`);
      lines.push(`KW  - ${c.tier === "reviewed" ? "RarePath reviewed evidence" : "RarePath machine-assembled discovery"}`);
      if (c.type === "preprint") lines.push("KW  - preprint (not peer reviewed)");
      lines.push(`N1  - ${NOTE(c)}`, "ER  - ");
      return lines.join("\r\n");
    })
    .join("\r\n");
}
