# Architecture

## Stack

| Choice | Why |
|---|---|
| **Next.js 15 (App Router) + TypeScript** | One process serves the UI and server-side API routes, so the OpenAI key never reaches the browser. Runs the same on Windows. Deploys to Vercel with zero config. |
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

## Modules (`src/lib/services`)

| Interface | Gate 1 implementation | Gate 2+ plan |
|---|---|---|
| `GraphService` | `JsonGraphService`: in-memory graph over a bundle | Same class, fed from `data/cache/*.json` built by providers |
| `ReusableAssetFinder` | `CuratedReusableAssetFinder` returns the curated cards but **recomputes their status from the edges** | Traversal: Disease → related Disease → Study → ResearchAsset, with OpenAI drafting the "why / differs / uncertain" text from the cited edges |
| `SearchService` | `GraphSearchService`: alias resolution, then page assembly | Add the Entity Reconciler for fuzzy matches against MONDO candidates |
| `DiseaseDataProvider` | stub | MONDO via OLS4, HPO annotations, ClinVar via E-utilities |
| `LiteratureProvider` | stub | PubMed/PMC via NCBI E-utilities |
| `TrialsProvider` | stub | ClinicalTrials.gov API v2 (no key needed) |
| `FundingResearchProvider` | stub | NIH RePORTER API v2 (no key needed) |
| `PatientOrganizationProvider` | stub | NORD and Global Genes directories plus verified org sites. Bright Data is optional. |

Stubs **throw** rather than return empty arrays, so a missing integration can never look like "no evidence found".

## OpenAI runtime roles (sponsor requirement)

All three run server-side (`src/lib/services/openai/`) through the Responses API with Zod structured outputs. The model is set by `OPENAI_MODEL` (default `gpt-5-mini`).

1. **Evidence Extractor** (`evidence-extractor.ts`): text → `ExtractedClaim[]` with a verbatim `supporting_quote`, plus `hedged` and `negated` flags. **Guard:** any claim whose quote does not appear in the source text is dropped.
2. **Entity Reconciler** (`entity-reconciler.ts`): picks among candidates supplied by the ontology providers. **Guard:** an id outside the candidate list is rejected, so the model can never invent an identifier.
3. **Path Explainer** (`path-explainer.ts`): edges → family-readable explanation plus caveats. Each step's status is passed in, and the model must flag hypotheses and disputes. **Guard:** `cited_edge_ids` is filtered to edges that were in the input.

Shared `SAFETY_RULES`: no diagnosis, no treatment advice, no clinical-equivalence claims, no claim that a therapy transfers because of a shared pathway, and no upgrading of the source's hedges.

Wiring status: the Path Explainer is live in the UI and was verified against the API in Gate 1. The Extractor and Reconciler are implemented and typechecked but are not called until providers supply text and candidates (Gate 2).

## Swapping fixtures for real data

`src/lib/services/registry.ts` is the only wiring point. In Gate 2, a script runs the providers for the chosen disease, sends abstracts and registry text through the Extractor, and writes a `GraphBundle` to `data/cache/<disease>.json` with `is_fixture: false`. The registry then loads that file. UI and API code do not change.
