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

## Clinical-trial discovery

- **Status is never flattened.** Every study keeps its raw `overallStatus`, and studies are grouped into four families, each with fixed guidance text:
  - **Active** (recruiting, not yet recruiting, enrolling by invitation, active not recruiting): "Potential study/research lead — verify eligibility/status with the study team."
  - **Completed**: a historical evidence or reusable-design lead. Completion does not indicate success.
  - **Caution** (terminated, withdrawn, suspended): shown with the registry's stated reason, and never presented as a positive reuse lead.
  - **Unknown**: the status hasn't been verified recently.
- **Infrastructure flags come only from registry fields:** "natural history" in the title, `patientRegistry`, an observational cohort model, a prospective longitudinal design, or biospecimen retention. Each flag records its basis.
- **Outcome measures keep the source's own wording.** A *shared endpoint lead* means the identical registered wording appears in studies of different condition sets, and it is labelled as not implying shared biology or transfer. RarePath does not classify an outcome as a biomarker or patient-reported outcome unless the source says so.
- **Trial → paper links need a stable identifier:**
  - a registry reference with a PMID, typed RESULT, DERIVED or BACKGROUND (BACKGROUND is labelled as not a result), or
  - Europe PMC's text-mined NCT accession, labelled as a mention.
- **Organizations and people stay separate.** Sponsors and collaborators are organization records with explicit relations, not investigators. Listed officials are people, merged only under the strict identity rules. Contact e-mails and phone numbers are never requested.
- **Not integrated:** WHO ICTRP (its web service requires a subscription) and EMA CTIS (no documented, versioned public API). Neither portal is scraped. Trial records keep EudraCT, CTIS and UTN secondary ids so records from those registries can collapse onto the same trial later.

## Rare-disease sources

- **Monarch v3:** disease cross-references, causal genes with their knowledge source (e.g. ClinGen, OMIM), and cross-species genotype models.
- **Orphadata (CC BY 4.0):**
  - Provides the ORPHA record, synonyms, HPO frequencies, Orphanet gene-association types, epidemiology and natural history, all verbatim.
  - The ORPHA record is tied to the MONDO disease only through a shared identifier with an Exact, validated mapping (for example GARD). A name match alone is kept as a separate, flagged record.
  - Only "Disease-causing …" gene types count as causal; modifier and susceptibility genes stay associations.
- **HPO annotations (JAX API):** frequency, onset, sex and references for the disease's OMIM and verified ORPHA ids.
  - NOT / excluded annotations (Orphanet "Excluded (0%)", HPO term HP:0040285) use a separate `phenotype_excluded` relation and are never counted as present.
  - Phenotypes are never compared by counting shared terms.
- **ClinGen:**
  - Gene-Disease Validity for the exact MONDO id is kept as its own `clingen_validity` relation, shown apart from ordinary gene associations as *EXPERT-CURATED VALIDITY*, and never feeds a score.
  - Dosage-sensitivity scores are mapped to ClinGen's own wording.
  - Expert-panel variant classifications come from the Evidence Repository.
  - The validity and dosage endpoints return full lists, so each is downloaded once per server instance per day.
- **ClinVar (E-utilities):** searched by disease name plus the causal gene; classification, review status and stars are kept.
  - The same variant from ClinVar and from Open Targets is one variant entity, but each source record's classification (aggregate VCV vs condition-specific RCV) stays a separate statement.
  - Every statement says it is not a personal interpretation.
- **Alliance:** orthologs of the causal gene, plus models for the mouse and zebrafish orthologs, all labelled *PRECLINICAL*. A genotype seen in both Monarch and Alliance is one model.
- **Merging:** when sources' statements merge, every source's qualifiers are kept; the first source to state a given qualifier wins.
- **Dependency order:** Monarch and Open Targets run first; Orphadata runs after them; HPO runs after Orphadata; ClinVar and Alliance run after the gene sources. A dependent whose upstream sources all failed or returned nothing is reported as `skipped`, never as an empty result.

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
