# Technical walkthrough v2: script and shot plan (not yet rendered)

The rendered `rarepath-technical-walkthrough.mp4` (55.3 s) predates the multi-provider discovery layer. It shows the reviewed pipeline correctly but understates the architecture. This plan replaces it for the next render. Keep the same tooling (`submission-media/tools/tech-*.mjs`), the same cloned voice and the same 50–57 s target.

## What changed in the architecture

1. **Two evidence tiers.**
   - A broad, live, machine-assembled **discovery layer** built from 16 public research sources.
   - The existing **reviewed layer**, which alone drives ranking and the Research Action Brief.
2. **Provider contract.** Every source returns normalized records and links with provenance (provider, source id, URL, timestamp, source-native type), fixed to `machine_assembled` and ineligible for ranking or action.
3. **Reconciliation by stable identifiers.**
   - Papers merge on DOI/PMID, people on ORCID, institutions on ROR, diseases on MONDO/ORPHA, trials on cross-referenced registry ids.
   - Nothing ever merges on a name or title alone; look-alike trials are flagged POSSIBLE DUPLICATE.
4. **Isolation.** Providers run in parallel with independent deadlines; a failed source is shown as unavailable while the rest render.
5. **One review gate.** `isReviewedEvidenceEdge()` feeds ranking, coverage and the brief. Forged discovery edges are tested and cannot change any of them.

## Revised narration (target about 140 words, 52–56 s at 1.05×)

> RarePath has two evidence layers. A live discovery layer queries sixteen public sources: literature, trials across three registries, ClinVar, ClinGen, Orphanet, HPO and model organisms. Every record keeps its provenance and stays machine-assembled.
>
> Records merge only on stable identifiers: DOI, ORCID, ROR, MONDO and registry IDs. Names alone never merge, and look-alike trials are flagged, not combined.
>
> The reviewed layer is different. Analysts review evidence into graph relationships, and deterministic analytics — not the language model — calculate Research Connection Strength. One gate decides eligibility, and machine-assembled or AI-only claims always fail it.
>
> OpenAI extracts claims from source text, reconciles entities, and explains supported paths with their limits.
>
> So RarePath can search broadly while every decision stays grounded in reviewed evidence.

Run a timing test before assembly. If the narration runs over 57 s, cut the source list in the first paragraph first.

## Shot plan (about 10 scenes; left rail = pipeline)

Rail stages: Public sources → Discovery providers (16) → Reconcile by ID → **Review gate** → Reviewed graph → Deterministic analytics → Action Brief → OpenAI explainer.

| # | Cue | Visual (real artifacts) |
|---|---|---|
| 1 | "two evidence layers" | Title: *Broad discovery. Reviewed decisions.* with the two tier chips (◌ Machine-assembled / ✓ Reviewed evidence) from the product. |
| 2 | "sixteen public sources" | `/sources` page capture: live vs offline vs not-integrated badges. |
| 3 | "trials across three registries" | Dravet *Global clinical research* panel: registry coverage, one trial with ClinicalTrials.gov + EU CTR registrations, a POSSIBLE DUPLICATE badge, status families. |
| 4 | "ClinVar, ClinGen, Orphanet…" | Genetics panel: the *EXPERT-CURATED VALIDITY* card (SCN1A Definitive) beside ordinary associations; ClinVar stars. |
| 5 | "merge only on stable identifiers" | `reconcile.ts` snippet (`ID_KEYS`), plus a paper card showing *Sources: Europe PMC · OpenAlex · Crossref*. |
| 6 | "names alone never merge" | Test line: ✓ *name + identical affiliation may merge; name alone may not*. |
| 7 | "deterministic analytics" | `FACTOR_WEIGHTS` code, then the production Rett panel (strength 9 with counterweights). Reuse the existing scenes. |
| 8 | "one gate decides eligibility" | `isReviewedEvidenceEdge` snippet, plus ✓ *candidate edges … cannot enter Research Connection Strength*. |
| 9 | "OpenAI extracts…" | Existing extractor metrics card (114 claims, 0 unverified) and Path Explainer capture. |
| 10 | closing | *OpenAI is useful. It does not control the evidence standard.* · 194 automated tests · 10/10 evidence-audit checks · 16 live sources. |

## Facts that must stay accurate on screen

- **Counts:** 16 live discovery providers and 194 automated tests (2 skipped). Recheck both before rendering.
- **Trials:** registries used are ClinicalTrials.gov, ISRCTN and EU CTR. WHO ICTRP is *available with approval*, and CTIS isn't used.
- **Unchanged:** extraction metrics (114 / 0 / 26 / 13 / 10) and Rett strength 9.
- **Never on screen:** contact details, keys, local paths.
