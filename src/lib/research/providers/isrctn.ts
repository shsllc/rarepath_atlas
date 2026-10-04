/**
 * ISRCTN registry (official keyless API, records CC BY / metadata CC0) → UK-centred and international trials,
 * normalized into the shared trial schema with cross-registry identifiers (NCT, EudraCT, IRAS, sponsor protocol).
 * https://www.isrctn.com/api/query/format/default — low limit, one request per search, as the registry asks.
 *
 * Status: a recruitment-status override is kept verbatim; otherwise status is derived from the registered
 * recruitment and overall end dates and labelled as derived. Contact e-mails and phone numbers are never read.
 */
import { fetchText, normName, normOrcid } from "../fetch";
import { link, type ProviderContext, type ProviderResult, type ResearchLink, type ResearchProvider, type ResearchRecord, type StudyRecord, type StudyStatusCategory } from "../types";

export const ISRCTN_API = "https://www.isrctn.com/api/query/format/default";
export const ISRCTN_LICENCE = "ISRCTN records CC BY 4.0, metadata CC0 (isrctn.com)";

const dec = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();
/** First text value of <tag>…</tag> (no attributes captured). */
export const tag = (x: string, t: string) => {
  const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`).exec(x);
  return m ? dec(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : undefined;
};
export const tags = (x: string, t: string) => [...x.matchAll(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "g"))].map((m) => m[1]);
export const block = (x: string, t: string) => new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`).exec(x)?.[1] ?? "";

/** Derive an ISRCTN status from registered dates when no override is given. */
export function isrctnStatus(override: string | undefined, recruitStart?: string, recruitEnd?: string, overallEnd?: string, now = new Date()): { status: string; label: string; category: StudyStatusCategory } {
  if (override) {
    const o = override.toLowerCase();
    const category: StudyStatusCategory = /stopp|suspend|withdraw|terminat/.test(o) ? "caution" : /recruiting|ongoing/.test(o) && !/no longer/.test(o) ? "active" : /completed/.test(o) ? "completed" : "unknown";
    return { status: override, label: `${override} (registry override)`, category };
  }
  const t = now.getTime();
  const s = recruitStart ? Date.parse(recruitStart) : NaN;
  const e = recruitEnd ? Date.parse(recruitEnd) : NaN;
  const end = overallEnd ? Date.parse(overallEnd) : NaN;
  if (!Number.isNaN(s) && t < s) return { status: "NOT_YET_RECRUITING", label: "Not yet recruiting (derived from registered dates)", category: "active" };
  if (!Number.isNaN(s) && !Number.isNaN(e) && t >= s && t <= e) return { status: "RECRUITING", label: "Recruiting (derived from registered dates)", category: "active" };
  if (!Number.isNaN(end) && t <= end) return { status: "ONGOING_NOT_RECRUITING", label: "Ongoing, no longer recruiting (derived from registered dates)", category: "active" };
  if (!Number.isNaN(end) && t > end) return { status: "COMPLETED_BY_DATE", label: "Completed per registered end date (derived; not verified)", category: "completed" };
  return { status: "UNKNOWN", label: "Status not stated", category: "unknown" };
}

export class IsrctnProvider implements ResearchProvider {
  meta = {
    id: "isrctn" as const,
    name: "ISRCTN registry",
    role: "discovery" as const,
    mode: "live" as const,
    data_types: ["Trials (ISRCTN)", "Cross-registry ids (NCT, EudraCT, IRAS, sponsor protocol)", "Design, phase, purpose", "Outcome measures", "Sponsors & funders (ROR)", "Recruitment countries & centres", "Enrolment, age, sex", "Results outputs"],
    homepage: "https://www.isrctn.com",
  };

  async run(ctx: ProviderContext): Promise<ProviderResult> {
    const at = ctx.now().toISOString();
    const q = `condition:"${ctx.disease.label.replace(/"/g, "")}"`;
    const url = `${ISRCTN_API}?q=${encodeURIComponent(q)}&limit=15`;
    const xml = await fetchText("ISRCTN", url, "application/xml");
    const total = Number(/totalCount="(\d+)"/.exec(xml)?.[1] ?? 0);
    const records: ResearchRecord[] = [];
    const links: ResearchLink[] = [];
    const dKey = ctx.disease.ontology_id ? `disease:${ctx.disease.ontology_id}` : `disease:query:${ctx.disease.label.toLowerCase()}`;
    for (const ft of tags(xml, "fullTrial")) {
      const trial = block(ft, "trial");
      const num = tag(trial, "isrctn");
      if (!num) continue;
      const id = `ISRCTN${num}`;
      const key = `study:isrctn:${id}`;
      const recUrl = `https://www.isrctn.com/${id}`;
      const prov = { provider: "isrctn" as const, source_id: id, url: recUrl, retrieved_at: at, native_type: tag(trial, "primaryStudyDesign") ?? "trial" };
      const refs = block(trial, "externalRefs");
      const ids: StudyRecord["ids"] = { isrctn: id };
      const nct = tag(refs, "clinicalTrialsGovNumber");
      if (nct && /^NCT\d{8}$/.test(nct)) ids.nct = nct;
      const eudract = tag(refs, "eudraCTNumber");
      if (eudract && /^\d{4}-\d{6}-\d{2}$/.test(eudract)) ids.eudract = eudract;
      // Sponsor organisations live outside <trial>, referenced by id.
      const sponsorIds = tags(trial, "sponsorId").map((s) => s.trim());
      const sponsors = sponsorIds.map((sid) => new RegExp(`<sponsor id="${sid}"[^>]*>([\\s\\S]*?)</sponsor>`).exec(ft)?.[1] ?? "").filter(Boolean);
      const sponsorName = sponsors[0] ? tag(sponsors[0], "organisation") : undefined;
      const sponsorRor = sponsors[0] ? tag(sponsors[0], "rorId") : undefined;
      const protocol = tag(refs, "protocolSerialNumber");
      if (protocol && sponsorName) ids.sponsor_protocol = `${normName(sponsorName)}|${protocol}`;
      const funders = tags(trial, "funderId").map((fid) => tag(new RegExp(`<funder id="${fid.trim()}"[^>]*>([\\s\\S]*?)</funder>`).exec(ft)?.[1] ?? "", "name")).filter((x): x is string => !!x);
      const design = block(trial, "trialDesign");
      const ps = block(trial, "participants");
      const st = isrctnStatus(tag(trial, "recruitmentStatusOverride") || undefined, tag(ps, "recruitmentStart"), tag(ps, "recruitmentEnd"), tag(design, "overallEndDate"), ctx.now());
      const centres = tags(ps, "trialCentre").map((c) => ({ facility: tag(c, "name"), city: tag(c, "city"), state: tag(c, "state"), country: tag(c, "country") }));
      const countries = [...new Set(tags(block(ps, "recruitmentCountries"), "country").map(dec))];
      const outcomes: StudyRecord["outcomes"] = [
        ...tags(trial, "primaryOutcome").map((o) => ({ role: "primary" as const, measure: dec(o.replace(/<[^>]+>/g, " ")).slice(0, 300) })),
        ...tags(trial, "secondaryOutcome").map((o) => ({ role: "secondary" as const, measure: dec(o.replace(/<[^>]+>/g, " ")).slice(0, 300) })),
      ].filter((o) => o.measure);
      const outputs = tags(block(trial, "outputs"), "output");
      const hasResults = outputs.some((o) => /result/i.test(tag(o, "outputType") ?? "")) || !!tag(trial, "basicReport");
      const primaryDesign = tag(design, "primaryStudyDesign");
      const secondaryDesign = tag(design, "secondaryStudyDesign");
      const title = tag(trial, "title") ?? id;
      const infra: StudyRecord["infrastructure"] = [];
      if (/natural[- ]history/i.test(`${title} ${tag(trial, "scientificTitle") ?? ""}`)) infra.push({ flag: "natural_history", basis: "title states natural history" });
      if (/registry/i.test(`${title} ${secondaryDesign ?? ""}`)) infra.push({ flag: "registry", basis: "title or design states registry" });
      if (/cohort/i.test(secondaryDesign ?? "")) infra.push({ flag: "observational_cohort", basis: `secondary design: ${secondaryDesign}` });
      if (/longitudinal/i.test(`${title} ${secondaryDesign ?? ""}`)) infra.push({ flag: "longitudinal", basis: "title or design states longitudinal" });
      if (/biobank|biorepository|biospecimen/i.test(title)) infra.push({ flag: "biobank", basis: "title states biobank" });
      const study: StudyRecord = {
        kind: "study",
        key,
        label: title,
        official_title: tag(trial, "scientificTitle"),
        primary_registry: "ISRCTN",
        ids,
        status: st.status,
        status_label: st.label,
        status_category: st.category,
        phases: tag(trial, "phase") ? [tag(trial, "phase")!] : [],
        study_type: primaryDesign?.toUpperCase(),
        design: { allocation: tag(design, "allocation"), masking: tag(design, "masking"), primary_purpose: tags(design, "purpose").map(dec).join(", ") || undefined, observational_model: primaryDesign === "Observational" ? secondaryDesign : undefined },
        conditions: tags(block(trial, "conditions"), "description").map((c) => dec(c)),
        interventions: tags(block(trial, "interventions"), "drugNames").map(dec).filter(Boolean).slice(0, 6),
        intervention_details: tags(block(trial, "interventions"), "interventionType").map((t) => ({ type: dec(t).toUpperCase(), name: "as registered" })).slice(0, 6),
        outcomes,
        sponsor: sponsorName,
        collaborators: funders.filter((f) => f !== sponsorName).slice(0, 4),
        start_date: tag(ps, "recruitmentStart")?.slice(0, 10),
        completion_date: tag(design, "overallEndDate")?.slice(0, 10),
        last_update: /lastUpdated="([^"]+)"/.exec(trial)?.[1]?.slice(0, 10),
        countries,
        locations: centres.slice(0, 40),
        enrollment: Number(tag(ps, "totalFinalEnrolment") || tag(ps, "targetEnrolment")) || undefined,
        enrollment_type: tag(ps, "totalFinalEnrolment") && Number(tag(ps, "totalFinalEnrolment")) > 0 ? "ACTUAL" : "ESTIMATED",
        eligibility: { sex: tag(ps, "gender"), minimum_age: tag(ps, "lowerAgeLimit"), maximum_age: tag(ps, "upperAgeLimit"), age_groups: tag(ps, "ageRange") ? [tag(ps, "ageRange")!] : [] },
        has_results: hasResults,
        documents: [],
        infrastructure: infra,
        provenance: [prov],
        review_status: "machine_assembled",
      };
      records.push(study);
      links.push(link({ from: key, to: dKey, relation: "studies_condition", native_evidence_type: "condition_search:isrctn", statement: `${id} is returned by the ISRCTN search for condition "${ctx.disease.label}" (status: ${st.label}).`, provenance: [prov] }));
      if (sponsorName) {
        const oKey = `organization:${normName(sponsorName)}`;
        records.push({ kind: "organization", key: oKey, label: sponsorName, ids: { orgname: normName(sponsorName), ...(sponsorRor ? { ror: sponsorRor.replace(/^https?:\/\/ror\.org\//, "") } : {}) }, provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: key, to: oKey, relation: "sponsored_by", native_evidence_type: "isrctn_sponsor", statement: `${sponsorName} is the registered sponsor of ${id}. Sponsorship is not investigator participation.`, provenance: [prov] }));
      }
      for (const f of study.collaborators) {
        const oKey = `organization:${normName(f)}`;
        records.push({ kind: "organization", key: oKey, label: f, ids: { orgname: normName(f) }, provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: key, to: oKey, relation: "collaborator_on", native_evidence_type: "isrctn_funder", statement: `${f} is listed as a funder of ${id}.`, provenance: [prov] }));
      }
      for (const oc of outcomes) {
        const oKey = `outcome:${normName(oc.measure)}`;
        records.push({ kind: "outcome_measure", key: oKey, label: oc.measure, measure: oc.measure, roles: [oc.role], ids: {}, provenance: [{ ...prov, native_type: `${oc.role}_outcome` }], review_status: "machine_assembled" });
        links.push(link({ from: key, to: oKey, relation: "uses_outcome_measure", native_evidence_type: `${oc.role}_outcome`, statement: `${id} registers "${oc.measure}" as a ${oc.role} outcome measure.`, provenance: [{ ...prov, native_type: `${oc.role}_outcome` }] }));
      }
      // Principal investigators only when an ORCID is given (no name-only identities; contact details never read).
      for (const c of tags(ft, "contact")) {
        if (!/Principal investigator/i.test(block(c, "contactTypes"))) continue;
        const orcid = normOrcid(tag(c, "orcid"));
        if (!orcid) continue;
        const name = [tag(c, "forename"), tag(c, "surname")].filter(Boolean).join(" ");
        records.push({ kind: "person", key: `person:orcid:${orcid}`, label: name, ids: { orcid }, affiliations: [], roles: [`principal investigator on ${id}`], provenance: [prov], review_status: "machine_assembled" });
        links.push(link({ from: `person:orcid:${orcid}`, to: key, relation: "investigator_on", native_evidence_type: "isrctn_principal_investigator", statement: `${name} (ORCID ${orcid}) is listed as principal investigator on ${id}.`, provenance: [prov] }));
      }
    }
    return { records, links, totals: { isrctn_trials: total }, notes: [ISRCTN_LICENCE] };
  }
}
