/**
 * EU Clinical Trials Register (legacy EudraCT register, EMA) → EU/EEA trials authorised before CTIS, via the
 * register's own summary download (one page per search, cached upstream). Source acknowledged as EMA's terms
 * ask. The register is frozen for new trials since CTIS; CTIS itself has no documented public API and is not used.
 *
 * Each country's status is preserved separately (e.g. "GB: Completed; IT: Prematurely Ended").
 */
import { fetchText, normName } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord, type StudyRecord, type StudyStatusCategory } from "../types";

export const EUCTR_DOWNLOAD = "https://www.clinicaltrialsregister.eu/ctr-search/rest/download/summary";
export const EUCTR_ACK = "Source: EU Clinical Trials Register (European Medicines Agency), reproduced with acknowledgement.";

const COUNTRY: Record<string, string> = { AT: "Austria", BE: "Belgium", BG: "Bulgaria", CY: "Cyprus", CZ: "Czechia", DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain", FI: "Finland", FR: "France", GB: "United Kingdom", GR: "Greece", HR: "Croatia", HU: "Hungary", IE: "Ireland", IS: "Iceland", IT: "Italy", LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", MT: "Malta", NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal", RO: "Romania", SE: "Sweden", SI: "Slovenia", SK: "Slovakia" };

/** Overall family from per-country statuses: ongoing wins, then any early stop is a caution, then all-completed. */
export function euctrCategory(statuses: string[]): StudyStatusCategory {
  const s = statuses.map((x) => x.toLowerCase());
  if (s.some((x) => /ongoing|recruiting|authoris/.test(x) && !/not authoris/.test(x))) return "active";
  if (s.some((x) => /prematurely ended|temporarily halted|suspended|prohibited|not authoris|withdrawn/.test(x))) return "caution";
  if (s.length > 0 && s.every((x) => /completed/.test(x))) return "completed";
  return "unknown";
}

export function parseEuctrSummary(text: string): { fields: Record<string, string>; countryStatuses: { code: string; country: string; status: string }[] }[] {
  return text
    .split(/\n(?=EudraCT Number:)/)
    .map((chunk) => {
      const fields: Record<string, string> = {};
      let last = "";
      for (const line of chunk.split(/\r?\n/)) {
        const m = /^([A-Za-z][A-Za-z /]+?):\s+(.*)$/.exec(line);
        if (m) {
          last = m[1].trim();
          fields[last] = m[2].trim();
        } else if (last && line.trim()) fields[last] += ` ${line.trim()}`;
      }
      const tp = fields["Trial protocol"] ?? "";
      const countryStatuses = [...tp.matchAll(/([A-Z]{2})\(([^)]+)\)/g)].map((m) => ({ code: m[1], country: COUNTRY[m[1]] ?? m[1], status: m[2] }));
      if (!countryStatuses.length && /outside eu/i.test(tp)) countryStatuses.push({ code: "--", country: "Outside EU/EEA", status: "Outside EU/EEA (status not held by this register)" });
      return { fields, countryStatuses };
    })
    .filter((r) => r.fields["EudraCT Number"]);
}

export class EuCtrProvider implements ResearchProvider {
  meta = {
    id: "euctr" as const,
    name: "EU Clinical Trials Register (EudraCT)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["EU/EEA trials (EudraCT)", "Per-country status", "Sponsor & sponsor protocol number", "Condition (MedDRA)", "Population age & sex"],
    homepage: "https://www.clinicaltrialsregister.eu",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const url = `${EUCTR_DOWNLOAD}?query=${encodeURIComponent(ctx.disease.label)}&mode=current_page`;
    const text = await fetchText("EU CTR", url, "text/plain");
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    const rows = parseEuctrSummary(text);
    for (const { fields: f, countryStatuses } of rows) {
      const eudract = f["EudraCT Number"];
      const key = `study:eudract:${eudract}`;
      const recUrl = f["Link"] || `https://www.clinicaltrialsregister.eu/ctr-search/search?query=eudract_number:${eudract}`;
      const prov = { provider: "euctr" as const, source_id: eudract, url: recUrl, retrieved_at: at, native_type: "eudract_summary" };
      const sponsor = f["Sponsor Name"];
      const protocol = f["Sponsor Protocol Number"];
      const category = euctrCategory(countryStatuses.map((c) => c.status));
      const statusLabel = countryStatuses.length ? countryStatuses.map((c) => `${c.code === "--" ? c.country : c.code}: ${c.status}`).join("; ") : "Status not stated";
      const disease = /Term:\s*([^,]+)/.exec(f["Disease"] ?? "")?.[1]?.trim();
      const ids: StudyRecord["ids"] = { eudract, ...(protocol && sponsor ? { sponsor_protocol: `${normName(sponsor)}|${protocol}` } : {}) };
      records.push({
        kind: "study",
        key,
        label: f["Full Title"] ?? eudract,
        primary_registry: "EU CTR",
        ids,
        status: statusLabel,
        status_label: statusLabel,
        status_category: category,
        phases: [],
        design: {},
        conditions: [f["Medical condition"], disease].filter((x): x is string => !!x),
        interventions: [],
        intervention_details: [],
        outcomes: [],
        sponsor,
        collaborators: [],
        start_date: f["Start Date"],
        countries: countryStatuses.filter((c) => c.code !== "--").map((c) => c.country),
        locations: [],
        eligibility: { sex: f["Gender"], age_groups: (f["Population Age"] ?? "").split(/,\s*/).filter(Boolean) },
        has_results: false,
        documents: [],
        infrastructure: /natural[- ]history/i.test(f["Full Title"] ?? "") ? [{ flag: "natural_history", basis: "title states natural history" }] : /registry/i.test(f["Full Title"] ?? "") ? [{ flag: "registry", basis: "title states registry" }] : [],
        provenance: [prov],
        review_status: "machine_assembled",
      });
      links.push(link({ from: key, to: dKey, relation: "studies_condition", native_evidence_type: "condition_search:euctr", statement: `EudraCT ${eudract} is returned by the EU Clinical Trials Register search for "${ctx.disease.label}" (status by country: ${statusLabel}).`, provenance: [prov] }));
      if (sponsor) {
        const oKey = `organization:${normName(sponsor)}`;
        records.push({ kind: "organization", key: oKey, label: sponsor, ids: { orgname: normName(sponsor) }, provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: key, to: oKey, relation: "sponsored_by", native_evidence_type: "euctr_sponsor", statement: `${sponsor} is the sponsor of EudraCT ${eudract}. Sponsorship is not investigator participation.`, provenance: [prov] }));
      }
    }
    return { records, links, totals: { euctr_trials_first_page: rows.length }, notes: [EUCTR_ACK, "First results page only (legacy register; frozen for new trials since CTIS)."] };
  }
}
