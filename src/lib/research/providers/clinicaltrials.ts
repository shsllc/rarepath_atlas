/**
 * ClinicalTrials.gov API v2 → condition-oriented studies, normalized with source-native wording:
 * identity, explicit status (never flattened), design, conditions, typed interventions, outcome measures
 * with time frames, sponsors/collaborators/responsible party, listed officials, enrollment, age/sex,
 * dates, locations, results-posted flag, protocol/SAP documents, and RESULT/DERIVED/BACKGROUND references.
 *
 * Completion, posted results or sponsor involvement are never read as trial success.
 * Contact e-mails and phone numbers are never requested.
 */
import { fetchJson, normName } from "../fetch";
import { link, type OutcomeMeasureRecord, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord, type StudyInfrastructure, type StudyRecord, type StudyStatusCategory } from "../types";

export const CTGOV_API = "https://clinicaltrials.gov/api/v2/studies";

/** Every overallStatus kept distinct: completed ≠ terminated ≠ withdrawn ≠ recruiting. */
export const STUDY_STATUS_LABEL: Record<string, string> = {
  RECRUITING: "Recruiting",
  NOT_YET_RECRUITING: "Not yet recruiting",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  COMPLETED: "Completed",
  TERMINATED: "Terminated (stopped early)",
  WITHDRAWN: "Withdrawn (stopped before enrolling)",
  SUSPENDED: "Suspended",
  UNKNOWN: "Unknown status (not verified recently)",
  AVAILABLE: "Expanded access: available",
  NO_LONGER_AVAILABLE: "Expanded access: no longer available",
  TEMPORARILY_NOT_AVAILABLE: "Expanded access: temporarily not available",
  APPROVED_FOR_MARKETING: "Approved for marketing",
  WITHHELD: "Withheld",
};

const CATEGORY: Record<string, StudyStatusCategory> = {
  RECRUITING: "active",
  NOT_YET_RECRUITING: "active",
  ENROLLING_BY_INVITATION: "active",
  ACTIVE_NOT_RECRUITING: "active",
  AVAILABLE: "active",
  COMPLETED: "completed",
  APPROVED_FOR_MARKETING: "completed",
  TERMINATED: "caution",
  WITHDRAWN: "caution",
  SUSPENDED: "caution",
  NO_LONGER_AVAILABLE: "caution",
  TEMPORARILY_NOT_AVAILABLE: "caution",
  WITHHELD: "caution",
  UNKNOWN: "unknown",
};
export const statusCategory = (status: string): StudyStatusCategory => CATEGORY[status] ?? "unknown";

/** What a status family means for a research lead. Never "enroll", never "success". */
export const CATEGORY_GUIDANCE: Record<StudyStatusCategory, string> = {
  active: "Potential study/research lead — verify eligibility/status with the study team.",
  completed: "Historical evidence / reusable design lead. Completion does not indicate that the study succeeded.",
  caution: "Caution: this study did not run to completion as registered. Not a positive reuse lead; read the stated reason before relying on it.",
  unknown: "Status has not been verified recently. Confirm with the registry before relying on it.",
};

const FIELDS = [
  "protocolSection.identificationModule",
  "protocolSection.statusModule",
  "protocolSection.sponsorCollaboratorsModule",
  "protocolSection.conditionsModule",
  "protocolSection.designModule",
  "protocolSection.armsInterventionsModule",
  "protocolSection.outcomesModule",
  "protocolSection.referencesModule",
  "Sex",
  "MinimumAge",
  "MaximumAge",
  "StdAge",
  "OverallOfficialName",
  "OverallOfficialAffiliation",
  "OverallOfficialRole",
  "LocationFacility",
  "LocationCity",
  "LocationState",
  "LocationCountry",
  "HasResults",
  "LargeDocLabel",
  "LargeDocFilename",
  "LargeDocHasProtocol",
  "LargeDocHasSAP",
].join(",");

/* eslint-disable @typescript-eslint/no-explicit-any */
function infrastructure(ps: any): { flag: StudyInfrastructure; basis: string }[] {
  const title = `${ps.identificationModule?.briefTitle ?? ""} ${ps.identificationModule?.officialTitle ?? ""}`;
  const d = ps.designModule ?? {};
  const out: { flag: StudyInfrastructure; basis: string }[] = [];
  if (/natural[- ]history/i.test(title)) out.push({ flag: "natural_history", basis: "title states natural history" });
  if (d.patientRegistry === true) out.push({ flag: "registry", basis: "registered as a patient registry" });
  else if (/\bregistr(y|ies)\b/i.test(title)) out.push({ flag: "registry", basis: "title states registry" });
  if (d.studyType === "OBSERVATIONAL" && /cohort/i.test(d.designInfo?.observationalModel ?? "")) out.push({ flag: "observational_cohort", basis: "observational model: cohort" });
  if (/longitudinal/i.test(title) || (d.studyType === "OBSERVATIONAL" && d.designInfo?.timePerspective === "PROSPECTIVE" && /natural[- ]history|registry/i.test(title))) out.push({ flag: "longitudinal", basis: /longitudinal/i.test(title) ? "title states longitudinal" : "prospective observational design" });
  if (/biobank|biorepository|biospecimen/i.test(title) || d.bioSpec) out.push({ flag: "biobank", basis: d.bioSpec ? "biospecimen retention recorded" : "title states biobank/biorepository" });
  return out;
}

export const outcomeKey = (measure: string) => `outcome:${normName(measure)}`;

export function normalizeStudy(ps: any, extras: { hasResults?: boolean; documentSection?: any }, at: string): { study: StudyRecord; records: ResearchRecord[]; links: ResearchLink[] } {
  const nct: string = ps.identificationModule.nctId;
  const key = `study:nct:${nct}`;
  const url = `https://clinicaltrials.gov/study/${nct}`;
  const prov = { provider: "clinicaltrials" as const, source_id: nct, url, retrieved_at: at, native_type: ps.designModule?.studyType ?? "study" };
  const status: string = ps.statusModule?.overallStatus ?? "UNKNOWN";
  const d = ps.designModule ?? {};
  const di = d.designInfo ?? {};
  const sc = ps.sponsorCollaboratorsModule ?? {};
  const rp = sc.responsibleParty;
  const ids: StudyRecord["ids"] = { nct };
  for (const x of ps.identificationModule?.secondaryIdInfos ?? []) {
    if (x.type === "EUDRACT_NUMBER") ids.eudract = x.id;
    if (x.type === "CTIS") ids.ctis = x.id;
    if (/^U\d{4}-\d{4}-\d{4}$/.test(x.id)) ids.utn = x.id;
  }
  const outcomes: StudyRecord["outcomes"] = [
    ...(ps.outcomesModule?.primaryOutcomes ?? []).map((o: any) => ({ role: "primary" as const, measure: o.measure, time_frame: o.timeFrame, description: o.description?.slice(0, 400) })),
    ...(ps.outcomesModule?.secondaryOutcomes ?? []).map((o: any) => ({ role: "secondary" as const, measure: o.measure, time_frame: o.timeFrame, description: o.description?.slice(0, 400) })),
    ...(ps.outcomesModule?.otherOutcomes ?? []).map((o: any) => ({ role: "other" as const, measure: o.measure, time_frame: o.timeFrame, description: o.description?.slice(0, 400) })),
  ].filter((o) => o.measure);
  const locations = (ps.contactsLocationsModule?.locations ?? []).map((l: any) => ({ facility: l.facility, city: l.city, state: l.state, country: l.country }));
  const docs = (extras.documentSection?.largeDocumentModule?.largeDocs ?? []).map((x: any) => ({
    label: x.label ?? x.typeAbbrev ?? "Document",
    url: `https://cdn.clinicaltrials.gov/large-docs/${nct.slice(-2)}/${nct}/${x.filename}`,
    protocol: !!x.hasProtocol,
    sap: !!x.hasSap,
  }));
  const study: StudyRecord = {
    kind: "study",
    key,
    label: ps.identificationModule.briefTitle,
    official_title: ps.identificationModule.officialTitle,
    ids,
    status,
    status_label: STUDY_STATUS_LABEL[status] ?? status.replace(/_/g, " ").toLowerCase(),
    status_category: statusCategory(status),
    why_stopped: ps.statusModule?.whyStopped,
    phases: d.phases ?? [],
    study_type: d.studyType,
    design: {
      allocation: di.allocation,
      intervention_model: di.interventionModel,
      masking: di.maskingInfo?.masking,
      primary_purpose: di.primaryPurpose,
      observational_model: di.observationalModel,
      time_perspective: di.timePerspective,
      patient_registry: d.patientRegistry,
    },
    conditions: ps.conditionsModule?.conditions ?? [],
    interventions: (ps.armsInterventionsModule?.interventions ?? []).map((i: any) => i.name).slice(0, 8),
    intervention_details: (ps.armsInterventionsModule?.interventions ?? []).map((i: any) => ({ type: i.type ?? "OTHER", name: i.name })).slice(0, 8),
    outcomes,
    sponsor: sc.leadSponsor?.name,
    sponsor_class: sc.leadSponsor?.class,
    collaborators: (sc.collaborators ?? []).map((c: any) => c.name),
    responsible_party: rp ? [rp.type?.replace(/_/g, " ").toLowerCase(), rp.investigatorFullName ?? rp.oldNameTitle, rp.investigatorAffiliation].filter(Boolean).join(" · ") : undefined,
    start_date: ps.statusModule?.startDateStruct?.date,
    primary_completion_date: ps.statusModule?.primaryCompletionDateStruct?.date,
    completion_date: ps.statusModule?.completionDateStruct?.date,
    last_update: ps.statusModule?.lastUpdatePostDateStruct?.date,
    countries: [...new Set<string>(locations.map((l: { country?: string }) => l.country).filter(Boolean))],
    locations: locations.slice(0, 40),
    enrollment: d.enrollmentInfo?.count,
    enrollment_type: d.enrollmentInfo?.type,
    eligibility: { sex: ps.eligibilityModule?.sex, minimum_age: ps.eligibilityModule?.minimumAge, maximum_age: ps.eligibilityModule?.maximumAge, age_groups: ps.eligibilityModule?.stdAges ?? [] },
    has_results: !!extras.hasResults,
    documents: docs,
    infrastructure: infrastructure(ps),
    provenance: [prov],
    review_status: "machine_assembled",
  };

  const records: ResearchRecord[] = [study];
  const links: ResearchLink[] = [];
  // Sponsors and collaborators are organizations with explicit relations, never "investigators".
  if (study.sponsor) {
    const oKey = `organization:${normName(study.sponsor)}`;
    records.push({ kind: "organization", key: oKey, label: study.sponsor, ids: { orgname: normName(study.sponsor) }, org_class: study.sponsor_class, provenance: [prov], review_status: "machine_assembled" });
    links.push(link({ from: key, to: oKey, relation: "sponsored_by", native_evidence_type: "lead_sponsor", statement: `${study.sponsor} is the lead sponsor of ${nct}. Sponsorship is not investigator participation.`, provenance: [prov] }));
  }
  for (const c of study.collaborators) {
    const oKey = `organization:${normName(c)}`;
    records.push({ kind: "organization", key: oKey, label: c, ids: { orgname: normName(c) }, provenance: [prov], review_status: "machine_assembled" });
    links.push(link({ from: key, to: oKey, relation: "collaborator_on", native_evidence_type: "collaborator", statement: `${c} is listed as a collaborator on ${nct}.`, provenance: [prov] }));
  }
  for (const o of ps.contactsLocationsModule?.overallOfficials ?? []) {
    if (!o.name) continue;
    const role = (o.role ?? "official").replace(/_/g, " ").toLowerCase();
    const pKey = `person:ctgov:${nct}:${normName(o.name)}`;
    records.push({ kind: "person", key: pKey, label: o.name, ids: {}, affiliations: o.affiliation ? [o.affiliation] : [], roles: [`${role} on ${nct}`], provenance: [prov], review_status: "machine_assembled" });
    links.push(link({ from: pKey, to: key, relation: "investigator_on", native_evidence_type: o.role ?? "overall_official", statement: `${o.name} is listed as ${role} on ${nct}.`, provenance: [prov] }));
  }
  for (const oc of outcomes) {
    const oKey = outcomeKey(oc.measure);
    records.push({ kind: "outcome_measure", key: oKey, label: oc.measure, measure: oc.measure, roles: [oc.role], ids: {}, provenance: [{ ...prov, native_type: `${oc.role}_outcome` }], review_status: "machine_assembled" } satisfies OutcomeMeasureRecord);
    links.push(
      link({
        from: key,
        to: oKey,
        relation: "uses_outcome_measure",
        native_evidence_type: `${oc.role}_outcome`,
        statement: `${nct} registers "${oc.measure}" as a ${oc.role} outcome measure${oc.time_frame ? ` (time frame: ${oc.time_frame})` : ""}.`,
        provenance: [{ ...prov, native_type: `${oc.role}_outcome` }],
      }),
    );
  }
  for (const r of ps.referencesModule?.references ?? []) {
    if (!r.pmid) continue; // only stable identifiers create a trial → paper link
    const paperKey = `paper:pmid:${r.pmid}`;
    const type: string = r.type ?? "UNSPECIFIED";
    const label = String(r.citation ?? `PMID ${r.pmid}`).split(". ").slice(1, 2).join("") || `PMID ${r.pmid}`;
    records.push({ kind: "paper", key: paperKey, label, ids: { pmid: String(r.pmid) }, publication_status: "unknown", publication_types: [], authors: [], update_notices: [], provenance: [{ ...prov, native_type: `reference:${type}` }], review_status: "machine_assembled" });
    links.push(
      link({
        from: key,
        to: paperKey,
        relation: type === "BACKGROUND" ? "trial_background_reference" : "trial_publication",
        native_evidence_type: `ctgov_reference:${type}`,
        statement:
          type === "BACKGROUND"
            ? `ClinicalTrials.gov lists PMID ${r.pmid} as BACKGROUND literature for ${nct} (not a result of this study).`
            : `ClinicalTrials.gov lists PMID ${r.pmid} as a ${type} reference for ${nct}. Registration and a linked paper are not proof of a positive result.`,
        provenance: [{ ...prov, native_type: `reference:${type}` }],
      }),
    );
  }
  return { study, records, links };
}

export class ClinicalTrialsProvider implements ResearchProvider {
  meta = {
    id: "clinicaltrials" as const,
    name: "ClinicalTrials.gov (API v2)",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Studies (NCT) with explicit status", "Design & phase", "Typed interventions", "Outcome measures & time frames", "Sponsors, collaborators, responsible party", "Listed officials", "Enrollment, age, sex", "Locations", "Results-posted flag & documents", "Linked publications (PMID)"],
    homepage: "https://clinicaltrials.gov",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const cond = encodeURIComponent(ctx.disease.label);
    const infraTerm = encodeURIComponent('"natural history" OR registry OR biobank OR longitudinal OR cohort');
    const [main, infra] = await Promise.all([
      fetchJson<{ totalCount?: number; studies?: any[] }>("ClinicalTrials.gov", `${CTGOV_API}?query.cond=${cond}&pageSize=20&countTotal=true&fields=${FIELDS}`, {}, 5_000),
      fetchJson<{ totalCount?: number; studies?: any[] }>("ClinicalTrials.gov", `${CTGOV_API}?query.cond=${cond}&query.term=${infraTerm}&pageSize=10&countTotal=true&fields=${FIELDS}`, {}, 5_000).catch(() => null),
    ]);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    const seen = new Set<string>();
    for (const [bucket, list] of [["relevance", main.studies ?? []], ["infrastructure", infra?.studies ?? []]] as const) {
      for (const s of list) {
        const nct = s.protocolSection?.identificationModule?.nctId;
        if (!nct || seen.has(nct)) continue;
        seen.add(nct);
        const n = normalizeStudy(s.protocolSection, { hasResults: s.hasResults, documentSection: s.documentSection }, at);
        records.push(...n.records);
        links.push(...n.links);
        links.push(link({ from: n.study.key, to: dKey, relation: "studies_condition", native_evidence_type: `condition_listed:${bucket}`, statement: `${nct} lists a condition matching "${ctx.disease.label}" (status: ${n.study.status_label}).`, provenance: n.study.provenance }));
      }
    }
    return { records, links, totals: { studies: main.totalCount ?? 0, infrastructure_studies: infra?.totalCount ?? 0 } };
  }
}
