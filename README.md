# RarePath Atlas

**Rare shouldn't mean researching alone.** RarePath connects scattered disease research, patient communities, studies and reusable research infrastructure, with evidence behind every connection.

Hack-Nation 7th Global AI Hackathon · Challenge 05: Buffalo Initiative × OpenAI, *AI Atlas for the World's Rare Diseases*.

## The problem

Rare-disease patient organizations often have to do their own research. They search PubMed, trial registries, ontologies and funding databases one at a time, trying to learn whether another community has already built something they could learn from. The key facts are scattered across registry eligibility fields, methods sections and grant abstracts, and old disease names can point in the wrong direction.

## What RarePath does

Search a disease or gene. RarePath shows:

1. **Connected communities:** which related disorders yours has been studied alongside, and exactly how (shared study, historical naming, clinical differences).
2. **Reusable research:** natural-history infrastructure, outcome measures and biobanks, each classified cautiously (*shared-infrastructure precedent*, *potentially adaptable*, *discovery lead*). These are never shown as established fact.
3. **What it does not mean:** differences, contradictions and open questions, shown next to the connection.
4. **A next question:** a concrete research or collaboration question, with the evidence behind it.

Every claim opens to its **verbatim source quote**, with a link and retrieval date.

## Demo

- **Production:** `https://<vercel-url>` *(pending Vercel import; see [Deploy](#deploy))*
- **Canonical 60-second demo:** `/results?q=CDKL5&demo=1`
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
- **Audit:** [docs/final-evidence-audit.md](docs/final-evidence-audit.md) (10/10 checks pass). There are 60 automated tests.

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

- **Next.js 15 + TypeScript + Tailwind**, deployed on Vercel. OpenAI is called only from server routes.
- **Zod** schemas for entities and evidence-bearing relationships (`src/lib/schemas`).
- **Offline pipeline** (`scripts/`): fetch sources, then OpenAI extraction and reconciliation, then a verified build of `data/real/cdd-real.json`.
- **Cytoscape.js** evidence graph. Line style encodes status: solid = Known, dashed = AI-inferred, double = Contradictory, dotted = Unknown.
- Details: [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md).

## Limitations

- One verified journey (CDKL5 deficiency disorder), not a comprehensive atlas.
- Research navigation only: no diagnosis, no treatment recommendations, no clinical-equivalence claims.
- The RTT Clinical Severity Scale is not established as valid in CDD; the CDD-specific assessment still needs validation.
- PMID 39867409 is a preprint. Access terms for the study database and biobank are not stated in the sources.
- Rate limiting is in-memory per server instance, which is fine for a demo but is not a production gateway.

## Data sources

PubMed and PubMed Central (NCBI E-utilities; PMC excerpts only where the license permits text mining), ClinicalTrials.gov API v2, NIH RePORTER, MONDO and HPO (EBI OLS4), HGNC, and official patient-organization websites. Full list: [docs/demo-path.md](docs/demo-path.md).

## Deploy

On Vercel, import `shsllc/rarepath_atlas` (framework preset: Next.js, no build settings needed). Then add these **server-side** environment variables, with no `NEXT_PUBLIC_` prefix: `OPENAI_API_KEY`, `OPENAI_MODEL`, `NCBI_API_KEY`, `NCBI_EMAIL`. The verified dataset is committed, so no ingestion runs at deploy time.

## Submission docs

[60-second script](docs/demo-script-60s.md) · [shot list](docs/demo-shot-list.md) · [technical video outline](docs/technical-video-outline.md) · [10× case](docs/10x-impact.md) · [submission checklist](docs/submission-checklist.md)
