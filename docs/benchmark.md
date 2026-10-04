# Prototype benchmark: discovery and evidence assembly

**Scope:** this measures **discovery and evidence assembly only**. It does **not** measure treatment development, scientific validation, clinical research duration or drug development.

## Task

Starting only with **"CDKL5 deficiency disorder"**, find:

1. evidence of shared research infrastructure with another rare-disease community,
2. a resulting or related reusable research asset, and
3. the sources supporting those claims.

## Method

Run on 2026-10-03 by an AI agent driving a real browser, with elapsed time taken from system timestamps.

### A. Manual (ordinary public tools)

| # | Action | System |
|---|---|---|
| 1 | Search "CDKL5 deficiency disorder" (351 results) | PubMed |
| 2 | Open the top review (PMID 35483386): it covers the Rett history but not shared infrastructure | PubMed |
| 3 | Search "CDKL5 Rett natural history study" (19 results) | PubMed |
| 4 | Open PMID 32472944: "793 individuals enrolled in the Rett and Rett-Related Disorders Natural History Study" | PubMed |
| 5 | Search "Rett natural history" | ClinicalTrials.gov |
| 6 | Open NCT02738281: conditions list "CDKL5 Disorder" | ClinicalTrials.gov |
| 7 | Open the PMC full text of 32472944; find "one has been developed for CDD" (ref 22) | PubMed Central |
| 8 | Open ref 22, PMID 31147226: the severity assessment was "developed based on … the National Institutes of Health Rett and Rett-Related Disorders Natural History Study consortium" | PubMed |

**Result:** 93 seconds · 3 searches · 3 source systems · 5 evidence pages opened, plus in-page lookups.

### B. RarePath

| # | Action |
|---|---|
| 1 | Type "CDKL5 deficiency disorder" on the home page and press Enter. "Shared research infrastructure found" appears, and the featured card shows NCT02738281 and the severity-assessment link. |
| 2 | Click **Evidence** on *Why it matters*. The drawer shows the verbatim quotes and links to NCT02738281, PMID 32472944, PMID 31147226 and NIH RePORTER. |

**Result:** 22 seconds · 1 search · 1 system · 1 evidence click.

## Result

| Measure | Manual | RarePath | Ratio |
|---|---|---|---|
| Elapsed time | 93 s | 22 s | **4.2×** |
| Searches | 3 | 1 | 3× |
| Source systems touched | 3 | 1 | 3× |
| Evidence-opening steps | 5 | 1 | 5× |

**In this prototype benchmark, RarePath reduced the evidence-discovery portion of this task by about 4×, not 10×.** We report it as measured.

## Why this is not (yet) a 10× result, and what would need to improve

- **The manual run was biased toward speed.** The operator already knew the answer. A first-time searcher would face 351 PubMed results without knowing that "natural history study" or "severity assessment" are the right follow-up terms. A fair test needs naive participants.
- **The task was narrow.** It stops at "find the asset". The full milestone also includes identifying who is relevant (the author/affiliation cross-check that links registry investigators to the CDD severity assessment), noting the counter-evidence, and assembling a brief. These steps are manual-heavy and are already done in RarePath's Research Action Brief.
- **One disease, one run.** To support a 10× claim we would need several patient-organization volunteers, several diseases, and the measures in [10x-impact.md](10x-impact.md): analyst hours, databases searched, time to identify a shared asset, and time to assemble an evidence pack.

Until then, the defensible claim is the one in [10x-impact.md](10x-impact.md): RarePath compresses many disconnected research steps into one evidence-backed workflow.
