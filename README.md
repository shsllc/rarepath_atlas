# RarePath Atlas

**Rare shouldn't mean researching alone.** RarePath connects scattered disease research, patient communities, studies and reusable research infrastructure, with evidence behind every connection.

Hack-Nation 7th Global AI Hackathon · Challenge 05: Buffalo Initiative × OpenAI, *AI Atlas for the World's Rare Diseases*.

## The problem

Rare-disease patient organizations often have to do their own research. They search PubMed, trial registries, ontologies and funding databases one at a time, trying to learn whether another community has already built something they could learn from. The key facts are scattered across registry eligibility fields, methods sections and grant abstracts, and old disease names can point in the wrong direction.

## What RarePath does

Search a disease, gene, alias or identifier (e.g. `CDKL5`, `STK9`, `MONDO:0100039`). RarePath shows:

1. **Research connection strength (graph analytics):** a transparent ranking of neighbouring communities. It shows why each one ranked and what limits the connection, uses reviewed evidence only, and finds research hubs (a study linking several disorder communities). It is not a similarity score.
2. **Reusable research:** natural-history infrastructure, outcome measures and biobanks, each classified cautiously (*shared-infrastructure precedent*, *potentially adaptable*, *discovery lead*). These are never shown as established fact.
3. **Who is relevant:** investigators and organizations tied to the evidence path, from public registry and PubMed author metadata. No contact details are stored, and relevance does not imply willingness.
4. **Research Action Brief:** the opportunity, why it surfaced, existing assets, who is relevant, sources to bring, the question to ask, what must be validated, and what it does not mean.
5. **What it does not mean:** differences, contradictions and open questions, shown next to every connection.

Every claim opens to its **verbatim source quote**, with a link and retrieval date.

## Demo

- **Production:** https://rarepathatlas.netlify.app
- **Canonical 60-second demo:** https://rarepathatlas.netlify.app/results?q=CDKL5&demo=1
- **Deployment:** Netlify + Next.js (OpenNext runtime)
- **Repository:** https://github.com/shsllc/rarepath_atlas

## Why this example matters

**CDKL5 deficiency disorder (CDD)** was once labelled a variant of Rett syndrome. It is now recognised as a distinct disorder. Even so, people with CDD were **enrolled in the same NIH-funded Rett and Rett-Related Disorders Natural History Study** (ClinicalTrials.gov NCT02738281; 793 participants compared in PMID 32472944). That consortium's experience then **informed a CDD-specific severity assessment** (PMID 31147226).

That is a real precedent for cross-disease research reuse. RarePath also says plainly that it is **not** evidence of shared biology, and that nothing here suggests Rett treatments carry over to CDD.

## Built with OpenAI

| Role | When | What it does | Guardrail |
|---|---|---|---|
| **Evidence Extractor** | Ingestion | Extracts biomedical claims from retrieved abstracts, PMC excerpts, registry records and grant text (114 claims from 8 sources) | A claim is kept only if its quote appears **verbatim** in the stored source text |
| **Entity Reconciler** | Ingestion | Maps mentions like "CDKL5 deficiency disorder (CDD)" to curated entities | Can only choose supplied candidates; type-aware; only high-confidence matches are used |
| **Path Explainer** | Live, *Explain this connection* | A four-part plain-language explanation: why it matters, what the evidence shows, what it does not show, next question | 180 words maximum; rejects treatment-transfer phrasing; explains only relationships already in the graph; rate-limited and cached |

The sourced journey works even if OpenAI is unavailable. The explanation then shows a calm error with a retry, and the evidence is unchanged.

## Evidence integrity

- **Verbatim quote checks:** the dataset build fails if any quote is not found in its stored source text.
- **Source provenance:** every relationship records its source, URL, retrieval date, how the evidence was obtained (registry/ontology API, analyst-selected quote, or OpenAI extraction) and its stance (supports / contradicts / limitation).
- **Reviewed vs. unreviewed AI claims:** 13 OpenAI-only relationships are quote-verified but not analyst-reviewed. They are hidden by default and labelled "AI-extracted" when shown.
- **Contradictions:** the superseded "Rett variant" classification is shown as **Contradictory**, with the historical label next to the current evidence.
- **Uncertainty:** reuse cards are always "AI-inferred"; a "What we don't know" section lists gaps; the preprint is flagged.
- **Collaborators:** registry investigators are linked to papers only where name **and** institution match the PubMed author metadata.
- **Analytics:** the ranking formula is visible on the page, and AI-only edges, inferred links and contradicted links add no points.
- **Audit:** [docs/final-evidence-audit.md](docs/final-evidence-audit.md) (10/10 checks pass). There are 79 automated tests. Challenge coverage: [docs/challenge-criteria-audit.md](docs/challenge-criteria-audit.md).

## Run locally

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
# set OPENAI_API_KEY (and optionally OPENAI_MODEL, NCBI_API_KEY, NCBI_EMAIL)
npm run dev                  # http://localhost:3000/results?q=CDKL5&demo=1
```

Checks:

```bash
npm run typecheck
npm test
npm run build
npx tsx scripts/audit-evidence.ts
```

Rebuild the dataset (optional):

```bash
npx tsx scripts/fetch-sources.ts
npx tsx scripts/extract-claims.ts
npx tsx scripts/build-real-bundle.ts
```

## Architecture

- **Next.js 15 + TypeScript + Tailwind**, deployed on Netlify (Next.js/OpenNext runtime). OpenAI is called only from server routes.
- **Zod** schemas for entities and evidence-bearing relationships (`src/lib/schemas`).
- **Offline pipeline** (`scripts/`): fetch sources, then OpenAI extraction and reconciliation, then a verified build of `data/real/cdd-real.json`.
- **Cytoscape.js** evidence graph. Line style encodes status: solid = Known, dashed = AI-inferred, double = Contradictory, dotted = Unknown.
- Details: [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md).

## Prototype benchmark

In one exploratory run ([docs/benchmark.md](docs/benchmark.md)), finding the shared infrastructure, the resulting asset and their sources took **93 s, 3 searches, 3 systems and 5 evidence pages manually**, versus **22 s, 1 search and 1 click in RarePath**: about 4× in time and 5× in evidence-opening steps. This measures discovery and evidence assembly only, the manual run was done with prior knowledge, and it is **not** a 10× result.

## Limitations

- One fully reviewed journey (CDKL5 deficiency disorder). Other diseases get a machine-assembled discovery preview whose coverage depends on what the public sources hold; it is not complete coverage of the literature or of rare diseases.
- OpenAlex keyless access has a small daily budget shared per IP; when it runs out, the citation-network section is shown as unavailable.
- Research navigation only: no diagnosis, no treatment recommendations, no clinical-equivalence claims.
- The RTT Clinical Severity Scale is not established as valid in CDD; the CDD-specific assessment still needs validation.
- PMID 39867409 is a preprint. Access terms for the study database and biobank are not stated in the sources.
- Rate limiting and the explanation cache are in-memory per serverless instance, so they reset on cold starts. That is fine for a demo, but it is not a production gateway.
- Live explanations are capped at about 18 seconds per OpenAI call to stay inside the hosting gateway timeout.

## Research sources

RarePath has two evidence tiers:

- **Reviewed evidence** (the CDKL5 journey) was retrieved offline, stored verbatim and analyst-reviewed. Only it can drive Research Connection Strength, reusable-asset recommendations and the Research Action Brief.
- **Discovery evidence** is assembled live from structured research APIs for any disease outside the reviewed slice. It is labelled *machine-assembled* and never drives scoring or actions.

| Source | Data used | Mode | Tier |
|---|---|---|---|
| Open Targets Platform (GraphQL v4) | Disease resolution (MONDO/EFO), genes/targets with evidence types, ClinVar variants, recorded drug candidates, ontology neighbours, HPO phenotypes | Live | Discovery |
| GWAS Catalog (REST v2) | Trait associations, variants, mapped genes, studies | Live | Discovery |
| ClinicalTrials.gov (API v2) | Studies grouped by explicit status (active / completed / caution), design, typed interventions, outcome measures with time frames, sponsors vs collaborators vs listed officials, age/sex, sites, results-posted flag, protocol/SAP documents, RESULT/DERIVED/BACKGROUND references, natural-history/registry/cohort/biobank flags, shared-endpoint leads | Live (offline for the reviewed records) | Discovery / reviewed |
| Europe PMC accession index | Papers that mention a registered NCT id (trial → paper leads) | Live | Discovery |
| ISRCTN registry (official API; CC BY / CC0) | UK and international trials with NCT / EudraCT / IRAS / sponsor-protocol cross-references, design, outcomes, sponsors and funders (ROR), countries and centres | Live | Discovery |
| EU Clinical Trials Register (EudraCT, EMA) | Legacy EU/EEA trials with per-country status, sponsor protocol, MedDRA condition (official summary download, one page per search, acknowledged) | Live, cached | Discovery |
| Monarch Initiative (v3) | Disease identity and cross-references, curated causal genes with knowledge source, cross-species disease models | Live | Discovery |
| Orphadata (Orphanet API, CC BY 4.0) | ORPHA codes and validated mappings, synonyms, HPO phenotypes with frequency (incl. excluded), gene associations by Orphanet type, epidemiology, natural history | Live | Discovery |
| HPO annotations (JAX API) | Disease → HPO terms with frequency, onset, sex, references | Live | Discovery |
| ClinGen | Gene-Disease Validity (expert classification), Dosage Sensitivity, expert-panel variant classifications | Live (lists cached 24 h per instance) | Discovery |
| ClinVar (E-utilities) | Variant classifications with review status (stars), conditions, last evaluated | Live | Discovery |
| Alliance of Genome Resources | Orthologs, experimental disease models (preclinical) | Live | Discovery |
| Europe PMC | Papers (PMID/PMCID/DOI), abstracts, preprint status, authors + ORCID, grants, open-access full text | Live | Discovery |
| OpenAlex | Citing/referenced works, authors (ORCID), institutions (ROR), funders, venues | Live | Discovery |
| Crossref | DOI metadata verification, ORCIDs, funders, retraction/correction notices | Live | Metadata only |
| DataCite | DOI-registered datasets and collections, creators (ORCID), ROR affiliations, funders | Live | Discovery |
| PubMed / PMC (E-utilities), MONDO/HPO (OLS4), HGNC, NIH RePORTER, patient-org sites | Sources of the reviewed CDKL5 journey | Offline | Reviewed |
| DisGeNET | Gene-disease associations | Not integrated: requires a registered account and licence tier. | — |
| WHO ICTRP, EMA CTIS, DDrare, other national registries | International trial registrations | Not integrated. ICTRP is available with approval (fee on request, no commercial use) and its crawling service is unavailable. CTIS's API is undocumented. DDrare requires permission. jRCT prohibits automated download, and ANZCTR blocks automated clients. Nothing is scraped. See [docs/global-trial-strategy.md](docs/global-trial-strategy.md). | — |

- **Deduplication:**
  - Records merge only on stable identifiers: DOI, PMID, PMCID, MONDO/EFO, Ensembl/HGNC, ORCID, ROR, NCT ID or dataset DOI.
  - People without an ORCID merge only on the same name *and* an identical affiliation, never on name alone.
  - A merged record keeps every contributing source.
- **Why discovery evidence cannot drive scoring or actions:**
  - A single gate (`isReviewedEvidenceEdge`) feeds ranking, coverage and the brief, and every machine-assembled edge fails it by construction.
  - Tests inject forged discovery edges and confirm that the ranking, tiers and opportunities don't change.
- **Resilience:**
  - Providers run in parallel with independent timeouts.
  - A failing source is shown as unavailable while the rest still render.
  - The reviewed CDKL5 journey never depends on these providers.
- **More detail:** [docs/architecture.md](docs/architecture.md), and the `/sources` page in the product.

## Deploy

Deployed on **Netlify** from `shsllc/rarepath_atlas` (`main`). Netlify auto-detects Next.js, and the build command is `next build`.

- **Runtime environment variables:** `OPENAI_API_KEY` and `OPENAI_MODEL` (`gpt-5-mini`), server-side only, with no `NEXT_PUBLIC_` prefix.
- **Optional in production:** `NCBI_EMAIL` (contact address for the OpenAlex/Crossref polite pools) and `OPENALEX_API_KEY`. `NCBI_API_KEY` is used only by the offline ingestion scripts. Discovery needs no keys.
- **No ingestion at deploy time:** the verified dataset (`data/real/cdd-real.json`) is committed and bundled with the server functions.

## Submission docs

[60-second script](docs/demo-script-60s.md) · [shot list](docs/demo-shot-list.md) · [technical video outline](docs/technical-video-outline.md) · [10× case](docs/10x-impact.md) · [benchmark](docs/benchmark.md) · [challenge-criteria audit](docs/challenge-criteria-audit.md) · [submission checklist](docs/submission-checklist.md)
