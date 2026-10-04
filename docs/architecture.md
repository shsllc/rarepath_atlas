# Architecture

## Stack

| Choice | Why |
|---|---|
| **Next.js 15 (App Router) + TypeScript** | One process serves the UI and server-side API routes, so the OpenAI key never reaches the browser. Runs the same on Windows. Deployed on Netlify (Next.js/OpenNext runtime) with zero config. |
| **Zod** | One schema gives runtime validation of JSON bundles, TypeScript types, *and* OpenAI Structured Outputs (`zodTextFormat`). |
| **JSON bundles on disk** (`data/fixtures`, later `data/cache`) | No database to provision. Fixture data and live data share the `GraphBundle` format, so real data can replace fixtures incrementally. |
| **Tailwind CSS v4** | Fast, consistent layout with no design-system overhead. |
| **Vitest** | Fast tests for data contracts and evidence rules. |
| **Cytoscape.js** (Gate 3) | Graph view. Supports per-edge line styles (solid, dashed, double, dotted) to match the four evidence statuses. Not installed yet. |

Deliberately left out: auth, accounts, a database, queues, voice, admin.

## Request flow

```
Browser ──GET /results?q=──▶ results/page.tsx (server component)
                                 │
                                 ▼
                       registry.getServices()
                                 │
         ┌───────────────────────┼─────────────────────────┐
         ▼                       ▼                         ▼
   GraphService           ReusableAssetFinder        SearchService
 (JsonGraphService)  (CuratedReusableAssetFinder)  (GraphSearchService)
         │                       │                         │
         └──── data/fixtures/cdd-demo.json (Zod-validated GraphBundle)
                                 │
                                 ▼
                    SearchResult ──▶ ResultsView (client)
                                       └─ EvidenceDrawer ──POST /api/explain──▶ OpenAIPathExplainer
```

## Modules

| Module | Implementation |
|---|---|
| `GraphService` | `JsonGraphService`: in-memory graph over a Zod-validated bundle (`data/real/cdd-real.json` by default) |
| `ReusableAssetFinder` | `CuratedReusableAssetFinder` returns the curated cards and **recomputes every status from the edges**; reuse cards are never "Known" |
| `SearchService` | `GraphSearchService`: alias resolution, then page assembly; honest not-found for anything off-scope |
| `LiteratureProvider` | `PubMedProvider`: E-utilities esummary/efetch; PMC excerpts only when the license permits text mining |
| `TrialsProvider` | `ClinicalTrialsGovProvider`: API v2; renders the record as labelled text so quotes can be verified |
| `FundingResearchProvider` | `NihReporterProvider`: RePORTER v2, with deterministic sub-project selection |
| `OntologyProvider` | `OlsOntologyProvider`: MONDO/HPO via EBI OLS4, genes via HGNC REST |
| `PatientOrganizationProvider` | `HomepageOrgProvider`: reads the title and meta description only, with no crawling. Bright Data is unused. |

Providers live in `src/lib/providers/` and share a polite fetch helper (`http.ts`). It spaces calls per host (NCBI: 10 req/s with a key, 3 req/s without) and retries on 429 and 5xx responses.

## Ingestion pipeline (offline, `scripts/`)

1. `fetch-sources.ts` retrieves sources into `data/real/sources.json`.
2. `extract-claims.ts` runs the OpenAI Extractor and Reconciler into `data/real/extractions.json`. It refuses to run unless the key comes from `.env.local`.
3. `build-real-bundle.ts` merges the analyst curation (`scripts/curation/cdd.ts`) with the OpenAI claims. It verifies every quote, identifier and predicate type signature, then writes `data/real/cdd-real.json`.

`scripts/load-env.ts` gives `.env.local` precedence for scripts. `src/lib/services/openai/client.ts` does the same at runtime.

## OpenAI runtime roles (sponsor requirement)

All three run server-side (`src/lib/services/openai/`) through the Responses API with Zod structured outputs. The model is set by `OPENAI_MODEL` (default `gpt-5-mini`).

1. **Evidence Extractor** (`evidence-extractor.ts`): text → `ExtractedClaim[]` with a verbatim `supporting_quote`, plus `hedged` and `negated` flags. **Guard:** any claim whose quote does not appear in the source text is dropped.
2. **Entity Reconciler** (`entity-reconciler.ts`): picks among candidates supplied by the ontology providers. **Guard:** an id outside the candidate list is rejected, so the model can never invent an identifier.
3. **Path Explainer** (`path-explainer.ts`): edges → family-readable explanation plus caveats. Each step's status is passed in, and the model must flag hypotheses and disputes. **Guard:** `cited_edge_ids` is filtered to edges that were in the input.

Shared `SAFETY_RULES`: no diagnosis, no treatment advice, no clinical-equivalence claims, no claim that a therapy transfers because of a shared pathway, and no upgrading of the source's hedges.

Wiring status: the Path Explainer is live in the UI. The Extractor and Reconciler ran during Gate 2 ingestion; their run metadata is stored in `build_info.openai_runs`.

## Multi-provider discovery layer (live, `src/lib/research/`)

For a disease outside the reviewed slice, search falls through to a machine-assembled discovery layer:

```
query ──▶ reviewed graph (always first; reviewed matches never call an API)
            │ no reviewed match
            ▼
   Open Targets search ── resolves to a MONDO/EFO id (if unavailable: text search, labelled)
            │
            ▼  parallel, independent deadline per provider (6 s), partial results allowed
 Open Targets │ GWAS Catalog │ ClinicalTrials.gov │ Europe PMC │ DataCite
            │
            ▼  dependency-chained enrichment of Europe PMC papers (5 s)
         OpenAlex (citations, ORCID, ROR, funders) │ Crossref (DOI verification, retraction/correction notices)
            │
            ▼
   reconcile(): merge by stable identifiers only, keep every provider's provenance
            │
            ▼
   DiscoveryPreview: identity, literature, people, clinical research, genetics, research assets,
   adjacent research. Every section is labelled
   MACHINE-ASSEMBLED DISCOVERY · NOT YET REVIEWED FOR RANKING OR ACTION
```

- **Contract** (`types.ts`): every provider returns normalized `ResearchRecord`s (disease, gene, variant, phenotype, paper, person, institution, study, grant, dataset, drug) and `ResearchLink`s.
  - Each record and link carries `provenance[]`: provider, source id, canonical URL, retrieval timestamp and the source's own record type.
  - Each is fixed to `review_status: "machine_assembled"`, `eligible_for_ranking: false` and `eligible_for_action: false`.
  - Provider scores are kept as a labelled `source_score` and are never mapped onto RarePath's review status or Research Connection Strength.
- **Adding a provider**: implement `ResearchProvider` (`meta`, optional `dependsOn` / `needsOntologyId`, `run(ctx)`) and add it to `registry.ts`. The orchestrator handles timeouts, dependencies, status and caching.
- **Isolation** (`orchestrator.ts`):
  - Providers run in parallel, each with its own deadline.
  - A failed provider is reported (`failed`, with a reason) while the rest still render; providers that depend on it are `skipped`.
  - If Open Targets cannot resolve the disease, the text-based providers still run and the preview says so.
  - Results are cached per server instance for 1 hour, or 5 minutes when any provider failed.
- **Reconciliation** (`reconcile.ts`):
  - Papers merge on DOI, then PMID, then PMCID, then OpenAlex id.
  - Diseases merge on MONDO/EFO, then Orphanet, then OMIM.
  - Genes merge on Ensembl, then HGNC, then gene symbol.
  - People merge on ORCID (or OpenAlex author id). Without one, they merge only on the same normalized name *and* an identical affiliation, never on name alone.
  - Institutions merge on ROR, studies on NCT ID, datasets on DOI.
  - Preprint status is conservative: any preprint signal wins. Papers already in the reviewed bundle are flagged, not duplicated.
- **API etiquette**:
  - Requests carry an identifying User-Agent, plus a `mailto` for the OpenAlex and Crossref polite pools (from `NCBI_EMAIL` when set).
  - Each disease costs at most 3 OpenAlex calls and 5 Crossref lookups, with no retries at runtime.
  - OpenAlex's keyless access has a small daily budget; `OPENALEX_API_KEY` is used if present.

## Review / decision boundary

```
STRUCTURED PROVIDERS ─▶ NORMALIZED DISCOVERY GRAPH ─▶ (offline) OpenAI Evidence Extractor on open-access full text
        ─▶ Entity Reconciler ─▶ MACHINE-ASSEMBLED CANDIDATE EDGES (toCandidateEdge)
══════════════════ review boundary: an analyst, never an API or a model ══════════════════
        ─▶ REVIEWED GRAPH (data/real) ─▶ DETERMINISTIC ANALYTICS ─▶ RESEARCH ACTION BRIEF
```

- **One gate decides eligibility:** `isReviewedEvidenceEdge()` in `src/lib/graph-view.ts`. Research Connection Strength, the coverage tiers and the brief's evidence links all pass through it, and AI-only and machine-assembled edges always fail it.
- **Candidate edges stay machine-assembled:** `toCandidateEdge()` converts discovery links into the reviewed graph's edge format but sets `confidence: "insufficient"`, so no view can show them as Known.
- **The extraction bridge stays outside the boundary:** `scripts/discover-candidates.ts` runs the OpenAI Evidence Extractor over a discovered open-access paper and writes `data/candidates/<disease>.json`, still machine-assembled.
- Agreement between providers, or between a provider and the model, never makes anything reviewed.
