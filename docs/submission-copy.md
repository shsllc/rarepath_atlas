# Submission copy (Hack-Nation portal fields)

Solo submission. TEAM NAME: [TO BE CONFIRMED]

**PROJECT NAME**
RarePath Atlas

**TAGLINE**
Rare shouldn't mean researching alone.

**ONE-SENTENCE DESCRIPTION**
RarePath Atlas shows rare-disease communities which other communities they have already been studied alongside, and what research they may be able to reuse, with a verbatim source quote behind every connection.

**SHORT DESCRIPTION** (~430 characters)
Rare-disease groups often research alone across disconnected databases. RarePath Atlas connects a disease to related communities, shared studies and reusable research assets, with a source quote behind every link. Its validated demo shows that CDKL5 deficiency disorder, now distinct from Rett syndrome, was enrolled in a shared NIH Rett natural-history study that informed a CDD-specific severity scale.

**FULL DESCRIPTION** (~1,100 characters)
Families and patient organizations in rare disease often become researchers themselves, searching PubMed, trial registries, ontologies and grant databases one at a time to learn whether another community has already built something useful. RarePath Atlas turns that into one evidence-backed workflow. Search a disease and it shows connected communities, shared studies and reusable research infrastructure, each classified cautiously. Each one comes with what differs, what remains uncertain, and a concrete next research question. Every claim opens to a verbatim quote from a retrieved public source.

I built a validated, focused vertical slice that demonstrates the architecture. CDKL5 deficiency disorder (CDD) was once labelled a Rett variant and is now recognised as distinct. Yet CDD participants were enrolled in the NIH Rett and Rett-Related Disorders Natural History Study (NCT02738281), and that consortium's experience informed a CDD-specific severity assessment (PMID 31147226). RarePath surfaces this precedent and states plainly that it is not shared biology and implies no treatment transfer.

**PROBLEM**
Rare-disease communities are small and under-resourced. The evidence that another community has already built reusable infrastructure is scattered across registry fields, methods sections and grant abstracts, and outdated disease names can mislead a simple search.

**SOLUTION**
A typed, evidence-backed graph built from public sources. It surfaces connected communities and reusable research assets, with differences, contradictions and uncertainty shown next to every connection, and ends in an actionable research question.

**WHAT MAKES IT DIFFERENT**
- It asks "what has another community already built that we could reuse?", not just "what is related?"
- Every relationship carries a verbatim quote; the build fails if any quote is missing from its stored source.
- It shows what a connection does **not** mean: the contradicted "Rett variant" label, differences, and limitations.
- Reuse is never shown as established fact. AI-only claims are labelled and hidden by default.

**OPENAI USAGE**
- **Evidence Extractor:** extracts claims from retrieved abstracts, PMC excerpts, registry records and grant text; a claim is kept only if its quote appears verbatim in the source (114 claims kept from 8 sources).
- **Entity Reconciler:** maps mentions to curated entities, choosing only among supplied candidates, type-aware, high-confidence matches only.
- **Path Explainer:** live, four-part plain-language explanation (why it matters, what the evidence shows, what it does not show, next question), 180 words maximum, validated against treatment-transfer phrasing, and limited to relationships already in the graph.

**10X IMPACT**
Milestone: identifying and evaluating an existing research asset or collaboration precedent. RarePath compresses the discovery and evidence-assembly portion of this milestone from many disconnected research steps (8 in the traditional path, across 7 source systems) into one evidence-backed workflow. The claim is about this milestone only, not about how fast treatments are developed. It is testable: measure analyst hours, databases searched, time to identify a shared asset, and time to assemble an evidence pack, with and without RarePath.

**RESPONSIBLE AI / SAFETY**
Research navigation only: no diagnosis, treatment recommendations or clinical-equivalence claims. Verbatim quote validation, explicit Known / AI-inferred / Contradictory / Unknown statuses, analyst-unreviewed AI edges hidden by default, a flagged preprint, and a "What we don't know" section. The OpenAI endpoint is schema-locked, rate-limited and cached, and the sourced page works even if AI fails.

**TECH STACK**
Next.js 15, TypeScript, Tailwind CSS, Zod, Cytoscape.js, OpenAI API (gpt-5-mini, structured outputs), Vitest, and Netlify.

**DATA SOURCES**
PubMed and PubMed Central (NCBI E-utilities), ClinicalTrials.gov API v2, NIH RePORTER, MONDO and HPO (EBI OLS4), HGNC, and official patient-organization websites.

**GITHUB URL**
https://github.com/shsllc/rarepath_atlas

**PRODUCTION URL**
https://rarepathatlas.netlify.app

**CANONICAL DEMO URL**
https://rarepathatlas.netlify.app/results?q=CDKL5&demo=1

**BEST QUOTE**
"Rare shouldn't mean researching alone."

**WHAT DID YOU BUILD DURING THE HACKATHON?**
I built RarePath Atlas end to end during the hackathon: public-source ingestion, an evidence-backed graph with verbatim quote validation, three OpenAI roles (Evidence Extractor, Entity Reconciler, Path Explainer), and the deployed web app. It is a validated, focused vertical slice (CDKL5 deficiency disorder and its shared Rett research infrastructure) that demonstrates an architecture designed to scale to other rare diseases. It is not yet a complete world-scale atlas.
