/**
 * OpenAlex → scholarly network around the disease literature: authors (ORCID), institutions (ROR),
 * funders, venues, citing and referenced works, and an identified author's other research.
 *
 * Keyless access has a small daily budget, so this provider makes at most three calls per disease
 * and is cached upstream. Topic similarity is never used as biomedical equivalence.
 */
import { contactEmail, fetchJson, normDoi, normOrcid, normRor } from "../fetch";
import type { PaperRecord, ProviderContext, ProviderResult, ResearchLink, ResearchProvider, ResearchRecord } from "../types";
import { link } from "../types";
import { paperKey } from "./europepmc";

export const OPENALEX_API = "https://api.openalex.org";
const SELECT = "id,doi,title,publication_year,ids,authorships,cited_by_count,referenced_works,primary_location,funders,type";

/* eslint-disable @typescript-eslint/no-explicit-any */
const short = (id: string) => id.replace("https://openalex.org/", "");
const qs = () => {
  const p = new URLSearchParams();
  if (contactEmail()) p.set("mailto", contactEmail());
  if (process.env.OPENALEX_API_KEY) p.set("api_key", process.env.OPENALEX_API_KEY);
  return p.toString();
};

function workIds(w: any) {
  return {
    doi: normDoi(w.doi ?? w.ids?.doi),
    pmid: w.ids?.pmid ? String(w.ids.pmid).replace(/\D/g, "") : undefined,
    pmcid: w.ids?.pmcid ? String(w.ids.pmcid).replace(/^.*\/(PMC\d+).*$/i, "$1").toUpperCase() : undefined,
    openalex: short(w.id),
  };
}

export class OpenAlexProvider implements ResearchProvider {
  dependsOn = ["europepmc" as const];
  meta = {
    id: "openalex" as const,
    name: "OpenAlex",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Works & citation counts", "Citing / referenced works", "Authors (ORCID)", "Institutions (ROR)", "Funders", "Venues"],
    homepage: "https://openalex.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    // Most-cited first so the citation neighbourhood grows from an established paper.
    const dois = ctx.upstream
      .filter((r): r is PaperRecord => r.kind === "paper" && !!r.ids.doi)
      .sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
      .slice(0, 8)
      .map((r) => r.ids.doi!);
    if (dois.length === 0) return { records: [], links: [], totals: {}, notes: ["No DOIs from the literature search to expand."] };

    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const works = await fetchJson<{ results: any[] }>("OpenAlex", `${OPENALEX_API}/works?filter=doi:${dois.map(encodeURIComponent).join("|")}&per-page=8&select=${SELECT}&${qs()}`, {}, 5_000);

    const addWork = (w: any, native: string): string => {
      const ids = workIds(w);
      const key = paperKey(ids, `openalex:${ids.openalex}`);
      const prov = { provider: "openalex" as const, source_id: ids.openalex, url: `https://openalex.org/${ids.openalex}`, retrieved_at: at, native_type: native };
      records.push({
        kind: "paper",
        key,
        label: w.title ?? ids.openalex,
        ids: Object.fromEntries(Object.entries(ids).filter(([, v]) => v)) as PaperRecord["ids"],
        year: w.publication_year ?? undefined,
        venue: w.primary_location?.source?.display_name ?? undefined,
        // OpenAlex "type" does not establish peer review, so it never upgrades status.
        publication_status: w.type === "preprint" ? "preprint" : "unknown",
        publication_types: w.type ? [w.type] : [],
        cited_by_count: w.cited_by_count ?? undefined,
        authors: (w.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean).slice(0, 12),
        update_notices: [],
        provenance: [prov],
        review_status: "machine_assembled",
      });
      return key;
    };

    let seed: any = null;
    for (const w of works.results ?? []) {
      const key = addWork(w, w.type ?? "work");
      const prov = { provider: "openalex" as const, source_id: short(w.id), url: `https://openalex.org/${short(w.id)}`, retrieved_at: at, native_type: "authorship" };
      for (const a of (w.authorships ?? []).slice(0, 12)) {
        const orcid = normOrcid(a.author?.orcid);
        // Identity only via ORCID; an OpenAlex author id alone is kept as an id but never merged by name.
        const pKey = orcid ? `person:orcid:${orcid}` : `person:openalex:${short(a.author?.id ?? "")}`;
        if (!a.author?.id) continue;
        const insts = (a.institutions ?? []).filter((i: any) => i.ror);
        records.push({ kind: "person", key: pKey, label: a.author.display_name, ids: { ...(orcid ? { orcid } : {}), openalex: short(a.author.id) }, affiliations: (a.institutions ?? []).map((i: any) => i.display_name).slice(0, 2), roles: [], provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: pKey, to: key, relation: "authored", native_evidence_type: "authorship", statement: `${a.author.display_name} is an author (OpenAlex authorship).`, provenance: [prov] }));
        for (const i of insts) {
          const ror = normRor(i.ror)!;
          const iKey = `institution:ror:${ror}`;
          records.push({ kind: "institution", key: iKey, label: i.display_name, ids: { ror, openalex: short(i.id) }, country: i.country_code ?? undefined, provenance: [{ ...prov, native_type: "institution" }], review_status: "machine_assembled" });
          links.push(link({ from: pKey, to: iKey, relation: "affiliated_with", native_evidence_type: "authorship_institution", statement: `${a.author.display_name} listed ${i.display_name} (ROR ${ror}) on this work.`, provenance: [prov] }));
        }
      }
      for (const f of (w.funders ?? []).slice(0, 4)) {
        const gKey = `grant:funder:${short(f.id)}`;
        records.push({ kind: "grant", key: gKey, label: f.display_name, ids: f.ror ? { ror: normRor(f.ror)! } : {}, funder: f.display_name, provenance: [{ ...prov, native_type: "funder" }], review_status: "machine_assembled" });
        links.push(link({ from: key, to: gKey, relation: "funded_by", native_evidence_type: "funder", statement: `OpenAlex lists ${f.display_name} as a funder of this work.`, provenance: [prov] }));
      }
      if (!seed || (w.cited_by_count ?? 0) > (seed.cited_by_count ?? 0)) seed = w;
    }

    // Citation neighbourhood of the most-cited disease paper: who cites it, and what it cites.
    let citingTotal = 0;
    if (seed) {
      const seedKey = paperKey(workIds(seed), `openalex:${short(seed.id)}`);
      const refs = (seed.referenced_works ?? []).slice(0, 25).map(short);
      const [citing, referenced] = await Promise.all([
        fetchJson<{ meta: { count: number }; results: any[] }>("OpenAlex", `${OPENALEX_API}/works?filter=cites:${short(seed.id)}&sort=cited_by_count:desc&per-page=5&select=${SELECT}&${qs()}`, {}, 5_000).catch(() => null),
        refs.length
          ? fetchJson<{ results: any[] }>("OpenAlex", `${OPENALEX_API}/works?filter=openalex:${refs.join("|")}&sort=cited_by_count:desc&per-page=5&select=${SELECT}&${qs()}`, {}, 5_000).catch(() => null)
          : Promise.resolve(null),
      ]);
      citingTotal = citing?.meta?.count ?? 0;
      for (const w of citing?.results ?? []) {
        const k = addWork(w, "citing_work");
        links.push(link({ from: k, to: seedKey, relation: "cites", native_evidence_type: "cites", statement: `This work cites the seed paper (OpenAlex citation link). Citation is a navigation lead, not clinical similarity.`, discovery_lead: true, provenance: [{ provider: "openalex", source_id: short(w.id), url: `https://openalex.org/${short(w.id)}`, retrieved_at: at, native_type: "cites" }] }));
      }
      for (const w of referenced?.results ?? []) {
        const k = addWork(w, "referenced_work");
        links.push(link({ from: seedKey, to: k, relation: "cites", native_evidence_type: "references", statement: `The seed paper cites this work (OpenAlex reference list).`, discovery_lead: true, provenance: [{ provider: "openalex", source_id: short(seed.id), url: `https://openalex.org/${short(seed.id)}`, retrieved_at: at, native_type: "references" }] }));
      }
    }
    return { records, links, totals: { citing_works_of_seed: citingTotal } };
  }
}
