# Technical video outline (2–3 minutes)

Prepare only if the event requires a technical video (VERIFY IN PORTAL).

1. **Architecture (0:00–0:20).** One Next.js 15 app on Vercel: server-rendered pages plus server-only API routes. Zod schemas define every entity and evidence edge. The verified dataset is a JSON bundle built offline, so no database is needed.
2. **Real public source ingestion (0:20–0:40).** `scripts/fetch-sources.ts` retrieves 22 records from PubMed and PubMed Central (license-checked excerpts), ClinicalTrials.gov v2, NIH RePORTER, MONDO/HPO via EBI OLS, HGNC and official organization sites. Every text is stored verbatim with its retrieval date.
3. **Evidence-backed graph model (0:40–1:00).** Relationships are objects, not bare edges: source, URL, retrieval date, method, stance (supports / contradicts / qualifies), confidence, inferred flag, contradiction status. CDD–Rett is split into distinct predicates: historically grouped, "variant" claim (contradicted), studied together, shares features, differs clinically.
4. **OpenAI Evidence Extractor (1:00–1:15).** Structured outputs over each source. A claim is kept only if its quote appears verbatim in the stored text.
5. **OpenAI Entity Reconciler (1:15–1:25).** Maps mentions to curated nodes. It can only choose supplied candidates, matching is type-aware ("CDKL5" the disorder vs. the gene), and only high-confidence matches are used.
6. **OpenAI Path Explainer (1:25–1:40).** Live, four-part, 180 words maximum. A validator rejects treatment-transfer phrasing and jargon and requires limitations and a next question, with one corrective retry. Results are cached and rate-limited, and the endpoint accepts known relationship IDs only.
7. **Evidence integrity and quote validation (1:40–1:55).** The build fails on any missing quote, identifier or type-signature violation. There are 60 tests plus a 10-point audit (`docs/final-evidence-audit.md`).
8. **Contradiction and uncertainty (1:55–2:10).** One rule (`deriveEvidenceStatus`) decides status: contradiction beats inference beats support. Reuse cards are never "Known". The page shows a "What we don't know" section and flags the preprint.
9. **Why OpenAI-only edges are hidden by default (2:10–2:25).** Their quotes are verified, but the model chose the entity mapping and predicate. They sit behind an opt-in filter, labelled "AI-extracted", and never feed cards or actions.
10. **Deployment (2:25–2:40).** Vercel; server-side env vars only (`OPENAI_API_KEY`, `OPENAI_MODEL`, `NCBI_API_KEY`, `NCBI_EMAIL`). The sourced journey works even if OpenAI is down.
