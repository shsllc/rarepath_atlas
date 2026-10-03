import type { SourceRecord } from "@/lib/schemas";
import type { FundingResearchProvider } from "@/lib/services/interfaces";
import { normalizeText, politeFetch, today } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * NIH RePORTER API v2. No key required. A core project can have several
 * sub-projects per fiscal year, so selection is deterministic: records with an
 * abstract, then title matching `prefer`, then latest fiscal year, then lowest appl_id.
 */
export class NihReporterProvider implements FundingResearchProvider {
  async getProjectsByCoreNumber(coreProjectNum: string, prefer: RegExp = /natural history/i): Promise<SourceRecord | null> {
    const res = await politeFetch("https://api.reporter.nih.gov/v2/projects/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ criteria: { project_nums: [coreProjectNum] }, limit: 50, sort_field: "fiscal_year", sort_order: "desc" }),
    });
    const data = (await res.json()) as { results: any[] };
    if (!data.results?.length) return null;
    const hasAbstract = (r: any) => !!r.abstract_text && !/no abstract provided/i.test(r.abstract_text);
    const ranked = [...data.results].sort(
      (a, b) =>
        Number(hasAbstract(b)) - Number(hasAbstract(a)) ||
        Number(prefer.test(b.project_title ?? "")) - Number(prefer.test(a.project_title ?? "")) ||
        b.fiscal_year - a.fiscal_year ||
        a.appl_id - b.appl_id,
    );
    const p = ranked[0];
    const years = [...new Set(data.results.map((r) => r.fiscal_year))].sort();
    const text = [
      `Core project number: ${p.core_project_num}`,
      `Project title: ${normalizeText(p.project_title ?? "")}`,
      `Organization: ${p.organization?.org_name ?? ""}`,
      `Contact PI: ${p.contact_pi_name ?? ""}`,
      `Agency: ${p.agency_ic_admin?.name ?? ""}`,
      `Fiscal years in results: ${years.join(", ")}`,
      `Abstract: ${normalizeText(p.abstract_text ?? "")}`,
    ].join("\n");
    return {
      id: `reporter:${p.core_project_num}`,
      kind: "funding_record",
      title: `${p.core_project_num}: ${normalizeText(p.project_title ?? "")}`,
      url: `https://reporter.nih.gov/project-details/${p.appl_id}`,
      retrieval_date: today(),
      retrieved_via: "NIH RePORTER API v2 /projects/search",
      text,
      citation: {},
      authors: [],
      publication_types: [],
      meta: { appl_id: p.appl_id, fiscal_year: p.fiscal_year, fiscal_years: years, records_returned: data.results.length },
    };
  }
}
