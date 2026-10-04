/**
 * Runs the live discovery providers for one disease with provider isolation:
 * parallel calls, an independent deadline per provider, dependency-chained enrichment,
 * partial results when a source fails, and per-provider status for the UI.
 */
import { OpenTargetsClient } from "@/lib/providers/opentargets";
import { ProviderError, researchFetch, withDeadline } from "./fetch";
import { reconcile } from "./reconcile";
import type { DiseaseContext, ProviderId, ProviderResult, ResearchLink, ResearchProvider, ResearchRecord } from "./types";

export type ProviderRunStatus = "ok" | "empty" | "failed" | "skipped";
export interface ProviderRun {
  id: ProviderId;
  name: string;
  role: ResearchProvider["meta"]["role"];
  status: ProviderRunStatus;
  reason?: string;
  ms: number;
  records: number;
  totals: Record<string, number>;
  notes: string[];
}

export interface AssembledGraph {
  disease: DiseaseContext;
  resolved: boolean;
  exact: boolean;
  alternatives: { id: string; name: string }[];
  records: ResearchRecord[];
  links: ResearchLink[];
  runs: ProviderRun[];
  totals: Record<string, number>;
  merges: number;
  warnings: string[];
  assembled_at: string;
}

export type AssembleOutcome = { kind: "graph"; graph: AssembledGraph } | { kind: "no_match" } | { kind: "unavailable"; message: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ID_RE = /^(MONDO|EFO|Orphanet|HP|OTAR|DOID)[:_]\d+$/i;
const REASON: Record<string, string> = { timeout: "timed out", network: "could not be reached", http: "returned an error", invalid: "returned an unreadable response", rate_limited: "rate limit reached" };

export interface OrchestratorOptions {
  providers: ResearchProvider[];
  now?: () => Date;
  primaryBudgetMs?: number;
  dependentBudgetMs?: number;
  reviewedPapers?: Map<string, string>;
}

export class DiscoveryOrchestrator {
  private cache = new Map<string, { at: number; ttl: number; value: AssembleOutcome }>();
  private resolver = new OpenTargetsClient(researchFetch, 5_000);
  /** Last successful retrieval per provider on this server instance (for the Sources view). */
  static lastSuccess = new Map<ProviderId, string>();

  constructor(private readonly opts: OrchestratorOptions) {}

  private now() {
    return (this.opts.now ?? (() => new Date()))();
  }

  async assemble(raw: string): Promise<AssembleOutcome> {
    const query = raw.trim().slice(0, 120);
    if (query.length < 2) return { kind: "no_match" };
    const key = norm(query);
    const hit = this.cache.get(key);
    if (hit && this.now().getTime() - hit.at < hit.ttl) return hit.value;
    const value = await this.run(query);
    if (value.kind !== "unavailable") {
      const anyFailed = value.kind === "graph" && value.graph.runs.some((r) => r.status === "failed");
      if (this.cache.size > 200) this.cache.clear();
      // Partial results expire quickly so a recovered provider is retried soon.
      this.cache.set(key, { at: this.now().getTime(), ttl: anyFailed ? 5 * 60_000 : 60 * 60_000, value });
    }
    return value;
  }

  private async resolve(query: string): Promise<{ ctx: DiseaseContext | null; resolved: boolean; exact: boolean; alternatives: { id: string; name: string }[]; warning?: string }> {
    if (ID_RE.test(query)) {
      const id = query.replace(":", "_");
      try {
        const d = await this.resolver.disease(id);
        if (!d.disease) return { ctx: null, resolved: false, exact: false, alternatives: [] };
        return { ctx: { query, label: d.disease.name, ontology_id: d.disease.id, synonyms: [] }, resolved: true, exact: true, alternatives: [] };
      } catch {
        return { ctx: null, resolved: false, exact: false, alternatives: [], warning: "unavailable" };
      }
    }
    try {
      const { hits } = await this.resolver.searchDiseases(query);
      if (hits.length === 0) return { ctx: null, resolved: false, exact: false, alternatives: [] };
      const q = norm(query);
      const best = hits.find((h) => norm(h.name) === q) ?? hits[0];
      return {
        ctx: { query, label: best.name, ontology_id: best.id, synonyms: [] },
        resolved: true,
        exact: norm(best.name) === q,
        alternatives: hits.filter((h) => h.id !== best.id).slice(0, 4).map((h) => ({ id: h.id.replace("_", ":"), name: h.name })),
      };
    } catch {
      // Resolution failed: literature, trials and datasets can still be searched by the typed text.
      return { ctx: { query, label: query, synonyms: [] }, resolved: false, exact: false, alternatives: [], warning: "Disease identity could not be resolved to an ontology id (Open Targets unavailable). Results below are searched by the text you typed." };
    }
  }

  private async run(query: string): Promise<AssembleOutcome> {
    const r = await this.resolve(query);
    if (!r.ctx) return r.warning === "unavailable" ? { kind: "unavailable", message: "The public discovery sources could not be reached right now. RarePath's reviewed results are unaffected; please try again shortly." } : { kind: "no_match" };
    const ctx = r.ctx;
    const primaryBudget = this.opts.primaryBudgetMs ?? 6_000;
    const dependentBudget = this.opts.dependentBudgetMs ?? 5_000;
    const runs = new Map<ProviderId, ProviderRun>();
    const results = new Map<ProviderId, Promise<ProviderResult | null>>();

    const exec = (p: ResearchProvider): Promise<ProviderResult | null> => {
      const existing = results.get(p.meta.id);
      if (existing) return existing;
      const promise = (async () => {
        const base = { id: p.meta.id, name: p.meta.name, role: p.meta.role, notes: [] as string[] };
        if (p.needsOntologyId && !ctx.ontology_id) {
          runs.set(p.meta.id, { ...base, status: "skipped", reason: "needs a resolved ontology id", ms: 0, records: 0, totals: {} });
          return null;
        }
        const deps = (p.dependsOn ?? []).map((d) => this.opts.providers.find((x) => x.meta.id === d)).filter((x): x is ResearchProvider => !!x);
        const upstream = (await Promise.all(deps.map(exec))).flatMap((x) => x?.records ?? []);
        if (deps.length && !deps.some((d) => runs.get(d.meta.id)?.status === "ok")) {
          const anyFailed = deps.some((d) => runs.get(d.meta.id)?.status === "failed");
          runs.set(p.meta.id, { ...base, status: "skipped", reason: anyFailed ? "its upstream source was unavailable" : "its upstream sources returned nothing to build on", ms: 0, records: 0, totals: {} });
          return null;
        }
        const started = Date.now();
        try {
          const out = await withDeadline(p.run({ disease: ctx, upstream, now: () => this.now() }), deps.length ? dependentBudget : primaryBudget, p.meta.name);
          runs.set(p.meta.id, { ...base, status: out.records.length ? "ok" : "empty", ms: Date.now() - started, records: out.records.length, totals: out.totals, notes: out.notes ?? [] });
          DiscoveryOrchestrator.lastSuccess.set(p.meta.id, this.now().toISOString());
          return out;
        } catch (e) {
          const reason = e instanceof ProviderError ? (REASON[e.reason] ?? e.reason) : "failed unexpectedly";
          runs.set(p.meta.id, { ...base, status: "failed", reason, ms: Date.now() - started, records: 0, totals: {} });
          return null;
        }
      })();
      results.set(p.meta.id, promise);
      return promise;
    };

    const outs = await Promise.all(this.opts.providers.map(exec));
    const records = outs.flatMap((o) => o?.records ?? []);
    const links = outs.flatMap((o) => o?.links ?? []);
    const totals: Record<string, number> = Object.assign({}, ...outs.map((o) => o?.totals ?? {}));
    const ok = [...runs.values()].filter((x) => x.status === "ok");
    if (ok.length === 0) {
      const allFailed = [...runs.values()].every((x) => x.status !== "ok" && x.status !== "empty");
      return allFailed ? { kind: "unavailable", message: "The public discovery sources could not be reached right now. RarePath's reviewed results are unaffected; please try again shortly." } : { kind: "no_match" };
    }
    const rec = reconcile(records, links, { reviewedPapers: this.opts.reviewedPapers });
    const warnings: string[] = [];
    if (!r.resolved && r.warning) warnings.push(r.warning);
    else if (!r.exact) warnings.push(`Closest match for "${query}" in the disease ontology. Check that this is the disease you meant.`);
    for (const x of runs.values()) if (x.status === "failed") warnings.push(`${x.name} ${x.reason}; its results are not shown. Other sources are unaffected.`);
    const disease = rec.records.find((x) => x.kind === "disease" && x.key === `disease:${ctx.ontology_id}`);
    return {
      kind: "graph",
      graph: {
        disease: { ...ctx, synonyms: disease && disease.kind === "disease" ? disease.synonyms : [] },
        resolved: r.resolved,
        exact: r.exact,
        alternatives: r.alternatives,
        records: rec.records,
        links: rec.links,
        runs: this.opts.providers.map((p) => runs.get(p.meta.id)!).filter(Boolean),
        totals,
        merges: rec.merges,
        warnings,
        assembled_at: this.now().toISOString(),
      },
    };
  }
}
