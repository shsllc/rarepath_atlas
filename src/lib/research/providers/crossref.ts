/**
 * Crossref → DOI metadata resolver. Verifies title / venue / dates / ORCIDs / funders for DOIs found by
 * other providers and surfaces retraction, correction and update notices. It never creates biomedical claims.
 */
import { contactEmail, fetchJson, normDoi, normOrcid } from "../fetch";
import { link, type PaperRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const CROSSREF_API = "https://api.crossref.org";

/* eslint-disable @typescript-eslint/no-explicit-any */
export class CrossrefProvider implements ResearchProvider {
  dependsOn = ["europepmc" as const];
  meta = {
    id: "crossref" as const,
    name: "Crossref",
    role: "metadata" as const,
    mode: "live" as const,
    data_types: ["DOI metadata verification", "Venue & dates", "ORCIDs deposited by publishers", "Funders", "Retraction / correction notices"],
    homepage: "https://www.crossref.org",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const papers = ctx.upstream.filter((r): r is PaperRecord => r.kind === "paper" && !!r.ids.doi).slice(0, 5);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    let verified = 0;
    let notices = 0;
    const mail = contactEmail() ? `?mailto=${encodeURIComponent(contactEmail())}` : "";
    const results = await Promise.allSettled(papers.map((p) => fetchJson<{ message: any }>("Crossref", `${CROSSREF_API}/works/${encodeURIComponent(p.ids.doi!)}${mail}`, {}, 4_000)));
    results.forEach((res, i) => {
      if (res.status !== "fulfilled") return;
      const m = res.value.message;
      const doi = normDoi(m.DOI);
      if (doi !== papers[i].ids.doi) return; // only verify an exact DOI match
      verified++;
      const updates: string[] = [
        ...(m["update-to"] ?? []).map((u: any) => `This record is a ${u.type ?? "update"} notice for ${u.DOI}`),
        ...(m["updated-by"] ?? []).map((u: any) => `Updated by a ${u.type ?? "notice"} (${u.DOI})`),
        ...Object.keys(m.relation ?? {})
          .filter((k) => /retract|correct|erratum/i.test(k))
          .map((k) => `Crossref relation: ${k}`),
      ];
      notices += updates.length;
      const date = m.published?.["date-parts"]?.[0];
      const prov = { provider: "crossref" as const, source_id: doi!, url: `https://doi.org/${doi}`, retrieved_at: at, native_type: m.type ?? "work" };
      records.push({
        kind: "paper",
        key: papers[i].key,
        label: (m.title?.[0] as string) ?? papers[i].label,
        ids: { doi },
        year: date?.[0],
        venue: m["container-title"]?.[0],
        publication_status: m.type === "posted-content" ? "preprint" : "unknown",
        publication_types: m.type ? [m.type] : [],
        authors: (m.author ?? []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).slice(0, 12),
        metadata_verified_by: "crossref",
        update_notices: updates,
        provenance: [prov],
        review_status: "machine_assembled",
      });
      for (const a of m.author ?? []) {
        const orcid = normOrcid(a.ORCID);
        if (!orcid) continue;
        const name = [a.given, a.family].filter(Boolean).join(" ");
        records.push({ kind: "person", key: `person:orcid:${orcid}`, label: name, ids: { orcid }, affiliations: (a.affiliation ?? []).map((x: any) => x.name).slice(0, 2), roles: [], provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: `person:orcid:${orcid}`, to: papers[i].key, relation: "authored", native_evidence_type: "crossref_author", statement: `${name} (ORCID ${orcid}) is deposited as an author with Crossref.`, provenance: [prov] }));
      }
      for (const f of (m.funder ?? []).slice(0, 4)) {
        if (!f.name) continue;
        const gKey = f.DOI ? `grant:fundref:${f.DOI}` : `grant:${String(f.name).toLowerCase()}`;
        records.push({ kind: "grant", key: gKey, label: f.name, ids: {}, funder: f.name, provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: papers[i].key, to: gKey, relation: "funded_by", native_evidence_type: "crossref_funder", statement: `Crossref funder metadata: ${f.name}${f.award?.length ? ` (${f.award.join(", ")})` : ""}.`, provenance: [prov] }));
      }
    });
    return { records, links, totals: { dois_verified: verified, update_notices: notices } };
  }
}
