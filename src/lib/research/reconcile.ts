/**
 * Provider-independent reconciliation by stable identifiers. Duplicate entities from several
 * providers collapse into one record that keeps EVERY provider's provenance.
 *
 *   papers        DOI → PMID → PMCID → OpenAlex id
 *   diseases      MONDO / EFO → Orphanet → OMIM
 *   genes         Ensembl → HGNC → approved symbol
 *   people        ORCID (or OpenAlex author id). Without ORCID: same normalized name AND an
 *                 identical normalized affiliation string. NEVER name alone.
 *   institutions  ROR
 *   studies       registry cross-references: NCT, EudraCT, EU CT (CTIS), WHO UTN, ISRCTN, DRKS, ANZCTR, CTRI, jRCT,
 *                 ChiCTR, and sponsor protocol id only together with the same sponsor. Never title / sponsor /
 *                 disease similarity: look-alikes without a shared id stay separate and are flagged POSSIBLE DUPLICATE.
 *   organizations exact normalized name (sponsors/collaborators only; never applied to people)
 *   outcomes      identical normalized measure wording (no fuzzy matching)
 *   datasets      DOI
 *   drugs         ChEMBL;  phenotypes HPO;  variants rsID
 *
 * Merging only adds provenance. It never changes review status: agreement is not review.
 */
import { normName } from "./fetch";
import type { IdSystem, PaperRecord, ProviderId, ResearchLink, ResearchRecord } from "./types";

const ID_KEYS: Partial<Record<ResearchRecord["kind"], IdSystem[]>> = {
  paper: ["doi", "pmid", "pmcid", "openalex"],
  disease: ["mondo", "efo", "orphanet", "omim"],
  model: ["model"],
  gene: ["ensembl", "hgnc", "symbol"],
  person: ["orcid", "openalex"],
  institution: ["ror"],
  // sponsor_protocol values are stored as "<normalized sponsor>|<protocol id>", so a bare protocol number never merges.
  study: ["nct", "eudract", "ctis", "utn", "isrctn", "drks", "anzctr", "ctri", "jrct", "chictr", "sponsor_protocol"],
  organization: ["orgname"],
  dataset: ["doi", "datacite"],
  drug: ["chembl"],
  phenotype: ["hpo"],
  variant: ["rsid"],
  grant: [],
};

/** Field precedence for bibliographic metadata when providers disagree. */
const PAPER_PRIORITY: ProviderId[] = ["crossref", "europepmc", "openalex"];

class DSU {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    const r = this.p.get(x)!;
    if (r === x) return x;
    const root = this.find(r);
    this.p.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(rb, ra);
  }
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

function mergeGroup(group: ResearchRecord[]): ResearchRecord {
  const [first] = group;
  const provenance = group.flatMap((r) => r.provenance).filter((p, i, a) => a.findIndex((q) => q.provider === p.provider && q.source_id === p.source_id && q.native_type === p.native_type) === i);
  const ids = Object.assign({}, ...group.map((r) => r.ids).reverse()) as ResearchRecord["ids"];
  if (first.kind === "paper") {
    const papers = group as PaperRecord[];
    const rank = (r: PaperRecord) => {
      const i = PAPER_PRIORITY.indexOf(r.provenance[0]?.provider);
      return i < 0 ? 99 : i;
    };
    const byPriority = [...papers].sort((a, b) => rank(a) - rank(b));
    const pick = <K extends keyof PaperRecord>(k: K) => byPriority.find((r) => r[k] !== undefined && r[k] !== "" && !(Array.isArray(r[k]) && (r[k] as unknown[]).length === 0))?.[k];
    const statuses = papers.map((r) => r.publication_status);
    return {
      ...byPriority[0],
      label: (pick("label") as string) ?? first.label,
      ids,
      year: pick("year") as number | undefined,
      venue: pick("venue") as string | undefined,
      // Conservative: any preprint signal wins; peer_reviewed only from a source that states it.
      publication_status: statuses.includes("preprint") ? "preprint" : statuses.includes("peer_reviewed") ? "peer_reviewed" : "unknown",
      publication_types: uniq(papers.flatMap((r) => r.publication_types)),
      open_access: papers.some((r) => r.open_access) || undefined,
      full_text_available: papers.some((r) => r.full_text_available) || undefined,
      full_text_url: pick("full_text_url") as string | undefined,
      cited_by_count: Math.max(...papers.map((r) => r.cited_by_count ?? -1)) >= 0 ? Math.max(...papers.map((r) => r.cited_by_count ?? -1)) : undefined,
      abstract: papers.find((r) => r.abstract)?.abstract,
      authors: (pick("authors") as string[]) ?? [],
      metadata_verified_by: papers.some((r) => r.metadata_verified_by === "crossref") ? "crossref" : undefined,
      update_notices: uniq(papers.flatMap((r) => r.update_notices)),
      in_reviewed_graph: papers.find((r) => r.in_reviewed_graph)?.in_reviewed_graph,
      provenance,
    };
  }
  const merged = { ...first, ids, provenance } as ResearchRecord;
  if (merged.kind === "person") {
    const ps = group as Extract<ResearchRecord, { kind: "person" }>[];
    merged.affiliations = uniq(ps.flatMap((p) => p.affiliations)).slice(0, 4);
    merged.roles = uniq(ps.flatMap((p) => p.roles));
  }
  if (merged.kind === "outcome_measure") merged.roles = uniq((group as Extract<ResearchRecord, { kind: "outcome_measure" }>[]).flatMap((o) => o.roles));
  if (merged.kind === "disease") {
    const ds = group as Extract<ResearchRecord, { kind: "disease" }>[];
    merged.synonyms = uniq(ds.flatMap((d) => d.synonyms));
    merged.description = ds.find((d) => d.description)?.description;
    merged.epidemiology = ds.find((d) => d.epidemiology?.length)?.epidemiology;
    merged.natural_history = ds.find((d) => d.natural_history)?.natural_history;
    merged.mapping_basis = ds.find((d) => d.mapping_basis)?.mapping_basis;
  }
  return merged;
}

export interface ReconcileOptions {
  /** PMIDs / DOIs already present in the reviewed bundle, mapped to their node id. */
  reviewedPapers?: Map<string, string>;
}

export function reconcile(records: ResearchRecord[], links: ResearchLink[], opts: ReconcileOptions = {}): { records: ResearchRecord[]; links: ResearchLink[]; merges: number } {
  const dsu = new DSU();
  const byId = new Map<string, string>();
  const byKey = new Map(records.map((r) => [r.key, r]));
  // Two study records with DIFFERENT primary registry ids for the same registry are different trials, whatever else they share.
  const PRIMARY: IdSystem[] = ["nct", "isrctn", "drks", "anzctr", "ctri", "jrct", "chictr", "ctis", "eudract"];
  const conflicts = (a?: ResearchRecord, b?: ResearchRecord) => !!a && !!b && a.kind === "study" && b.kind === "study" && PRIMARY.some((k) => a.ids[k] && b.ids[k] && String(a.ids[k]).toLowerCase() !== String(b.ids[k]).toLowerCase());
  for (const r of records) {
    dsu.find(r.key);
    for (const sys of ID_KEYS[r.kind] ?? []) {
      const v = r.ids[sys];
      if (!v) continue;
      const k = `${r.kind}|${sys}|${String(v).toLowerCase()}`;
      const prev = byId.get(k);
      if (prev && !conflicts(byKey.get(prev), r)) dsu.union(prev, r.key);
      else if (!prev) byId.set(k, r.key);
    }
  }
  // Conservative person merge without ORCID: same normalized name AND an identical normalized affiliation string.
  const people = records.filter((r): r is Extract<ResearchRecord, { kind: "person" }> => r.kind === "person");
  const affKey = (a: string) => normName(a);
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (a.ids.orcid && b.ids.orcid) continue; // different ORCIDs must never merge; same ORCID already merged
      if (normName(a.label) !== normName(b.label)) continue;
      const shared = a.affiliations.some((x) => b.affiliations.some((y) => affKey(x) === affKey(y) && affKey(x).length > 0));
      if (shared) dsu.union(a.key, b.key);
    }
  }

  const groups = new Map<string, ResearchRecord[]>();
  for (const r of records) {
    const root = dsu.find(r.key);
    const g = groups.get(root) ?? [];
    g.push(r);
    groups.set(root, g);
  }
  const keyMap = new Map<string, string>();
  const out: ResearchRecord[] = [];
  let merges = 0;
  for (const g of groups.values()) {
    const m = mergeGroup(g);
    // Canonical key: prefer a stable-identifier key over provider-local keys.
    const canonical = g.map((r) => r.key).sort((x, y) => keyRank(x) - keyRank(y))[0];
    m.key = canonical;
    if (m.kind === "paper" && opts.reviewedPapers) {
      const twin = [m.ids.pmid, m.ids.doi].map((x) => (x ? opts.reviewedPapers!.get(String(x).toLowerCase()) : undefined)).find(Boolean);
      if (twin) m.in_reviewed_graph = twin;
    }
    for (const r of g) keyMap.set(r.key, canonical);
    merges += g.length - 1;
    out.push(m);
  }

  // Look-alike studies that share no identifier: identical normalized title, or identical sponsor + start date.
  const studies = out.filter((r): r is Extract<ResearchRecord, { kind: "study" }> => r.kind === "study");
  for (let i = 0; i < studies.length; i++) {
    for (let j = i + 1; j < studies.length; j++) {
      const a = studies[i];
      const b = studies[j];
      const sameTitle = normName(a.label) === normName(b.label) || (!!a.official_title && normName(a.official_title) === normName(b.official_title ?? ""));
      const sameSponsorStart = !!a.sponsor && !!a.start_date && normName(a.sponsor) === normName(b.sponsor ?? "") && a.start_date === b.start_date;
      if (sameTitle || sameSponsorStart) {
        a.possible_duplicates = [...new Set([...(a.possible_duplicates ?? []), b.key])];
        b.possible_duplicates = [...new Set([...(b.possible_duplicates ?? []), a.key])];
      }
    }
  }

  const linkMap = new Map<string, ResearchLink>();
  for (const l of links) {
    const from = keyMap.get(l.from) ?? l.from;
    const to = keyMap.get(l.to) ?? l.to;
    // Classification statements from different source records (ClinVar RCV vs VCV, ClinGen VCEP) stay separate statements.
    const key = `${from}|${l.relation}|${to}${l.relation === "variant_classified_for" ? `|${l.provenance[0]?.source_id}` : ""}`;
    const prev = linkMap.get(key);
    if (!prev) linkMap.set(key, { ...l, from, to, key });
    else {
      prev.provenance = [...prev.provenance, ...l.provenance].filter((p, i, a) => a.findIndex((q) => q.provider === p.provider && q.source_id === p.source_id) === i);
      prev.discovery_lead = prev.discovery_lead && l.discovery_lead;
      // Keep every source's qualifiers (frequency, onset, review status…); the first source to state a key wins.
      if (l.qualifiers) prev.qualifiers = { ...l.qualifiers, ...(prev.qualifiers ?? {}) };
      prev.source_score ??= l.source_score;
    }
  }
  return { records: out, links: [...linkMap.values()], merges };
}

function keyRank(k: string): number {
  if (/^(paper|dataset):doi:/.test(k)) return 0;
  if (/^paper:pmid:/.test(k)) return 1;
  if (/^person:orcid:/.test(k)) return 0;
  if (/^(institution:ror|study:nct|gene:ensembl|drug:chembl|variant:rsid):/.test(k)) return 0;
  if (/^(organization|outcome|model):/.test(k)) return 0;
  if (/^disease:(MONDO|EFO)/.test(k)) return 0;
  return 5;
}
