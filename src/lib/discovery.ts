/**
 * Discovery layer: a machine-assembled research preview for diseases outside the reviewed slice.
 *
 * Built at query time by the multi-provider orchestrator (src/lib/research): Open Targets, GWAS Catalog,
 * ClinicalTrials.gov, Europe PMC, DataCite, OpenAlex and Crossref, reconciled by stable identifiers.
 * Every relationship stays review_status = "machine_assembled", eligible_for_ranking = false,
 * eligible_for_action = false, and keeps every contributing provider's provenance. Nothing here is
 * written into the reviewed bundle, scored by Research Connection Strength, or used by a Research Action Brief.
 */
import type { EvidenceEdge, Predicate } from "@/lib/schemas";
import { DiscoveryOrchestrator, type AssembledGraph, type ProviderRun } from "@/lib/research/orchestrator";
import { liveProviders } from "@/lib/research/registry";
import { stageRank } from "@/lib/research/providers/opentargets";
import { CATEGORY_GUIDANCE } from "@/lib/research/providers/clinicaltrials";
import type { LinkRelation, PaperRecord, ProviderId, ResearchLink, ResearchProvider, ResearchRecord, StudyRecord } from "@/lib/research/types";

export const DISCOVERY_LABEL = "MACHINE-ASSEMBLED DISCOVERY";
export const DISCOVERY_SUBLABEL = "NOT YET REVIEWED FOR RANKING OR ACTION";
export const DISCOVERY_EXPLAINER =
  "These connections can help identify where to investigate next. They do not yet participate in RarePath's reviewed ranking or Research Action Brief.";

export const PROVIDER_NAME: Record<ProviderId, string> = {
  opentargets: "Open Targets",
  gwas: "GWAS Catalog",
  clinicaltrials: "ClinicalTrials.gov",
  europepmc: "Europe PMC",
  openalex: "OpenAlex",
  crossref: "Crossref",
  datacite: "DataCite",
  trialpubs: "Europe PMC (trial links)",
  monarch: "Monarch",
  orphadata: "Orphadata",
  hpo: "HPO",
  clingen: "ClinGen",
  clinvar: "ClinVar",
  alliance: "Alliance",
};

export type PaperView = {
  key: string;
  label: string;
  year?: number;
  venue?: string;
  publication_status: PaperRecord["publication_status"];
  open_access?: boolean;
  full_text_available?: boolean;
  cited_by_count?: number;
  authors: string[];
  url: string;
  ids: PaperRecord["ids"];
  sources: string[];
  verified_by_crossref: boolean;
  update_notices: string[];
  in_reviewed_graph?: string;
};
export type StudyView = Omit<StudyRecord, "kind" | "key" | "ids" | "provenance" | "review_status"> & {
  nct: string;
  url: string;
  secondary_ids: string[];
  /** What this status family means for a research lead (never "enroll", never "success"). */
  guidance: string;
  officials: { name: string; role: string; affiliation?: string }[];
  publications: { pmid?: string; label: string; url: string; relation: "trial_publication" | "trial_background_reference" | "paper_mentions_trial"; native: string; publication_status: PaperRecord["publication_status"] }[];
};
export type SharedEndpointView = { measure: string; studies: { nct: string; label: string; status_label: string; conditions: string[]; role: string; time_frame?: string }[]; conditions: string[] };
export type PersonView = { key: string; name: string; orcid?: string; affiliations: string[]; records: number; roles: string[]; sources: string[] };
export type GeneView = { symbol: string; name?: string; ensembl_id: string; url: string; evidence_types: string[]; source_score?: { name: string; value: number } };

export type PhenotypeView = { hpo: string; name: string; url: string; frequency?: string; onset?: string; sex?: string; references?: string; diagnostic_criteria?: string; sources: string[] };
export type ValidityView = { gene: string; hgnc?: string; classification: string; expert_panel: string; mode_of_inheritance: string; released: string; url: string };
export type CausalGeneView = { gene: string; hgnc?: string; source: string; detail: string; url: string };
export type ClinVarView = { label: string; classification: string; review_status: string; stars: number; conditions?: string; last_evaluated?: string; url: string; source: string };
export type ModelView = { label: string; id: string; species: string; disease_context?: string; source: string; url: string };

export type DiscoveryPreview = {
  tier: "machine_assembled";
  eligible_for_ranking: false;
  eligible_for_action: false;
  disease: { id?: string; source_id?: string; label: string; description?: string; url?: string; identifiers: { system: string; id: string }[]; synonyms: string[]; resolved: boolean };
  match: { query: string; exact: boolean; alternatives: { id: string; name: string }[] };
  literature: { total: number; top: PaperView[]; most_cited: PaperView[]; recent: PaperView[]; citation: { seed?: PaperView; citing: PaperView[]; referenced: PaperView[]; citing_total: number } };
  people: { researchers: PersonView[]; institutions: { label: string; ror: string; country?: string; people: number }[] };
  clinical: {
    total: number;
    infrastructure_total: number;
    studies: StudyView[];
    groups: Record<StudyRecord["status_category"], StudyView[]>;
    infrastructure: StudyView[];
    shared_endpoints: SharedEndpointView[];
    status_counts: { status: string; label: string; count: number }[];
  };
  genetics: { gene_total: number; genes: GeneView[]; variant_total: number; variants: { label: string; gene?: string; statement: string; url: string }[]; gwas_total: number; gwas: { label: string; statement: string; url: string }[] };
  assets: { dataset_total: number; datasets: { label: string; doi: string; url: string; resource_type: string; publisher?: string; year?: number; description?: string; subjects: string[] }[]; reuse_leads: StudyView[] };
  adjacent: { ontology: { id: string; name: string; relation: "broader" | "narrower"; url: string }[]; same_gene: { gene: string; diseases: { id: string; name: string }[] } | null };
  drugs: { total: number; items: { chembl_id: string; name: string; drug_type?: string; stage: string; url: string }[] };
  phenotypes: { total: number; items: { id: string; name: string; url: string }[]; annotated: PhenotypeView[]; excluded: PhenotypeView[] };
  rare: {
    mappings: { system: string; id: string }[];
    mapping_basis?: string;
    natural_history?: { onset: string[]; inheritance: string[] };
    epidemiology: { type: string; class?: string; geographic?: string; qualification?: string; validation?: string }[];
    causal_genes: CausalGeneView[];
    /** Orphanet modifier / susceptibility / other gene relationships, kept apart from causal genes. */
    other_gene_associations: { gene: string; detail: string; url: string }[];
    validity: ValidityView[];
    dosage: { gene: string; haploinsufficiency: string; triplosensitivity: string; url: string }[];
    clinvar: ClinVarView[];
    clinvar_total: number;
    models: ModelView[];
    orthologs: { symbol: string; species: string; confidence: string; url: string }[];
    licence_notes: string[];
  };
  sources: ProviderRun[];
  warnings: string[];
  merges: number;
  records: ResearchRecord[];
  links: ResearchLink[];
  /** Links converted to the reviewed graph's edge format, still machine-assembled: the input to a future review step. */
  candidate_edges: EvidenceEdge[];
  assembled_at: string;
};

export type DiscoveryOutcome = { kind: "preview"; preview: DiscoveryPreview } | { kind: "no_match" } | { kind: "unavailable"; message: string };

export interface DiscoveryService {
  preview(query: string): Promise<DiscoveryOutcome>;
}

const PREDICATE: Partial<Record<LinkRelation, { p: Predicate; reverse?: boolean }>> = {
  associated_with: { p: "associated_with" },
  variant_classified_for: { p: "associated_with" },
  gwas_association: { p: "associated_with" },
  gene_associated_with_other_disease: { p: "associated_with" },
  subclass_of: { p: "subclass_of" },
  has_phenotype: { p: "has_phenotype" },
  studies_condition: { p: "studied_in", reverse: true },
  investigator_on: { p: "investigates" },
  authored: { p: "authored" },
};

/** Review-boundary format: an EvidenceEdge that is explicitly machine-assembled and ineligible. */
export function toCandidateEdge(l: ResearchLink): EvidenceEdge | null {
  const m = PREDICATE[l.relation];
  if (!m) return null;
  const p0 = l.provenance[0];
  const day = p0.retrieved_at.slice(0, 10);
  const source = `${PROVIDER_NAME[p0.provider]} (machine-assembled)`;
  return {
    id: `edge:disc:${l.key}`,
    subject_id: m.reverse ? l.to : l.from,
    predicate: m.p,
    object_id: m.reverse ? l.from : l.to,
    source,
    source_url: p0.url,
    retrieval_date: day,
    source_type: "research_platform",
    evidence_type: "machine_assembled",
    quoted_or_structured_evidence: l.statement,
    evidence: l.provenance.map((p, i) => ({
      id: `ev:disc:${l.key}:${i}`,
      source: PROVIDER_NAME[p.provider],
      source_url: p.url,
      retrieval_date: p.retrieved_at.slice(0, 10),
      source_type: "research_platform" as const,
      evidence_type: "machine_assembled" as const,
      quoted_or_structured_evidence: l.statement,
      method: "structured_api" as const,
      stance: "supports" as const,
    })),
    // Not reviewed by RarePath: "insufficient" so no view can ever render it as Known / directly supported.
    confidence: "insufficient",
    inferred: false,
    contradiction_status: "none",
    created_at: day,
    review_status: "machine_assembled",
    eligible_for_ranking: false,
    eligible_for_action: false,
  };
}

const colon = (id: string) => id.replace("_", ":");
const paperUrl = (p: PaperRecord) => (p.ids.doi ? `https://doi.org/${p.ids.doi}` : p.ids.pmid ? `https://europepmc.org/article/MED/${p.ids.pmid}` : p.provenance[0].url);
const sourcesOf = (r: { provenance: { provider: ProviderId }[] }) => [...new Set(r.provenance.map((p) => PROVIDER_NAME[p.provider]))];

export function buildPreview(g: AssembledGraph): DiscoveryPreview {
  const byKey = new Map(g.records.map((r) => [r.key, r]));
  const of = <K extends ResearchRecord["kind"]>(k: K) => g.records.filter((r): r is Extract<ResearchRecord, { kind: K }> => r.kind === k);
  const linksOf = (rel: LinkRelation) => g.links.filter((l) => l.relation === rel);
  const dKey = g.disease.ontology_id ? `disease:${g.disease.ontology_id}` : `disease:query:${g.disease.label.toLowerCase()}`;
  const disease = byKey.get(dKey);

  const pv = (p: PaperRecord): PaperView => ({
    key: p.key,
    label: p.label,
    year: p.year,
    venue: p.venue,
    publication_status: p.publication_status,
    open_access: p.open_access,
    full_text_available: p.full_text_available,
    cited_by_count: p.cited_by_count,
    authors: p.authors.slice(0, 3),
    url: paperUrl(p),
    ids: p.ids,
    sources: sourcesOf(p),
    verified_by_crossref: p.metadata_verified_by === "crossref",
    update_notices: p.update_notices,
    in_reviewed_graph: p.in_reviewed_graph,
  });
  const paper = (k: string) => {
    const r = byKey.get(k);
    return r && r.kind === "paper" ? r : undefined;
  };
  const mentions = linksOf("mentions_disease").filter((l) => l.to === dKey);
  const top = mentions.filter((l) => l.native_evidence_type === "search:relevance").map((l) => paper(l.from)).filter((p): p is PaperRecord => !!p);
  const topKeys = new Set(top.map((p) => p.key));
  const cited = mentions.filter((l) => l.native_evidence_type === "search:cited" && !topKeys.has(l.from)).map((l) => paper(l.from)).filter((p): p is PaperRecord => !!p);
  const citedKeys = new Set(cited.map((p) => p.key));
  const recent = mentions.filter((l) => l.native_evidence_type === "search:recent" && !topKeys.has(l.from) && !citedKeys.has(l.from)).map((l) => paper(l.from)).filter((p): p is PaperRecord => !!p);
  const cites = linksOf("cites");
  const seedKey = cites.find((l) => l.native_evidence_type === "cites")?.to ?? cites.find((l) => l.native_evidence_type === "references")?.from;
  const seed = seedKey ? paper(seedKey) : undefined;

  const linkCount = new Map<string, number>();
  for (const l of g.links) if (l.relation === "authored" || l.relation === "investigator_on") linkCount.set(l.from, (linkCount.get(l.from) ?? 0) + 1);
  const researchers = of("person")
    .filter((p) => p.ids.orcid)
    .map((p): PersonView => ({ key: p.key, name: p.label, orcid: p.ids.orcid, affiliations: p.affiliations.slice(0, 2), records: linkCount.get(p.key) ?? 0, roles: p.roles, sources: sourcesOf(p) }))
    .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name))
    .slice(0, 10);
  const instPeople = new Map<string, number>();
  for (const l of linksOf("affiliated_with")) instPeople.set(l.to, (instPeople.get(l.to) ?? 0) + 1);
  const institutions = of("institution")
    .map((i) => ({ label: i.label, ror: i.ids.ror!, country: i.country, people: instPeople.get(i.key) ?? 0 }))
    .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label))
    .slice(0, 10);

  const officials = (k: string) =>
    linksOf("investigator_on")
      .filter((l) => l.to === k)
      .map((l) => byKey.get(l.from))
      .filter((p): p is Extract<ResearchRecord, { kind: "person" }> => !!p && p.kind === "person")
      .map((p) => ({ name: p.label, role: p.roles[0] ?? "listed official", affiliation: p.affiliations[0] }));
  const pubsFor = (k: string): StudyView["publications"] => [
    ...g.links
      .filter((l) => (l.relation === "trial_publication" || l.relation === "trial_background_reference") && l.from === k)
      .map((l) => ({ l, p: paper(l.to) })),
    ...linksOf("paper_mentions_trial")
      .filter((l) => l.to === k)
      .map((l) => ({ l, p: paper(l.from) })),
  ]
    .filter((x): x is { l: ResearchLink; p: PaperRecord } => !!x.p)
    .map(({ l, p }) => ({ pmid: p.ids.pmid, label: p.label, url: paperUrl(p), relation: l.relation as StudyView["publications"][number]["relation"], native: l.native_evidence_type, publication_status: p.publication_status }))
    .filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i);
  const studies = of("study").map((s): StudyView => {
    const { kind: _k, key, ids, provenance: _p, review_status: _r, ...rest } = s;
    return {
      ...rest,
      nct: ids.nct!,
      url: `https://clinicaltrials.gov/study/${ids.nct}`,
      secondary_ids: [ids.eudract && `EudraCT ${ids.eudract}`, ids.ctis && `CTIS ${ids.ctis}`, ids.utn && `UTN ${ids.utn}`].filter((x): x is string => !!x),
      guidance: CATEGORY_GUIDANCE[s.status_category],
      officials: officials(key),
      publications: pubsFor(key),
    };
  });
  const groups: Record<StudyRecord["status_category"], StudyView[]> = { active: [], completed: [], caution: [], unknown: [] };
  for (const s of studies) groups[s.status_category].push(s);
  // Infrastructure leads: active/completed first; caution studies stay listed but always with their status and guidance.
  const catRank = { active: 0, completed: 1, unknown: 2, caution: 3 } as const;
  const infrastructure = studies.filter((s) => s.infrastructure.length > 0).sort((a, b) => catRank[a.status_category] - catRank[b.status_category]);
  // Shared endpoints: identical registered measure wording used by studies of different condition sets.
  const condKey = (cs: string[]) => cs.map((c) => c.toLowerCase().trim()).sort().join("|");
  const sharedEndpoints: SharedEndpointView[] = of("outcome_measure")
    .map((o) => {
      const uses = linksOf("uses_outcome_measure").filter((l) => l.to === o.key);
      const ss = uses
        .map((l) => ({ l, s: studies.find((x) => `study:nct:${x.nct}` === l.from) }))
        .filter((x): x is { l: ResearchLink; s: StudyView } => !!x.s)
        .map(({ l, s }) => ({ nct: s.nct, label: s.label, status_label: s.status_label, conditions: s.conditions, role: l.native_evidence_type.replace("_outcome", ""), time_frame: /time frame: ([^)]+)\)/.exec(l.statement)?.[1] }));
      return { measure: o.measure, studies: ss, conditions: [...new Set(ss.flatMap((x) => x.conditions))] };
    })
    .filter((e) => e.studies.length >= 2 && new Set(e.studies.map((x) => condKey(x.conditions))).size >= 2)
    .slice(0, 6);
  const statusCounts = new Map<string, { label: string; count: number }>();
  for (const s of studies) statusCounts.set(s.status, { label: s.status_label, count: (statusCounts.get(s.status)?.count ?? 0) + 1 });

  const genes = linksOf("associated_with")
    .filter((l) => l.from === dKey)
    .map((l): GeneView | null => {
      const gr = byKey.get(l.to);
      if (!gr || gr.kind !== "gene") return null;
      return { symbol: gr.label, name: gr.name, ensembl_id: gr.ids.ensembl!, url: l.provenance[0].url, evidence_types: (l.statement.split("Evidence types: ")[1] ?? "").replace(/\.$/, "").split(", ").filter(Boolean), source_score: l.source_score };
    })
    .filter((x): x is GeneView => !!x);
  const sameGene = linksOf("gene_associated_with_other_disease");
  const sameGeneFrom = sameGene[0] ? byKey.get(sameGene[0].from) : undefined;

  const datasets = of("dataset").map((d) => ({ label: d.label, doi: d.ids.doi!, url: `https://doi.org/${d.ids.doi}`, resource_type: d.resource_type, publisher: d.publisher, year: d.year, description: d.description, subjects: d.subjects }));

  const drugs = of("drug")
    .map((d) => ({ chembl_id: d.ids.chembl!, name: d.label, drug_type: d.drug_type, stage: d.stage, url: d.provenance[0].url }))
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
    .slice(0, 10);

  // Phenotypes: keep frequency / onset / evidence; NOT annotations listed separately, never counted as shared.
  const phenoMap = new Map<string, PhenotypeView>();
  const excludedMap = new Map<string, PhenotypeView>();
  for (const l of g.links.filter((x) => (x.relation === "has_phenotype" || x.relation === "phenotype_excluded") && x.from === dKey)) {
    const ph = byKey.get(l.to);
    if (!ph || ph.kind !== "phenotype") continue;
    const target = l.relation === "phenotype_excluded" ? excludedMap : phenoMap;
    const prev = target.get(ph.key);
    const q = l.qualifiers ?? {};
    const src = [...new Set(l.provenance.map((p) => PROVIDER_NAME[p.provider]))];
    if (prev) {
      prev.frequency ??= q.frequency;
      prev.onset ??= q.onset;
      prev.sex ??= q.sex;
      prev.references ??= q.references;
      prev.diagnostic_criteria ??= q.diagnostic_criteria;
      prev.sources = [...new Set([...prev.sources, ...src])];
    } else target.set(ph.key, { hpo: ph.ids.hpo!, name: ph.label, url: `https://hpo.jax.org/browse/term/${ph.ids.hpo}`, frequency: q.frequency, onset: q.onset, sex: q.sex, references: q.references, diagnostic_criteria: q.diagnostic_criteria, sources: src });
  }
  // A feature both annotated and excluded by different sources stays in both lists, visibly.
  const freqRank = (f?: string) => (!f ? 9 : /obligate|100%/i.test(f) ? 0 : /very frequent/i.test(f) ? 1 : /^frequent/i.test(f) ? 2 : /occasional/i.test(f) ? 3 : /very rare/i.test(f) ? 4 : 5);
  const annotated = [...phenoMap.values()].sort((a, b) => freqRank(a.frequency) - freqRank(b.frequency) || a.name.localeCompare(b.name));
  const excluded = [...excludedMap.values()];

  const geneOf = (k: string) => {
    const r = byKey.get(k);
    return r && r.kind === "gene" ? r : undefined;
  };
  const causal: CausalGeneView[] = linksOf("causal_gene")
    .filter((l) => l.to === dKey)
    .flatMap((l) =>
      l.provenance.map((p) => ({ gene: geneOf(l.from)?.label ?? l.from, hgnc: geneOf(l.from)?.ids.hgnc, source: PROVIDER_NAME[p.provider], detail: l.qualifiers?.association_type ? `${l.qualifiers.association_type} (${l.qualifiers.status || "status not stated"})` : `knowledge source: ${l.qualifiers?.knowledge_source ?? "not stated"}`, url: p.url })),
    );
  const validity: ValidityView[] = linksOf("clingen_validity")
    .filter((l) => l.to === dKey)
    .map((l) => ({ gene: geneOf(l.from)?.label ?? l.from, hgnc: geneOf(l.from)?.ids.hgnc, classification: l.qualifiers?.classification ?? "", expert_panel: l.qualifiers?.expert_panel ?? "", mode_of_inheritance: l.qualifiers?.mode_of_inheritance ?? "", released: l.qualifiers?.released ?? "", url: l.provenance[0].url }));
  const dosage = linksOf("dosage_sensitivity").map((l) => ({ gene: geneOf(l.from)?.label ?? l.from, haploinsufficiency: l.qualifiers?.haploinsufficiency ?? "", triplosensitivity: l.qualifiers?.triplosensitivity ?? "", url: l.provenance[0].url }));
  const clinvar: ClinVarView[] = linksOf("variant_classified_for")
    .filter((l) => l.qualifiers?.review_status)
    .map((l) => ({ label: byKey.get(l.from)?.label ?? l.from, classification: l.qualifiers!.classification ?? "", review_status: l.qualifiers!.review_status, stars: Number(l.qualifiers!.stars ?? (/expert panel/.test(l.qualifiers!.review_status) ? 3 : 0)), conditions: l.qualifiers!.conditions, last_evaluated: l.qualifiers!.last_evaluated ?? l.qualifiers!.published, url: (l.provenance.find((p) => p.provider === "clinvar" || p.provider === "clingen") ?? l.provenance[0]).url, source: [...new Set(l.provenance.map((p) => PROVIDER_NAME[p.provider]))].join(" + ") }))
    .sort((a, b) => b.stars - a.stars);
  const models: ModelView[] = of("model").map((m) => ({ label: m.label, id: m.ids.model ?? m.key, species: m.species, disease_context: m.disease_context, source: sourcesOf(m).join(" · "), url: m.provenance[0].url }));
  const orthologs = linksOf("ortholog_of").map((l) => {
    const o = geneOf(l.from);
    return { symbol: o?.label ?? l.from, species: l.qualifiers?.species ?? o?.taxon ?? "", confidence: l.qualifiers?.confidence ?? "", url: `https://www.alliancegenome.org/gene/${l.from.replace("gene:alliance:", "")}` };
  });
  const dz = disease && disease.kind === "disease" ? disease : undefined;
  const runNotes = g.runs.flatMap((r) => r.notes.filter((n) => /CC BY|licen/i.test(n)));

  const identifiers: { system: string; id: string }[] = disease
    ? Object.entries(disease.ids)
        .filter(([, v]) => v)
        .map(([k, v]) => ({ system: k.toUpperCase(), id: k === "gard" ? `GARD:${v}` : String(v) }))
    : [];

  return {
    tier: "machine_assembled",
    eligible_for_ranking: false,
    eligible_for_action: false,
    disease: {
      id: g.disease.ontology_id ? colon(g.disease.ontology_id) : undefined,
      source_id: g.disease.ontology_id,
      label: disease?.label ?? g.disease.label,
      description: disease && disease.kind === "disease" ? disease.description : undefined,
      url: g.disease.ontology_id ? `https://platform.opentargets.org/disease/${g.disease.ontology_id}` : undefined,
      identifiers,
      synonyms: g.disease.synonyms.slice(0, 8),
      resolved: g.resolved,
    },
    match: { query: g.disease.query, exact: g.exact, alternatives: g.alternatives },
    literature: { total: g.totals.papers ?? 0, top: top.map(pv), most_cited: cited.map(pv), recent: recent.map(pv), citation: { seed: seed ? pv(seed) : undefined, citing: cites.filter((l) => l.native_evidence_type === "cites").map((l) => paper(l.from)).filter((p): p is PaperRecord => !!p).map(pv), referenced: cites.filter((l) => l.native_evidence_type === "references").map((l) => paper(l.to)).filter((p): p is PaperRecord => !!p).map(pv), citing_total: g.totals.citing_works_of_seed ?? 0 } },
    people: { researchers, institutions },
    clinical: {
      total: g.totals.studies ?? 0,
      infrastructure_total: g.totals.infrastructure_studies ?? 0,
      studies,
      groups,
      infrastructure,
      shared_endpoints: sharedEndpoints,
      status_counts: [...statusCounts.entries()].map(([status, v]) => ({ status, ...v })).sort((a, b) => b.count - a.count),
    },
    genetics: {
      gene_total: g.totals.genes ?? 0,
      genes: genes.slice(0, 12),
      variant_total: g.totals.variants ?? 0,
      variants: linksOf("variant_classified_for").map((l) => ({ label: byKey.get(l.from)?.label ?? l.from, gene: /this (\S+) variant/.exec(l.statement)?.[1], statement: l.statement, url: l.provenance[0].url })),
      gwas_total: g.totals.gwas_associations ?? 0,
      gwas: linksOf("gwas_association").map((l) => ({ label: byKey.get(l.from)?.label ?? l.from, statement: l.statement, url: l.provenance[0].url })),
    },
    assets: { dataset_total: g.totals.datasets ?? 0, datasets, reuse_leads: infrastructure },
    adjacent: {
      ontology: linksOf("subclass_of").map((l) => {
        const other = l.from === dKey ? l.to : l.from;
        const r = byKey.get(other);
        const id = other.replace("disease:", "");
        return { id: colon(id), name: r?.label ?? id, relation: l.from === dKey ? ("broader" as const) : ("narrower" as const), url: `https://platform.opentargets.org/disease/${id}` };
      }),
      same_gene: sameGeneFrom ? { gene: sameGeneFrom.label, diseases: sameGene.map((l) => ({ id: colon(l.to.replace("disease:", "")), name: byKey.get(l.to)?.label ?? l.to })) } : null,
    },
    drugs: { total: g.totals.drug_candidates ?? 0, items: drugs },
    phenotypes: { total: g.totals.phenotypes ?? 0, items: of("phenotype").map((p) => ({ id: p.ids.hpo!, name: p.label, url: p.provenance[0].url })), annotated, excluded },
    rare: {
      mappings: dz ? Object.entries(dz.ids).filter(([k, v]) => v && ["mondo", "orphanet", "omim", "gard", "efo"].includes(k)).map(([k, v]) => ({ system: k.toUpperCase(), id: k === "gard" ? `GARD:${v}` : String(v) })) : [],
      other_gene_associations: linksOf("associated_with")
        .filter((l) => l.to === dKey && l.provenance.some((p) => p.provider === "orphadata"))
        .map((l) => ({ gene: geneOf(l.from)?.label ?? l.from, detail: `${l.qualifiers?.association_type ?? ""} (${l.qualifiers?.status || "status not stated"})`, url: l.provenance[0].url })),
      mapping_basis: dz?.mapping_basis,
      natural_history: dz?.natural_history,
      epidemiology: dz?.epidemiology ?? [],
      causal_genes: causal,
      validity,
      dosage,
      clinvar: clinvar.slice(0, 10),
      clinvar_total: g.totals.clinvar_records ?? 0,
      models: models.slice(0, 12),
      orthologs: orthologs.slice(0, 8),
      licence_notes: [...new Set(runNotes)],
    },
    sources: g.runs,
    warnings: g.warnings,
    merges: g.merges,
    records: g.records,
    links: g.links,
    candidate_edges: g.links.map(toCandidateEdge).filter((e): e is EvidenceEdge => !!e),
    assembled_at: g.assembled_at,
  };
}

export class MultiProviderDiscoveryService implements DiscoveryService {
  private orchestrator: DiscoveryOrchestrator;
  constructor(opts: { providers?: ResearchProvider[]; now?: () => Date; reviewedPapers?: Map<string, string>; primaryBudgetMs?: number; dependentBudgetMs?: number } = {}) {
    this.orchestrator = new DiscoveryOrchestrator({ providers: opts.providers ?? liveProviders(), now: opts.now, reviewedPapers: opts.reviewedPapers, primaryBudgetMs: opts.primaryBudgetMs, dependentBudgetMs: opts.dependentBudgetMs });
  }
  async preview(query: string): Promise<DiscoveryOutcome> {
    const out = await this.orchestrator.assemble(query);
    if (out.kind !== "graph") return out;
    return { kind: "preview", preview: buildPreview(out.graph) };
  }
}
