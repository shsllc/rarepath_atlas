# RarePath Atlas

> Rare shouldn't mean researching alone.

Hack-Nation 7th Global AI Hackathon · Challenge 05 (Buffalo Initiative × OpenAI): AI Atlas for the World's Rare Diseases.

RarePath Atlas helps a rare-disease patient organization answer one question:

**"What has another rare-disease community already built that we may be able to reuse?"**

It takes a disease, gene, variant, symptom or mechanism and walks from
*isolated diagnosis → evidence-backed connection → related community → reusable research asset → who to talk to → concrete next action*,
with every step carrying its provenance and a clear evidence status: **Known**, **AI-inferred**, **Contradictory** or **Unknown**.

It does not diagnose, recommend treatment, or claim that two diseases are clinically equivalent.

## Status: Gate 1 (scaffold + data contracts)

- One seeded journey: **CDKL5 deficiency disorder → Rett syndrome → Rett natural-history protocol and outcome measures**.
- All seeded data is a **demo fixture**: it describes what each source is *expected* to say. Nothing in it has been retrieved or verified yet, and the UI labels it that way everywhere.
- OpenAI roles (Evidence Extractor, Entity Reconciler, Path Explainer) are implemented. The Path Explainer is wired into the UI ("Explain (OpenAI)" in the evidence drawer).
- Real data providers are interface stubs; they arrive in Gate 2.

## Run locally (Windows, macOS, Linux)

Requires Node.js 20 or later (tested on Node 24).

```bash
git clone <repo-url> rarepath-atlas
cd rarepath-atlas
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
# edit .env.local and set OPENAI_API_KEY
npm run dev
```

Open http://localhost:3000 and search **CDKL5**, **CDD** or **CDKL5 deficiency disorder**.

Without `OPENAI_API_KEY` the app still runs on the fixture. The Explain button then returns a clear "not configured" message instead of a made-up answer. If `OPENAI_API_KEY` is already set as a system environment variable, the app picks that up too.

### Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: schema validation, provenance and status rules, search journey
npm run build       # production build
```

### Endpoints

| Route | Purpose |
|---|---|
| `GET /api/search?q=` | Results-page payload (`SearchResult` or `NotFoundResult`) |
| `POST /api/explain` `{ edge_ids, audience }` | OpenAI Path Explainer over the given edges |
| `GET /api/health` | Data mode, bundle id, whether OpenAI is configured |

## Docs

- [docs/architecture.md](docs/architecture.md): stack, modules, service boundaries, where OpenAI plugs in
- [docs/data-model.md](docs/data-model.md): node types, evidence edges, result objects, status rules
- [docs/demo-path.md](docs/demo-path.md): the seeded journey, what is real and what is fixture, Gate 2 verification list

## Deploy

Vercel is the zero-config option: import the repo and set `OPENAI_API_KEY` and `OPENAI_MODEL`. Render or any other Node host also works: run `npm run build`, then `npm start`.
