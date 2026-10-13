/**
 * NIH RePORTER (public-domain US government data, keyless API) → funded research projects that mention
 * the disease in their title, terms or abstract, with principal investigators and awardee organisations.
 * A text match is a navigation lead: it does not mean the project studies the disease directly.
 */
import { fetchJson } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const REPORTER_API = "https://api.reporter.nih.gov/v2/projects/search";

export class NihReporterProvider implements ResearchProvider {
  meta = {
    id: "nihreporter" as const,
    name: "NIH RePORTER",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Funded projects", "Principal investigators", "Awardee organisations", "Fiscal year and award amount"],
    homepage: "https://reporter.nih.gov",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const label = ctx.disease.label.replace(/"/g, "");
    const year = ctx.now().getUTCFullYear();
    const body = {
      criteria: {
        advanced_text_search: { operator: "and", search_field: "projecttitle,terms,abstracttext", search_text: `"${label}"` },
        fiscal_years: [year - 4, year - 3, year - 2, year - 1, year],
      },
      include_fields: ["ApplId", "ProjectNum", "CoreProjectNum", "ProjectTitle", "FiscalYear", "AwardAmount", "Organization", "PrincipalInvestigators", "AgencyIcAdmin", "ProjectStartDate", "ProjectEndDate", "ProjectDetailUrl"],
      offset: 0,
      limit: 25,
      sort_field: "fiscal_year",
      sort_order: "desc",
    };
    const res = await fetchJson<any>("NIH RePORTER", REPORTER_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 6_000);
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const seen = new Set<string>();
    // Results are newest first; keep the latest fiscal year of each core project.
    for (const p of (res.results ?? []) as any[]) {
      const core: string | undefined = p.core_project_num ?? p.project_num;
      if (!core || seen.has(core) || seen.size >= 12) continue;
      seen.add(core);
      const key = `grant:nih:${core}`;
      const url = p.project_detail_url || `https://reporter.nih.gov/project-details/${p.appl_id}`;
      const ic = p.agency_ic_admin?.abbreviation;
      const prov = { provider: "nihreporter" as const, source_id: String(p.appl_id ?? core), url, retrieved_at: at, native_type: "NIH-funded project" };
      const org = p.organization ?? {};
      const pis = ((p.principal_investigators ?? []) as any[]).filter((x) => x.full_name);
      records.push({
        kind: "grant",
        key,
        label: String(p.project_title ?? core).trim(),
        ids: { grant: core },
        funder: ic ? `NIH ${ic}` : "NIH",
        fiscal_year: typeof p.fiscal_year === "number" ? p.fiscal_year : undefined,
        award_amount: typeof p.award_amount === "number" ? p.award_amount : undefined,
        start_date: p.project_start_date?.slice(0, 10),
        end_date: p.project_end_date?.slice(0, 10),
        institution: [org.org_name, org.org_city, org.org_state ?? org.org_country].filter(Boolean).join(", ") || undefined,
        investigators: pis.map((x) => String(x.full_name).trim()),
        provenance: [prov],
        review_status: "machine_assembled",
      });
      links.push(link({ from: key, to: dKey, relation: "mentions_disease", native_evidence_type: "search:funded_project", statement: `NIH RePORTER returns this funded project for "${label}" in its title, terms or abstract.`, discovery_lead: true, provenance: [prov] }));
      for (const pi of pis) {
        if (!pi.profile_id) continue;
        const pKey = `person:nih:${pi.profile_id}`;
        records.push({ kind: "person", key: pKey, label: String(pi.full_name).trim(), ids: {}, affiliations: org.org_name ? [org.org_name] : [], roles: [pi.is_contact_pi ? "Contact principal investigator (NIH)" : "Principal investigator (NIH)"], provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: pKey, to: key, relation: "investigator_on", native_evidence_type: "principal_investigator", statement: `${String(pi.full_name).trim()} is listed as a principal investigator on ${core}.`, provenance: [prov] }));
      }
    }
    return { records, links, totals: { nih_projects: Number(res.meta?.total ?? 0) } };
  }
}
