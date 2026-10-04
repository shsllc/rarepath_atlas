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
