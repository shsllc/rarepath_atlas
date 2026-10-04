/**
 * DataCite → DOI-backed research outputs beyond journal articles (datasets and collections):
 * creators (ORCID), affiliations (ROR), publisher/repository, subjects, funders, related identifiers.
 * Answers "what research asset already exists that another community may investigate or reuse?"
 */
import { fetchJson, normDoi, normName, normOrcid, normRor } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const DATACITE_API = "https://api.datacite.org";

/* eslint-disable @typescript-eslint/no-explicit-any */
export class DataCiteProvider implements ResearchProvider {
  meta = {
    id: "datacite" as const,
    name: "DataCite",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Datasets & collections (DOI)", "Repositories / publishers", "Creators (ORCID)", "Affiliations (ROR)", "Subjects", "Funders", "Related identifiers"],
    homepage: "https://datacite.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const q = `("${ctx.disease.label.replace(/"/g, "")}") AND types.resourceTypeGeneral:(Dataset OR Collection)`;
    const url = `${DATACITE_API}/dois?query=${encodeURIComponent(q)}&page[size]=12&affiliation=true`;
    const j = await fetchJson<{ data: any[]; meta?: { total?: number } }>("DataCite", url, {}, 5_000);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    // Repositories mint a DOI per version; keep one record per title + publisher.
    const seenTitle = new Set<string>();
    for (const d of j.data ?? []) {
      const a = d.attributes;
      const doi = normDoi(a.doi ?? d.id)!;
      const title: string = a.titles?.[0]?.title ?? doi;
      const dedupe = `${normName(title)}|${normName(a.publisher ?? "")}`;
      if (seenTitle.has(dedupe)) continue;
      seenTitle.add(dedupe);
      const key = `dataset:doi:${doi}`;
      const prov = { provider: "datacite" as const, source_id: doi, url: `https://doi.org/${doi}`, retrieved_at: at, native_type: a.types?.resourceTypeGeneral ?? "Dataset" };
      records.push({
        kind: "dataset",
        key,
        label: title,
        ids: { doi, datacite: doi },
        resource_type: a.types?.resourceTypeGeneral ?? "Dataset",
        publisher: typeof a.publisher === "string" ? a.publisher : a.publisher?.name,
        year: a.publicationYear ?? undefined,
        description: (a.descriptions?.find((x: any) => x.descriptionType === "Abstract")?.description ?? a.descriptions?.[0]?.description)?.replace(/<[^>]+>/g, "").slice(0, 400),
        subjects: (a.subjects ?? []).map((s: any) => s.subject).filter(Boolean).slice(0, 6),
        provenance: [prov],
        review_status: "machine_assembled",
      });
      links.push(link({ from: key, to: dKey, relation: "mentions_disease", native_evidence_type: "datacite_search", statement: `DataCite returns this ${a.types?.resourceTypeGeneral ?? "dataset"} for "${ctx.disease.label}". Reuse terms must be checked at the repository.`, discovery_lead: true, provenance: [prov] }));
      for (const c of (a.creators ?? []).slice(0, 8)) {
        const orcidId = (c.nameIdentifiers ?? []).find((n: any) => /orcid/i.test(n.nameIdentifierScheme ?? ""))?.nameIdentifier;
        const orcid = normOrcid(orcidId);
        if (!orcid) continue; // no name-only identities
        const pKey = `person:orcid:${orcid}`;
        records.push({ kind: "person", key: pKey, label: c.name, ids: { orcid }, affiliations: (c.affiliation ?? []).map((x: any) => (typeof x === "string" ? x : x.name)).filter(Boolean).slice(0, 2), roles: [], provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: pKey, to: key, relation: "authored", native_evidence_type: "datacite_creator", statement: `${c.name} (ORCID ${orcid}) is a creator of this research output.`, provenance: [prov] }));
        for (const af of c.affiliation ?? []) {
          const ror = typeof af === "object" && /ror\.org/.test(af.affiliationIdentifier ?? "") ? normRor(af.affiliationIdentifier) : undefined;
          if (!ror) continue;
          records.push({ kind: "institution", key: `institution:ror:${ror}`, label: af.name, ids: { ror }, provenance: [prov], review_status: "machine_assembled" });
          links.push(link({ from: pKey, to: `institution:ror:${ror}`, relation: "affiliated_with", native_evidence_type: "datacite_affiliation", statement: `${c.name} listed ${af.name} (ROR ${ror}).`, provenance: [prov] }));
        }
      }
      for (const f of (a.fundingReferences ?? []).slice(0, 3)) {
        if (!f.funderName) continue;
        const gKey = f.awardNumber ? `grant:${String(f.funderName).toLowerCase()}:${f.awardNumber}` : `grant:${String(f.funderName).toLowerCase()}`;
        records.push({ kind: "grant", key: gKey, label: f.awardNumber ? `${f.funderName} ${f.awardNumber}` : f.funderName, ids: f.awardNumber ? { grant: f.awardNumber } : {}, funder: f.funderName, provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: key, to: gKey, relation: "funded_by", native_evidence_type: "datacite_funding", statement: `DataCite funding reference: ${f.funderName}.`, provenance: [prov] }));
      }
    }
    return { records, links, totals: { datasets: j.meta?.total ?? records.filter((r) => r.kind === "dataset").length } };
  }
}
