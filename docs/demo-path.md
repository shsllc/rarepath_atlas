# Demo path: CDKL5 deficiency disorder (verified, Gate 2)

## The journey a judge sees

Search **CDKL5** (or "CDD", "CDKL5 deficiency disorder"). Every statement below opens to its verbatim source quote in the evidence drawer.

1. **Your disease:** CDKL5 deficiency disorder. Identifiers MONDO:0100039 and GARD:0026021 (both verified via EBI OLS); gene CDKL5 (HGNC:11411). Four sourced features: seizure, epileptic spasm, cerebral visual impairment, developmental regression. Mechanism is shown as *not described in the retrieved sources*, deliberately.
2. **Connected communities**
   - Rett syndrome, *shared research infrastructure* (**Known**): both enrolled in NCT02738281; the 2020 paper compared 793 participants head to head.
   - Rett syndrome, *historical classification* (**Contradictory**): CDD was "initially considered a variant of Rett syndrome", but that classification is superseded.
   - Rett syndrome, *important clinical differences* (**Known**): seizure onset (2 months, youngest), regression (all Rett vs. 23–34% of the others), seizures before baseline (96.2% vs. 47.5%).
   - FOXG1 disorder and MECP2 duplication syndrome: co-enrolled in the same study, with their documented differences.
3. **Reusable research** (never "Known"; each card has a conservative reuse class)
   - **Shared research-infrastructure precedent:** the Rett and Rett-Related Disorders Natural History Study (NCT02738281, RDCRN 5211, NIH U54HD061222).
   - **Potentially adaptable:** the RTT Clinical Severity Scale was administered to CDD participants (median score 29). The card also shows the authors' own caveats and the CDD-specific CDKL5 Developmental Score.
   - **Discovery lead:** the biobank of Rett and related disorders (NCT02705677), which lists CDKL5 among its conditions.
4. **Next action** (sourced): review the NCT02738281 record and the 2020 paper's methods with a CDD clinical researcher, to identify which recruitment, longitudinal-data or outcome-measure components are transferable. The 2020 authors themselves suggest comparing the CSS with a CDD-specific scale using the Natural History Study database.
5. **People & communities:** IFCR, Loulou Foundation, IRSF and the FOXG1 Research Foundation (official sites). The registry-listed PI and study director appear with no contact data. Key publications show a preprint badge where applicable.
6. **What we don't know:** seven gaps, covering mechanism, the superseded classification, data access, CSS validity in CDD, no treatment transfer, the preprint status, and count discrepancies.

Honest negatives: "Seizure" explains that it is a symptom and lists the diseases it is annotated on. Any off-scope term, for example "ketogenic diet", returns *No supported connection found*.

## Sources retrieved (data/real/sources.json, 21 records)

| Source | Retrieved via | Key content |
|---|---|---|
| PMID 32472944: Cutri-French et al., *Ann Neurol* 2020 (PMC8882337, DOI 10.1002/ana.25797) | E-utilities | 793 participants in the Rett and Rett-Related Disorders NHS; shared **and** distinct features; "warrant considering them as unique disorders" |
| PMC8882337 full-text excerpts (12 sentences) | E-utilities `db=pmc`; license: *available for text mining* | Recruitment through **NCT02738281**; CSS and CGI-S given to all participants; "variant RTT" nomenclature "should not be used"; CSS caveats |
| PMID 35483386: Leonard et al., *Lancet Neurol* 2022 (PMC9788833) | E-utilities | "initially considered a variant of Rett syndrome … now recognised as an independent disorder" |
| PMID 39867409: Aledo-Serrano et al., **medRxiv preprint** 2025 (PMC11759598) | E-utilities | 67 adults with CDD; CDKL5 Developmental Score; **not peer reviewed** |
| NCT02738281: Natural History of Rett Syndrome & Related Disorders | ClinicalTrials.gov API v2 | Conditions: Rett, MECP2 Duplication, **CDKL5 Disorder**, FOXG1; eligibility names CDKL5; 1,044 enrolled; completed 2021-07 |
| NCT02705677: Biobanking of Rett Syndrome and Related Disorders | ClinicalTrials.gov API v2 | Conditions include CDKL5; DNA/RNA/plasma/cell lines; grant U54HD061222 |
| U54HD061222: RDCRC natural-history project (FY2019 record) | NIH RePORTER API v2 | "will focus on three distinct disorders: RTT, MECP2 duplication disorder, and the RTT-related disorders including CDKL5, FOXG1" |
| MONDO:0100039, 0010726, 0100040, 0010283 | EBI OLS4 | Labels, synonyms, OMIM/Orphanet/GARD cross-references |
| HP:0001250, HP:0011097, HP:0100704, HP:0002376 | EBI OLS4 | Seizure, epileptic spasm, cerebral visual impairment, developmental regression |
| HGNC:11411 (CDKL5), HGNC:3811 (FOXG1) | HGNC REST | Approved symbols |
| cdkl5.com, louloufoundation.org, rettsyndrome.org, foxg1research.org | HTTP GET (title and meta description only) | Disease focus of each organization |

## How the dataset is built

```bash
npx tsx scripts/check-credentials.ts    # presence + minimal OpenAI/NCBI checks; never prints secrets
npx tsx scripts/fetch-sources.ts        # Stage 1: retrieve -> data/real/sources.json (no OpenAI)
npx tsx scripts/extract-claims.ts       # Stage 2: OpenAI Extractor + Reconciler -> data/real/extractions.json
npx tsx scripts/build-real-bundle.ts    # Stage 3: verify + assemble -> data/real/cdd-real.json
```

The build fails if any quote is not found verbatim in its stored source, any identifier is missing from its ontology or registry record, any edge violates its predicate's type signature, or any fixture marker appears.

## Where OpenAI is used

| Role | When | What it did in Gate 2 |
|---|---|---|
| **Evidence Extractor** | Ingestion (`extract-claims.ts`) | 7 text sources → 85 claims, all with verbatim-verified quotes (0 dropped). 27 corroborate analyst edges; 12 became extractor-only edges, labelled *"Found by the OpenAI Evidence Extractor … not reviewed by an analyst"*. |
| **Entity Reconciler** | Ingestion | 57 calls mapping mentions such as "CDKL5 deficiency disorder (CDD)" to curated nodes. Only alias matches or **high-confidence** matches are used; 16 claims were rejected for lower-confidence matches. |
| **Path Explainer** | Runtime (Explain button) | Family-readable explanation of any edge set; it must flag disputed and inferred steps and may cite only the edges it was given. |

Run metadata (model, run id, counts) is stored in `build_info.openai_runs` and shown on the results page.

## What is sourced vs. inferred

- **Sourced (Known):** every relationship edge. Analyst-selected verbatim quotes or registry/ontology fields, re-verified on every build.
- **Extractor-only edges:** also quote-verified, but the entity mapping and predicate were chosen by the model. They are badged, and they never feed connection cards, reuse cards or actions (enforced by a test).
- **Inferred:** every reuse card. A reuse opportunity is a hypothesis, so it is never shown as Known.
- **Contradictory:** the claim "CDD is a variant of Rett syndrome", which current literature contradicts.

## What the demo proves

- CDD was explicitly enrolled in shared Rett/Rett-related natural-history infrastructure: NCT02738281's conditions and eligibility, the 2020 paper's methods, and the NIH grant abstract all name it.
- That infrastructure produced a direct, cross-disorder comparison (793 participants) using a shared severity instrument.
- The same evidence documents clear differences and recommends treating CDD as a distinct disorder.
- A patient organization can go from one search to a specific, sourced next step with named institutions.

## What it does NOT prove

- That CDD and Rett syndrome share biology or mechanism. No retrieved source says so.
- That any Rett treatment, protocol or measure would work in CDD. No such claim is made.
- That the RTT Clinical Severity Scale is valid or responsive in CDD. The authors flag that seizure frequency may inflate CDD scores.
- That NHS data or biobank samples are accessible. Access terms are not in any retrieved source.
- Exact CDD enrolment counts in the NHS.

## Discrepancies and contradictions found

- **Classification (contradiction):** MONDO's definition still records eponymous "Atypical Rett Syndrome" subtypes caused by CDKL5. Current literature (PMIDs 35483386, 32472944) treats CDD as distinct. This is shown as Contradictory, with both sides visible.
- **Counts:** the registry reports 1,044 enrolled vs. 793 analysed in the paper (different data cuts), and 14 listed locations vs. 15 clinical sites described.
- **Preprint:** the PMID 39867409 figures are from a non-peer-reviewed preprint.
- **MONDO naming:** MECP2 duplication syndrome is filed under "syndromic X-linked intellectual disability Lubs type" (MONDO:0010283), with MECP2 duplication syndrome as a synonym.

## 10x milestone (to quantify in Gate 3)

Milestone: *identifying and evaluating an existing reusable natural-history study or research asset.* The traditional path is a literature review, then registry searching, then networking to learn whether CDD was ever included. RarePath Atlas gives one search, the registry and grant evidence that CDD was enrolled, the documented differences, and a named next step.

## Gate 1 fixture

`data/fixtures/cdd-demo.json` is kept for development only (`DATA_BUNDLE=fixture`). It keeps all its fixture warnings and is never loaded by default.
