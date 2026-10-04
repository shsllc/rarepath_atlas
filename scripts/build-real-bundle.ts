/**
 * Stage 3 (no network). Builds data/real/cdd-real.json from:
 *   data/real/sources.json      (Stage 1, retrieved sources)
 *   scripts/curation/cdd.ts     (analyst-selected verbatim quotes)
 *   data/real/extractions.json  (Stage 2, OpenAI claims; optional)
 * Fails loudly if any quote or identifier is not present in its source.
 *
 *   npx tsx scripts/build-real-bundle.ts
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import {
  combineStatuses,
  deriveEvidenceStatus,
  GraphBundle,
  GraphNode,
  SourceRecord,
  type BuildInfo,
  type EvidenceEdge,
  type EvidenceItem,
  type ExternalId,
  type Predicate,
  type SourceType,
} from "../src/lib/schemas";
import { ACTION_BRIEF, COLLABORATORS, CONNECTIONS, EDGES, GAPS, NODES, OPPORTUNITIES } from "./curation/cdd";

const ROOT = process.cwd();
const REAL = path.join(ROOT, "data", "real");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const SYMMETRIC: Predicate[] = ["co_studied_with", "phenotypically_overlaps", "clinically_differs_from"];

/** Allowed [subject types, object types] per predicate. Enforced on every edge. */
const SIGNATURE: Partial<Record<Predicate, [string[], string[]]>> = {
  caused_by_variant_in: [["Disease"], ["Gene"]],
  has_phenotype: [["Disease"], ["Phenotype"]],
  phenotypically_overlaps: [["Disease"], ["Disease"]],
  clinically_differs_from: [["Disease"], ["Disease"]],
  historically_classified_with: [["Disease"], ["Disease"]],
  classified_as_variant_of: [["Disease"], ["Disease"]],
  co_studied_with: [["Disease"], ["Disease"]],
  studied_in: [["Disease"], ["Study"]],
  applied_to: [["ResearchAsset"], ["Disease"]],
  informed_development_of: [["Study", "PatientOrganization", "ResearchAsset"], ["ResearchAsset"]],
  authored: [["Researcher"], ["Paper"]],
  produced_asset: [["Study"], ["ResearchAsset"]],
  investigates: [["Researcher"], ["Study"]],
  supports_community: [["PatientOrganization"], ["Disease"]],
  described_in: [["Study", "ResearchAsset", "Disease"], ["Paper"]],
};

const sources = new Map<string, SourceRecord>(
  (JSON.parse(fs.readFileSync(path.join(REAL, "sources.json"), "utf8")) as unknown[]).map((s) => {
    const r = SourceRecord.parse(s);
    return [r.id, r];
  }),
);

function src(id: string): SourceRecord {
  const s = sources.get(id);
  if (!s) throw new Error(`Unknown source record ${id}`);
  return s;
}

function sourceType(s: SourceRecord): SourceType {
  return ({ pubmed_abstract: "literature", pmc_excerpt: "literature", ctgov_record: "trial_registry", ontology_term: "ontology", gene_record: "ontology", org_homepage: "patient_org_site", funding_record: "funding_database" } as const)[s.kind];
}

function sourceName(s: SourceRecord): string {
  switch (s.kind) {
    case "pubmed_abstract": return `PubMed abstract (PMID ${s.citation.pmid})`;
    case "pmc_excerpt": return `PubMed Central full text (${s.citation.pmcid})`;
    case "ctgov_record": return `ClinicalTrials.gov (${s.citation.nct})`;
    case "ontology_term": return `${String(s.meta.ontology).toUpperCase() === "HP" ? "HPO" : "MONDO"} via EBI OLS`;
    case "gene_record": return "HGNC";
    case "funding_record": return "NIH RePORTER";
    case "org_homepage": return "Official organization website";
  }
}

function assertQuote(s: SourceRecord, quote: string, ctx: string) {
  if (!norm(s.text).includes(norm(quote))) throw new Error(`[${ctx}] quote not found verbatim in ${s.id}:\n  "${quote}"`);
}

function evidenceItem(id: string, srcId: string, quote: string, stance: EvidenceItem["stance"], method?: EvidenceItem["method"], extraction?: EvidenceItem["extraction"]): EvidenceItem {
  const s = src(srcId);
  assertQuote(s, quote, id);
  const st = sourceType(s);
  return {
    id,
    source: sourceName(s),
    source_url: s.url,
    retrieval_date: s.retrieval_date,
    source_type: st,
    evidence_type: method === "openai_extractor" ? "llm_extraction" : st === "literature" ? "direct_statement" : st === "trial_registry" ? "study_record" : "curated_annotation",
    quoted_or_structured_evidence: quote,
    citation: { ...s.citation },
    method: method ?? (st === "literature" ? "analyst_quote" : "structured_api"),
    source_record_id: s.id,
    stance,
    ...(extraction ? { extraction } : {}),
  };
}

function idUrl(system: string, id: string): string | undefined {
  const bare = id.split(":").pop()!;
  return (
    {
      MONDO: `https://monarchinitiative.org/${id}`,
      OMIM: `https://omim.org/entry/${bare}`,
      ORPHA: `https://www.orpha.net/en/disease/detail/${bare}`,
      HGNC: `https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${id}`,
      HPO: `https://hpo.jax.org/browse/term/${id}`,
      NCT: `https://clinicaltrials.gov/study/${id}`,
      PMID: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    } as Record<string, string>
  )[system];
}

// ---------- nodes ----------
const nodes: GraphNode[] = NODES.map((spec) => {
  const { ids = [], ...rest } = spec;
  const external_ids: ExternalId[] = ids.map(([system, id, srcId]) => {
    const s = src(srcId);
    const hay = `${s.title}\n${s.text}\n${JSON.stringify(s.citation)}`;
    if (!hay.includes(id)) throw new Error(`[${spec.id}] identifier ${id} not found in ${srcId}`);
    return { system, id, url: idUrl(system, id), verification: "verified" };
  });
  const extra: Record<string, unknown> = {};
  if (spec.type === "Paper") {
    const s = src(`pubmed:${(ids[0] ?? [])[1]}`);
    Object.assign(extra, {
      authors: s.authors,
      pub_date: s.pub_date,
      journal: s.journal,
      year: Number(String(s.pub_date).slice(0, 4)) || undefined,
      pmid: s.citation.pmid,
      pmcid: s.citation.pmcid,
      doi: s.citation.doi,
      publication_status: s.publication_types.includes("Preprint") ? "preprint" : s.publication_types.includes("Journal Article") ? "peer_reviewed" : "unknown",
    });
  }
  if (spec.type === "Study") {
    const s = src(`ctgov:${(ids[0] ?? [])[1]}`);
    const m = s.meta as Record<string, unknown>;
    Object.assign(extra, {
      nct: s.citation.nct,
      conditions: m.conditions,
      enrollment: m.enrollment,
      sponsor: m.sponsor,
      status: m.status,
      start_date: m.start_date,
      completion_date: m.completion_date,
    });
  }
  return GraphNode.parse({ ...rest, ...extra, external_ids, verification: "verified" });
});
const nodeIds = new Set(nodes.map((n) => n.id));
const nodeType = new Map(nodes.map((n) => [n.id, n.type as string]));
const fitsSignature = (s: string, p: Predicate, o: string) => {
  const sig = SIGNATURE[p];
  return !!sig && sig[0].includes(nodeType.get(s)!) && sig[1].includes(nodeType.get(o)!);
};

// ---------- curated edges ----------
const edges: EvidenceEdge[] = EDGES.map((e) => {
  for (const id of [e.s, e.o]) if (!nodeIds.has(id)) throw new Error(`[${e.key}] unknown node ${id}`);
  if (!fitsSignature(e.s, e.p, e.o)) throw new Error(`[${e.key}] violates ${e.p} type signature`);
  const items = e.evidence.map((ev, i) => evidenceItem(`ev:${e.key}:${i + 1}`, ev.src, ev.quote, ev.stance ?? "supports"));
  const primary = items.find((x) => x.stance === "supports") ?? items[0];
  return {
    id: `edge:${e.key}`,
    subject_id: e.s,
    predicate: e.p,
    object_id: e.o,
    source: primary.source,
    source_url: primary.source_url,
    retrieval_date: primary.retrieval_date,
    source_type: primary.source_type,
    evidence_type: primary.evidence_type,
    quoted_or_structured_evidence: primary.quoted_or_structured_evidence,
    evidence: items,
    confidence: e.confidence,
    inferred: false,
    contradiction_status: e.contradiction ?? "none",
    ...(e.contradiction_notes ? { contradiction_notes: e.contradiction_notes } : {}),
    created_at: new Date().toISOString().slice(0, 10),
  };
});

// ---------- OpenAI extractions (corroborate curated edges, or add extractor-only edges) ----------
const build_info: BuildInfo = { built_at: new Date().toISOString(), openai_runs: [] };
const extractionsFile = path.join(REAL, "extractions.json");
let corroborated = 0;
let added = 0;
let rejectedSignature = 0;
let rejectedLowConfidence = 0;
if (fs.existsSync(extractionsFile)) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const ex = JSON.parse(fs.readFileSync(extractionsFile, "utf8")) as any;
  const extraction = { model: ex.model, run_id: ex.run_id, created_at: ex.created_at };
  let n = 0;
  let totalKept = 0;
  for (const s of ex.sources as any[]) {
    for (const c of s.claims as any[]) {
      totalKept++;
      if (!c.subject_id || !c.object_id || c.negated || c.subject_id === c.object_id) continue;
      // Only exact alias matches or HIGH-confidence reconciler matches may create or corroborate edges.
      const trusted = (m: string) => m === "alias" || /^openai_reconciler:.*:high$/.test(m);
      if (!trusted(c.subject_match) || !trusted(c.object_match)) {
        rejectedLowConfidence++;
        continue;
      }
      if (!nodeIds.has(c.subject_id) || !nodeIds.has(c.object_id)) continue;
      const p = c.predicate as Predicate;
      if (!fitsSignature(c.subject_id, p, c.object_id)) {
        rejectedSignature++;
        continue;
      }
      const match = edges.find(
        (e) => e.predicate === p && ((e.subject_id === c.subject_id && e.object_id === c.object_id) || (SYMMETRIC.includes(p) && e.subject_id === c.object_id && e.object_id === c.subject_id)),
      );
      const item = evidenceItem(`ev:ai:${++n}`, s.source_id, c.supporting_quote, "supports", "openai_extractor", extraction);
      if (match) {
        if (!match.evidence.some((x) => x.method === "openai_extractor" && norm(x.quoted_or_structured_evidence) === norm(item.quoted_or_structured_evidence))) {
          match.evidence.push(item);
          corroborated++;
        }
        continue;
      }
      // Extractor-only edge: quote is verified, but entity mapping/predicate were chosen by the model.
      const key = `${c.subject_id}|${p}|${c.object_id}`;
      const existing = edges.find((e) => e.id === `edge:ai:${key}`);
      if (existing) {
        existing.evidence.push(item);
        continue;
      }
      edges.push({
        id: `edge:ai:${key}`,
        subject_id: c.subject_id,
        predicate: p,
        object_id: c.object_id,
        source: item.source,
        source_url: item.source_url,
        retrieval_date: item.retrieval_date,
        source_type: item.source_type,
        evidence_type: "llm_extraction",
        quoted_or_structured_evidence: item.quoted_or_structured_evidence,
        evidence: [item],
        confidence: c.hedged ? "low" : "moderate",
        inferred: false,
        contradiction_status: "none",
        created_at: new Date().toISOString().slice(0, 10),
      });
      added++;
    }
  }
  build_info.openai_runs.push({
    role: "Evidence Extractor + Entity Reconciler",
    model: ex.model,
    run_id: ex.run_id,
    created_at: ex.created_at,
    summary: `${ex.sources.length} sources processed; ${totalKept} quote-verified claims kept; ${ex.reconciler_calls} reconciler calls; ${corroborated} corroborations of analyst edges; ${added} extractor-only edges added; ${rejectedSignature} rejected for type-signature violations; ${rejectedLowConfidence} rejected for low-confidence entity matches.`,
  });
}

// ---------- curated layers ----------
const edgeId = (key: string) => {
  const id = `edge:${key}`;
  if (!edges.some((e) => e.id === id)) throw new Error(`Unknown edge key ${key}`);
  return id;
};
const statusOf = (ids: string[]) => combineStatuses(ids.map((id) => deriveEvidenceStatus(edges.find((e) => e.id === id)!)));

const connections = CONNECTIONS.map((c) => {
  const ids = c.edges.map(edgeId);
  return { id: c.id, disease_id: c.disease_id, connection_type: c.connection_type, why_connected: c.why_connected, evidence_edge_ids: ids, evidence_count: ids.length, confidence: c.confidence, status: statusOf(ids), key_difference: c.key_difference };
});

const opportunities = OPPORTUNITIES.map((o) => {
  const ids = o.edges.map(edgeId);
  const s = statusOf(ids);
  return {
    id: o.id,
    asset_id: o.asset_id,
    source_disease_id: o.source_disease_id,
    headline: o.headline,
    reuse_classification: o.reuse_classification,
    story: (o.story ?? []).map((st) => ({ label: st.label, text: st.text, evidence_edge_ids: st.edges.map(edgeId) })),
    why_it_may_transfer: o.why_it_may_transfer,
    what_differs: o.what_differs,
    what_is_uncertain: o.what_is_uncertain,
    requires_expert_validation: o.requires_expert_validation,
    evidence_edge_ids: ids,
    confidence: o.confidence,
    status: s === "contradictory" ? "contradictory" : "inferred", // reuse is always a hypothesis
    next_actions: o.next_actions.map((a) => ({ id: a.id, kind: a.kind, label: a.label, target_node_id: a.target_node_id, evidence_edge_ids: a.edges.map(edgeId) })),
  };
});

const gaps = GAPS.map(({ edges: keys, ...g }) => ({ ...g, related_edge_ids: keys.map(edgeId) }));

const collaborators = COLLABORATORS.map(({ edges: keys, ...c }) => {
  if (!nodeIds.has(c.node_id)) throw new Error(`Collaborator ${c.node_id} is not a node`);
  return { ...c, evidence_edge_ids: keys.map(edgeId) };
});
const line = (l: { text: string; edges: string[] }) => ({ text: l.text, evidence_edge_ids: l.edges.map(edgeId) });
const action_brief = {
  opportunity: line(ACTION_BRIEF.opportunity),
  why_surfaced: ACTION_BRIEF.why_surfaced.map(line),
  existing_assets: ACTION_BRIEF.existing_assets.map((a) => {
    if (!nodeIds.has(a.asset_id)) throw new Error(`Brief asset ${a.asset_id} is not a node`);
    return { asset_id: a.asset_id, text: a.text, evidence_edge_ids: a.edges.map(edgeId) };
  }),
  who_is_relevant: ACTION_BRIEF.who_is_relevant.map((id) => {
    if (!collaborators.some((c) => c.node_id === id)) throw new Error(`Brief references unknown collaborator ${id}`);
    return id;
  }),
  bring_sources: ACTION_BRIEF.bring_sources.map((b) => ({ label: b.label, url: b.url, evidence_edge_ids: b.edges.map(edgeId) })),
  question: line(ACTION_BRIEF.question),
  must_validate: ACTION_BRIEF.must_validate.map(line),
  does_not_mean: ACTION_BRIEF.does_not_mean.map(line),
  this_week: {
    next_step: line(ACTION_BRIEF.this_week.next_step),
    destinations: ACTION_BRIEF.this_week.destinations.map((d) => {
      if (!nodeIds.has(d.node_id)) throw new Error(`Destination ${d.node_id} is not a node`);
      return { node_id: d.node_id, why: d.why, evidence_edge_ids: d.edges.map(edgeId) };
    }),
    community_ids: ACTION_BRIEF.this_week.communities.map((id) => {
      if (!nodeIds.has(id)) throw new Error(`Community ${id} is not a node`);
      return id;
    }),
    community_evidence_edge_ids: ACTION_BRIEF.this_week.community_edges.map(edgeId),
  },
};

const bundle = GraphBundle.parse({
  bundle_id: "cdd-real-v1",
  is_fixture: false,
  focus_disease_id: "disease:cdd",
  nodes,
  edges,
  connections,
  opportunities,
  gaps,
  sources: [...sources.values()],
  build_info,
  collaborators,
  action_brief,
});

const serialized = JSON.stringify(bundle, null, 2);
if (/\[FIXTURE|demo_fixture|placeholder|unverified_fixture/.test(serialized)) throw new Error("Real bundle contains fixture markers.");
fs.writeFileSync(path.join(REAL, "cdd-real.json"), serialized + "\n");
console.log(`Built cdd-real.json: ${nodes.length} nodes, ${edges.length} edges (${corroborated} OpenAI corroborations, ${added} extractor-only edges, ${rejectedSignature} rejected by type signature, ${rejectedLowConfidence} by low-confidence entity match), ${connections.length} connections, ${opportunities.length} opportunities, ${gaps.length} gaps, ${sources.size} sources.`);
