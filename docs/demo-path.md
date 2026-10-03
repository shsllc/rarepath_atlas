# Demo path: CDKL5 deficiency disorder (verified, Gate 3)

## The 60-second judge path

Open `/results?q=CDKL5&demo=1`. The numbered *Suggested demo path* panel links each step:

1. **Search CDKL5.** The gene resolves to CDKL5 deficiency disorder (MONDO:0100039).
2. **"Shared research infrastructure found":** CDD and Rett participants were enrolled in the same NIH-funded natural-history study (NCT02738281).
3. **Open the study:** the node view shows the NCT link, conditions (Rett, MECP2 duplication, **CDKL5 Disorder**, FOXG1), and 9 sourced relationships.
4. **Contradiction spotlight:** the historical "Atypical Rett Syndrome" label (preserved in the MONDO definition) vs. current evidence (*Lancet Neurol* 2022, *Ann Neurol* 2020).
5. **Featured reusable research:** a shared research-infrastructure precedent, in five evidence-cited lines:
   - **What happened:** CDD participants were enrolled alongside Rett, FOXG1 and MECP2 duplication.
   - **Why it matters:** sharing has already happened; the NHS consortium's experience helped build a CDD-specific severity assessment (PMID 31147226).
   - **Potentially adaptable asset:** the RTT Clinical Severity Scale was given to every participant, including CDD (median 29).
   - **Important limitation:** the scale is not established as valid for CDD; seizure frequency may raise scores; the CDD assessment still needs validation.
   - **Next research question:** how do the RTT CSS and the CDD-specific severity assessment compare in people with CDD, and could the NHS database support that comparison?
6. **Explain this connection:** the OpenAI Path Explainer returns four short parts, under 180 words.
7. **Evidence graph:** 11 entities and 15 reviewed relationships by default, with the contradicted classification drawn as a double line.
8. **End at the next research question.**

Honest negatives: "Seizure" explains that it is a symptom; off-scope terms return *No supported connection found*.

## Sources retrieved (data/real/sources.json, 22 records)

| Source | Retrieved via | Key content |
|---|---|---|
| PMID 32472944: Cutri-French et al., *Ann Neurol* 2020 (PMC8882337, DOI 10.1002/ana.25797) | E-utilities | 793 participants in the Rett and Rett-Related Disorders NHS; shared **and** distinct features; "warrant considering them as unique disorders" |
| PMC8882337 full-text excerpts (12 sentences) | E-utilities `db=pmc`; license: *available for text mining* | Recruitment through **NCT02738281**; CSS and CGI-S given to all participants; "variant RTT" nomenclature "should not be used"; CSS caveats |
| PMID 35483386: Leonard et al., *Lancet Neurol* 2022 (PMC9788833) | E-utilities | "initially considered a variant of Rett syndrome … now recognised as an independent disorder" |
| PMID 39867409: Aledo-Serrano et al., **medRxiv preprint** 2025 (PMC11759598) | E-utilities | 67 adults with CDD; CDKL5 Developmental Score; **not peer reviewed** |
| PMID 31147226: Demarest et al., *Pediatr Neurol* 2019, "Severity Assessment in CDKL5 Deficiency Disorder" (added in Gate 3; it is ref 22 of PMID 32472944) | E-utilities | 51-item CDD severity assessment "developed based on clinical and research experience from the International Foundation for CDKL5 Research Centers of Excellence consortium and the National Institutes of Health Rett and Rett-Related Disorders Natural History Study consortium"; "Refinement through ongoing validation is required" |
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

| Role | When | What it did (latest run) |
|---|---|---|
| **Evidence Extractor** | Ingestion (`extract-claims.ts`) | 8 text sources → 114 claims, all with verbatim-verified quotes. 26 corroborate analyst edges; 13 became extractor-only edges, labelled *"Found by the OpenAI Evidence Extractor … not reviewed by an analyst"* and hidden from the default graph. |
| **Entity Reconciler** | Ingestion | 79 calls mapping mentions such as "CDKL5 deficiency disorder (CDD)" to curated nodes. Only alias matches or **high-confidence** matches are used; 10 claims were rejected for lower-confidence matches. Type-aware matching stops "CDKL5" the disorder resolving to CDKL5 the gene. |
| **Path Explainer** | Runtime (*Explain this connection*) | Four parts: why it matters / what the evidence shows / what it does not show / next question. 180 words maximum, checked by `checkExplanation()` with one corrective retry; jargon and treatment-transfer phrasing are rejected. |

Run metadata (model, run id, counts) is stored in `build_info.openai_runs` and shown on the results page.

## What is sourced vs. inferred

- **Sourced (Known):** every relationship edge. Analyst-selected verbatim quotes or registry/ontology fields, re-verified on every build.
- **Extractor-only edges:** also quote-verified, but the entity mapping and predicate were chosen by the model. They are badged, and they never feed connection cards, reuse cards or actions (enforced by a test).
- **Graph default view:** only analyst-reviewed edges. AI extractions appear only when the "Include analyst-unreviewed AI extractions" filter is on, drawn faded and labelled "AI-extracted".
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

## 10× milestone

See [10x-impact.md](10x-impact.md). The claim is limited to compressing the discovery and evidence-assembly part of one milestone, and it lists the measurements needed to prove it. There are no invented time savings.

## Claims changed in Gate 3

- **Weakened:** the 2020 paper's sentence "…no direct comparison has been performed" is now quoted only as "Although they are historically linked". In context it described the situation before that paper; the Path Explainer was reading it as current fact.
- **Resolved:** the earlier gap "the CDD-specific scale referenced by the 2020 paper has not been identified" is now answered by PMID 31147226.
- **Re-checked:** the preprint (PMID 39867409) still has no peer-reviewed version in PubMed as of 2026-10-03.

## Gate 1 fixture

`data/fixtures/cdd-demo.json` is kept for development only (`DATA_BUNDLE=fixture`). It keeps all its fixture warnings and is never loaded by default.
