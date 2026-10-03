# RarePath Atlas

> Rare shouldn't mean researching alone.

Hack-Nation 7th Global AI Hackathon · Challenge 05 (Buffalo Initiative × OpenAI): AI Atlas for the World's Rare Diseases.

RarePath Atlas helps a rare-disease patient organization answer one question:

**"What has another rare-disease community already built that we may be able to reuse?"**

It walks from *diagnosis → evidence-backed connection → related community → reusable research asset → who to talk to → concrete next action*. Every step carries a verbatim source quote and an evidence status: **Known**, **AI-inferred**, **Contradictory** or **Unknown**.

It does not diagnose, recommend treatment, or claim that two diseases are clinically equivalent.

## Status: Gate 2 (verified featured journey)

Search **CDKL5** to see a real, sourced journey:

- **CDKL5 deficiency disorder** (MONDO:0100039) is shown as a distinct disorder. Its historical "Rett variant" classification is displayed as **Contradictory**.
- CDD was **enrolled in the Rett and Rett-Related Disorders Natural History Study** (ClinicalTrials.gov **NCT02738281**; NIH U54HD061222). The study's 2020 paper (PMID 32472944) compared 793 participants across four disorders.
- Reuse is classified conservatively: a **shared research-infrastructure precedent**, a **potentially adaptable** outcome measure (RTT Clinical Severity Scale, administered to CDD participants), and a biobank **discovery lead**.
- The page shows documented differences (seizure onset, regression, severity), seven open gaps, and a sourced next action.

Sources, method, limitations, and what the demo does and does not prove are documented in [docs/demo-path.md](docs/demo-path.md).

## Where OpenAI is used (runtime product)

| Role | Where | Guardrail |
|---|---|---|
| **Evidence Extractor** | Ingestion, `scripts/extract-claims.ts` | Claims are kept only if their quote appears verbatim in the retrieved text. Treatment statements are excluded. |
| **Entity Reconciler** | Ingestion | Can only choose among curated candidates. Only high-confidence matches are used. |
| **Path Explainer** | Runtime: **Explain (OpenAI)** in the evidence drawer (`POST /api/explain`) | May cite only the edges it was given, and must flag disputed or inferred steps. |

Gate 2 run: 85 quote-verified claims from 7 sources; 27 corroborate analyst-curated edges; 12 extractor-only edges, which are badged and kept out of cards and actions. Run metadata is stored in the bundle and shown on the results page.

## Run locally

Requires Node.js 20 or later (tested on Node 24).

```bash
npm install
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
# edit .env.local: OPENAI_API_KEY (required for Explain), optional NCBI_API_KEY / NCBI_EMAIL
npm run dev
```

Open http://localhost:3000 and search **CDKL5**.

- `.env.local` takes precedence over machine-level environment variables, and it is gitignored.
- Without an OpenAI key the app still runs on the committed dataset; Explain returns "not configured".
- `DATA_BUNDLE=fixture` loads the Gate 1 demo fixture, which keeps its fixture warnings. It is for development only.

### Rebuild the real dataset (optional)

```bash
npx tsx scripts/check-credentials.ts   # presence + minimal OpenAI/NCBI checks, never prints secrets
npx tsx scripts/fetch-sources.ts       # PubMed/PMC, ClinicalTrials.gov, RePORTER, OLS (MONDO/HPO), HGNC, org sites
npx tsx scripts/extract-claims.ts      # OpenAI Evidence Extractor + Entity Reconciler (requires key in .env.local)
npx tsx scripts/build-real-bundle.ts   # verifies every quote/ID, writes data/real/cdd-real.json
```

### Checks

```bash
npm run typecheck
npm test            # 37 tests: provenance, quote verification, status rules, guardrails, search journey
npm run build
```

### Endpoints

| Route | Purpose |
|---|---|
| `GET /api/search?q=` | Results-page payload, or an honest "no supported connection" |
| `POST /api/explain` `{ edge_ids, audience }` | OpenAI Path Explainer |
| `GET /api/health` | Bundle, counts, OpenAI key *source* and model (never the key) |

## Scientific limitations

- One disease journey only. CDD and Rett are related here through research history and shared infrastructure, **not** through shared biology.
- No treatment-transfer claims. Rett outcome measures are not established as valid in CDD.
- PMID 39867409 is a preprint. Access to study data and samples is unverified.

## Docs

- [docs/demo-path.md](docs/demo-path.md): the verified journey, sources, OpenAI usage, limitations
- [docs/architecture.md](docs/architecture.md): stack, modules, service boundaries
- [docs/data-model.md](docs/data-model.md): nodes, evidence edges, status rules

## Deploy

On Vercel, import the repo and set `OPENAI_API_KEY` and `OPENAI_MODEL`. The verified dataset is committed, so no ingestion runs at deploy time.
