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
export type StudyView = Pick<StudyRecord, "label" | "status" | "status_label" | "phases" | "study_type" | "interventions" | "sponsor" | "collaborators" | "start_date" | "completion_date" | "countries" | "enrollment"> & {
  nct: string;
  url: string;
  officials: { name: string; role: string; affiliation?: string }[];
};
export type PersonView = { key: string; name: string; orcid?: string; affiliations: string[]; records: number; roles: string[]; sources: string[] };
export type GeneView = { symbol: string; name?: string; ensembl_id: string; url: string; evidence_types: string[]; source_score?: { name: string; value: number } };

export type DiscoveryPreview = {
  tier: "machine_assembled";
  eligible_for_ranking: false;
  eligible_for_action: false;
  disease: { id?: string; source_id?: string; label: string; description?: string; url?: string; identifiers: { system: string; id: string }[]; synonyms: string[]; resolved: boolean };
  match: { query: string; exact: boolean; alternatives: { id: string; name: string }[] };
  literature: { total: number; top: PaperView[]; most_cited: PaperView[]; recent: PaperView[]; citation: { seed?: PaperView; citing: PaperView[]; referenced: PaperView[]; citing_total: number } };
  people: { researchers: PersonView[]; institutions: { label: string; ror: string; country?: string; people: number }[] };
  clinical: { total: number; studies: StudyView[]; status_counts: { status: string; label: string; count: number }[] };
  genetics: { gene_total: number; genes: GeneView[]; variant_total: number; variants: { label: string; gene?: string; statement: string; url: string }[]; gwas_total: number; gwas: { label: string; statement: string; url: string }[] };
  assets: { dataset_total: number; datasets: { label: string; doi: string; url: string; resource_type: string; publisher?: string; year?: number; description?: string; subjects: string[] }[]; reuse_leads: StudyView[] };
  adjacent: { ontology: { id: string; name: string; relation: "broader" | "narrower"; url: string }[]; same_gene: { gene: string; diseases: { id: string; name: string }[] } | null };
  drugs: { total: number; items: { chembl_id: string; name: string; drug_type?: string; stage: string; url: string }[] };
  phenotypes: { total: number; items: { id: string; name: string; url: string }[] };
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
  const studies = of("study").map(
    (s): StudyView => ({
      nct: s.ids.nct!,
      url: `https://clinicaltrials.gov/study/${s.ids.nct}`,
      label: s.label,
      status: s.status,
      status_label: s.status_label,
      phases: s.phases,
      study_type: s.study_type,
      interventions: s.interventions,
      sponsor: s.sponsor,
      collaborators: s.collaborators,
      start_date: s.start_date,
      completion_date: s.completion_date,
      countries: s.countries,
      enrollment: s.enrollment,
      officials: officials(s.key),
    }),
  );
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
  const reuse = studies.filter((s) => /natural history|registry|biobank|cohort|biorepository/i.test(s.label));

  const drugs = of("drug")
    .map((d) => ({ chembl_id: d.ids.chembl!, name: d.label, drug_type: d.drug_type, stage: d.stage, url: d.provenance[0].url }))
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage))
    .slice(0, 10);

  const identifiers: { system: string; id: string }[] = disease
    ? Object.entries(disease.ids)
        .filter(([, v]) => v)
        .map(([k, v]) => ({ system: k.toUpperCase(), id: String(v) }))
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
    clinical: { total: g.totals.studies ?? 0, studies, status_counts: [...statusCounts.entries()].map(([status, v]) => ({ status, ...v })).sort((a, b) => b.count - a.count) },
    genetics: {
      gene_total: g.totals.genes ?? 0,
      genes: genes.slice(0, 12),
      variant_total: g.totals.variants ?? 0,
      variants: linksOf("variant_classified_for").map((l) => ({ label: byKey.get(l.from)?.label ?? l.from, gene: /this (\S+) variant/.exec(l.statement)?.[1], statement: l.statement, url: l.provenance[0].url })),
      gwas_total: g.totals.gwas_associations ?? 0,
      gwas: linksOf("gwas_association").map((l) => ({ label: byKey.get(l.from)?.label ?? l.from, statement: l.statement, url: l.provenance[0].url })),
    },
    assets: { dataset_total: g.totals.datasets ?? 0, datasets, reuse_leads: reuse },
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
    phenotypes: { total: g.totals.phenotypes ?? 0, items: of("phenotype").map((p) => ({ id: p.ids.hpo!, name: p.label, url: p.provenance[0].url })) },
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
