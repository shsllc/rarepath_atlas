import type { SourceRecord } from "@/lib/schemas";
import type { TrialsProvider } from "@/lib/services/interfaces";
import { getJson, normalizeText, today } from "./http";

const API = "https://clinicaltrials.gov/api/v2/studies";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Study = { protocolSection: any };

/** ClinicalTrials.gov API v2. No key required. */
export class ClinicalTrialsGovProvider implements TrialsProvider {
  async searchStudies(term: string, pageSize = 20) {
    const fields = "NCTId,BriefTitle,OverallStatus,StudyType,Condition";
    const data = await getJson<{ studies: Study[] }>(`${API}?query.term=${encodeURIComponent(term)}&pageSize=${pageSize}&fields=${fields}`);
    return data.studies.map((s) => {
      const p = s.protocolSection;
      return {
        nct: p.identificationModule.nctId as string,
        title: p.identificationModule.briefTitle as string,
        conditions: (p.conditionsModule?.conditions ?? []) as string[],
        status: p.statusModule?.overallStatus as string,
        studyType: p.designModule?.studyType as string,
      };
    });
  }

  /** Renders the registry record as labelled plain text so quotes can be verified against it. */
  async getStudy(nct: string): Promise<SourceRecord> {
    const { protocolSection: p } = await getJson<Study>(`${API}/${nct}`);
    const id = p.identificationModule;
    const officials = (p.contactsLocationsModule?.overallOfficials ?? []) as { name: string; affiliation: string; role: string }[];
    const outcomes = [
      ...(p.outcomesModule?.primaryOutcomes ?? []).map((o: any) => `Primary outcome: ${o.measure}`),
      ...(p.outcomesModule?.secondaryOutcomes ?? []).map((o: any) => `Secondary outcome: ${o.measure}`),
    ];
    const lines = [
      `Brief title: ${id.briefTitle}`,
      `Official title: ${id.officialTitle ?? ""}`,
      `Organization study ID: ${id.orgStudyIdInfo?.id ?? ""}`,
      ...(id.secondaryIdInfos ?? []).map((x: any) => `Secondary ID: ${x.id} (${x.type ?? "other"})`),
      `Conditions: ${(p.conditionsModule?.conditions ?? []).join("; ")}`,
      `Study type: ${p.designModule?.studyType}`,
      `Overall status: ${p.statusModule?.overallStatus}`,
      `Start date: ${p.statusModule?.startDateStruct?.date ?? ""}`,
      `Completion date: ${p.statusModule?.completionDateStruct?.date ?? ""}`,
      `Enrollment: ${p.designModule?.enrollmentInfo?.count ?? ""} (${p.designModule?.enrollmentInfo?.type ?? ""})`,
      `Lead sponsor: ${p.sponsorCollaboratorsModule?.leadSponsor?.name ?? ""}`,
      `Collaborators: ${(p.sponsorCollaboratorsModule?.collaborators ?? []).map((c: any) => c.name).join("; ")}`,
      ...officials.map((o) => `Overall official: ${o.name}, ${o.affiliation} (${o.role})`),
      `Brief summary: ${normalizeText(p.descriptionModule?.briefSummary ?? "")}`,
      `Eligibility criteria: ${normalizeText(p.eligibilityModule?.eligibilityCriteria ?? "")}`,
      `Study population: ${normalizeText(p.eligibilityModule?.studyPopulation ?? "")}`,
      ...outcomes.map(normalizeText),
      `Number of listed locations: ${(p.contactsLocationsModule?.locations ?? []).length}`,
    ];
    return {
      id: `ctgov:${nct}`,
      kind: "ctgov_record",
      title: `${nct}: ${id.briefTitle}`,
      url: `https://clinicaltrials.gov/study/${nct}`,
      retrieval_date: today(),
      retrieved_via: "ClinicalTrials.gov API v2 /studies/{nct}",
      text: lines.join("\n"),
      citation: { nct },
      authors: [],
      publication_types: [],
      meta: {
        conditions: p.conditionsModule?.conditions ?? [],
        status: p.statusModule?.overallStatus,
        study_type: p.designModule?.studyType,
        enrollment: p.designModule?.enrollmentInfo?.count,
        sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name,
        start_date: p.statusModule?.startDateStruct?.date,
        completion_date: p.statusModule?.completionDateStruct?.date,
        officials,
        secondary_ids: id.secondaryIdInfos ?? [],
      },
    };
  }
}
