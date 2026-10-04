/** ClinicalTrials.gov API v2 → condition-oriented studies with explicit status, phases, sponsors and listed officials. */
import { fetchJson } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord } from "../types";

export const CTGOV_API = "https://clinicaltrials.gov/api/v2/studies";

/** Every overallStatus kept distinct: completed ≠ terminated ≠ withdrawn ≠ recruiting. */
export const STUDY_STATUS_LABEL: Record<string, string> = {
  RECRUITING: "Recruiting",
  NOT_YET_RECRUITING: "Not yet recruiting",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  COMPLETED: "Completed",
  TERMINATED: "Terminated (stopped early)",
  WITHDRAWN: "Withdrawn (never enrolled)",
  SUSPENDED: "Suspended",
  UNKNOWN: "Unknown status (not verified recently)",
  AVAILABLE: "Expanded access: available",
  NO_LONGER_AVAILABLE: "Expanded access: no longer available",
  TEMPORARILY_NOT_AVAILABLE: "Expanded access: temporarily not available",
  APPROVED_FOR_MARKETING: "Approved for marketing",
  WITHHELD: "Withheld",
};

const FIELDS = [
  "NCTId",
  "BriefTitle",
  "OverallStatus",
  "Phase",
  "StudyType",
  "Condition",
  "InterventionName",
  "InterventionType",
  "LeadSponsorName",
  "CollaboratorName",
  "OverallOfficialName",
  "OverallOfficialAffiliation",
  "OverallOfficialRole",
  "StartDate",
  "CompletionDate",
  "LocationCountry",
  "EnrollmentCount",
].join(",");

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ClinicalTrialsProvider implements ResearchProvider {
  meta = {
    id: "clinicaltrials" as const,
    name: "ClinicalTrials.gov (API v2)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Studies (NCT)", "Explicit study status", "Phases", "Interventions", "Sponsors & collaborators", "Listed study officials", "Countries", "Dates"],
    homepage: "https://clinicaltrials.gov",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const url = `${CTGOV_API}?query.cond=${encodeURIComponent(ctx.disease.label)}&pageSize=12&countTotal=true&fields=${FIELDS}`;
    const j = await fetchJson<{ totalCount?: number; studies?: { protocolSection: any }[] }>("ClinicalTrials.gov", url, {}, 5_000);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    for (const s of j.studies ?? []) {
      const ps = s.protocolSection;
      const nct: string = ps.identificationModule.nctId;
      const sKey = `study:nct:${nct}`;
      const studyUrl = `https://clinicaltrials.gov/study/${nct}`;
      const prov = { provider: "clinicaltrials" as const, source_id: nct, url: studyUrl, retrieved_at: at, native_type: ps.designModule?.studyType ?? "study" };
      const status: string = ps.statusModule?.overallStatus ?? "UNKNOWN";
      const sponsor: string | undefined = ps.sponsorCollaboratorsModule?.leadSponsor?.name;
      const collaborators: string[] = (ps.sponsorCollaboratorsModule?.collaborators ?? []).map((c: any) => c.name);
      records.push({
        kind: "study",
        key: sKey,
        label: ps.identificationModule.briefTitle,
        ids: { nct },
        status,
        status_label: STUDY_STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase(),
        phases: ps.designModule?.phases ?? [],
        study_type: ps.designModule?.studyType,
        conditions: ps.conditionsModule?.conditions ?? [],
        interventions: (ps.armsInterventionsModule?.interventions ?? []).map((i: any) => i.name).slice(0, 6),
        sponsor,
        collaborators,
        start_date: ps.statusModule?.startDateStruct?.date,
        completion_date: ps.statusModule?.completionDateStruct?.date,
        countries: [...new Set<string>((ps.contactsLocationsModule?.locations ?? []).map((l: any) => l.country).filter(Boolean))],
        enrollment: ps.designModule?.enrollmentInfo?.count,
        provenance: [prov],
        review_status: "machine_assembled",
      });
      links.push(link({ from: sKey, to: dKey, relation: "studies_condition", native_evidence_type: "condition_listed", statement: `${nct} lists a condition matching "${ctx.disease.label}" (status: ${STUDY_STATUS_LABEL[status] ?? status}).`, provenance: [prov] }));
      if (sponsor) links.push(link({ from: sKey, to: `org:name:${sponsor.toLowerCase()}`, relation: "sponsored_by", native_evidence_type: "lead_sponsor", statement: `${sponsor} is the lead sponsor of ${nct}.`, provenance: [prov] }));
      // Officials are public registry fields; contact emails/phones are never requested.
      for (const o of ps.contactsLocationsModule?.overallOfficials ?? []) {
        if (!o.name) continue;
        const pKey = `person:ctgov:${nct}:${o.name.toLowerCase()}`;
        records.push({ kind: "person", key: pKey, label: o.name, ids: {}, affiliations: o.affiliation ? [o.affiliation] : [], roles: [`${(o.role ?? "official").replace(/_/g, " ").toLowerCase()} on ${nct}`], provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: pKey, to: sKey, relation: "investigator_on", native_evidence_type: o.role ?? "overall_official", statement: `${o.name} is listed as ${(o.role ?? "an official").replace(/_/g, " ").toLowerCase()} on ${nct}.`, provenance: [prov] }));
      }
    }
    return { records, links, totals: { studies: j.totalCount ?? records.filter((r) => r.kind === "study").length } };
  }
}
