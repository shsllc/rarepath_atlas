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
 *   studies       NCT
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
  gene: ["ensembl", "hgnc", "symbol"],
  person: ["orcid", "openalex"],
  institution: ["ror"],
  study: ["nct"],
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
  if (merged.kind === "disease") merged.synonyms = uniq((group as Extract<ResearchRecord, { kind: "disease" }>[]).flatMap((d) => d.synonyms));
  return merged;
}

export interface ReconcileOptions {
  /** PMIDs / DOIs already present in the reviewed bundle, mapped to their node id. */
  reviewedPapers?: Map<string, string>;
}

export function reconcile(records: ResearchRecord[], links: ResearchLink[], opts: ReconcileOptions = {}): { records: ResearchRecord[]; links: ResearchLink[]; merges: number } {
  const dsu = new DSU();
  const byId = new Map<string, string>();
  for (const r of records) {
    dsu.find(r.key);
    for (const sys of ID_KEYS[r.kind] ?? []) {
      const v = r.ids[sys];
      if (!v) continue;
      const k = `${r.kind}|${sys}|${String(v).toLowerCase()}`;
      const prev = byId.get(k);
      if (prev) dsu.union(prev, r.key);
      else byId.set(k, r.key);
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

  const linkMap = new Map<string, ResearchLink>();
  for (const l of links) {
    const from = keyMap.get(l.from) ?? l.from;
    const to = keyMap.get(l.to) ?? l.to;
    const key = `${from}|${l.relation}|${to}`;
    const prev = linkMap.get(key);
    if (!prev) linkMap.set(key, { ...l, from, to, key });
    else {
      prev.provenance = [...prev.provenance, ...l.provenance].filter((p, i, a) => a.findIndex((q) => q.provider === p.provider && q.source_id === p.source_id) === i);
      prev.discovery_lead = prev.discovery_lead && l.discovery_lead;
    }
  }
  return { records: out, links: [...linkMap.values()], merges };
}

function keyRank(k: string): number {
  if (/^(paper|dataset):doi:/.test(k)) return 0;
  if (/^paper:pmid:/.test(k)) return 1;
  if (/^person:orcid:/.test(k)) return 0;
  if (/^(institution:ror|study:nct|gene:ensembl|drug:chembl|variant:rsid):/.test(k)) return 0;
  if (/^disease:(MONDO|EFO)/.test(k)) return 0;
  return 5;
}
