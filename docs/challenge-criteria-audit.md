# Challenge-criteria audit: Hack-Nation Challenge 05 (Buffalo Initiative × OpenAI)

Source of requirements: the Challenge 05 brief **as quoted in the project instructions**. The official portal text was not available to this audit, so check wording against the portal before submitting.

Statuses: **COMPLETE** · **DEMONSTRATED IN FOCUSED SLICE** (works end to end for CDKL5 deficiency disorder; the architecture generalises but other diseases are not ingested) · **PARTIAL** · **NOT IMPLEMENTED**.

| Challenge requirement | RarePath implementation | Evidence / screen | Status | Remaining gap |
|---|---|---|---|---|
| Evidence graph | Typed graph: 28 entities, 58 evidence-bearing relationships, 22 retrieved sources, every relationship quote-verified | §7 Evidence graph; drawer; `data/real/cdd-real.json` | DEMONSTRATED IN FOCUSED SLICE | One disease neighbourhood |
| Genes / variants | Genes CDKL5 (HGNC:11411) and FOXG1 (HGNC:3811) with sourced causal edges. No variant-level data | §1 disease card; graph (Genes & features filter) | PARTIAL | No ClinVar / variant nodes |
| Mechanism | Deliberately absent: no retrieved source describes a CDKL5 mechanism, so none is shown. A gap is listed | §1 "Not described in the retrieved sources"; §10 gap | NOT IMPLEMENTED (by evidence choice) | Retrieve a mechanism review and run the extractor |
| Phenotypes | 4 HPO-grounded features (seizure, epileptic spasm, cerebral visual impairment, developmental regression), each with a quote | §1; drawer | DEMONSTRATED IN FOCUSED SLICE | Small, intentional set |
| Patient groups | IFCR, Loulou Foundation, IRSF, FOXG1 Research Foundation (official sites) | §9 People & communities | DEMONSTRATED IN FOCUSED SLICE | Single-page retrieval (title/meta) |
| Papers | 5 PubMed records (one flagged preprint), PMC excerpts where licensed | §9 Key publications; drawer citations | DEMONSTRATED IN FOCUSED SLICE | n/a |
| Studies | NCT02738281 (natural history) and NCT02705677 (biobank) from ClinicalTrials.gov v2 | §3 featured card; study node view | DEMONSTRATED IN FOCUSED SLICE | n/a |
| Research assets | NHS infrastructure, RTT Clinical Severity Scale, CDD severity assessment, CDKL5 Developmental Score, biobank | §3 Reusable research; §4 brief | DEMONSTRATED IN FOCUSED SLICE | n/a |
| Stable entity resolution | MONDO/HPO/HGNC IDs verified against retrieved records; label, alias (e.g. **STK9**) and identifier (e.g. **MONDO:0100039**) routes; type-aware OpenAI Reconciler during ingestion | Search "STK9" → "via alias" route shown on §1 | DEMONSTRATED IN FOCUSED SLICE | No live ontology lookup for arbitrary new terms |
| Provenance | Every relationship records source, URL, retrieval date, method and stance; the build fails on any missing quote | Drawer; `docs/final-evidence-audit.md` (10/10) | COMPLETE (for the shipped dataset) | n/a |
| Contradictory evidence | "Rett variant" classification shown as Contradictory, with historical vs. current quotes | §5 contradiction spotlight; double line in graph | DEMONSTRATED IN FOCUSED SLICE | n/a |
| Uncertainty | Four statuses (icon + label + line style), "What we don't know", preprint flag, reuse never "Known" | Evidence key; §10 | COMPLETE | n/a |
| Clustering / graph analytics | Deterministic **research-connection-strength** ranking (visible formula, reviewed edges only, counterweights) and **research-hub** detection (degree centrality) | §2 Research connection strength | DEMONSTRATED IN FOCUSED SLICE | No community-detection algorithm; few nodes to cluster |
| Reusable assets | Conservative classes: shared-infrastructure precedent, potentially adaptable, discovery lead | §3 | DEMONSTRATED IN FOCUSED SLICE | n/a |
| Network overlap | NCT02738281 identified as a hub linking 4 disorder communities; shared asset (RTT CSS) between CDD and Rett | §2 hub banner and Rett factors | DEMONSTRATED IN FOCUSED SLICE | n/a |
| Collaborators | 3 investigators (registry + PubMed author/affiliation, identity matched by name **and** institution) and 1 organization; no contact data; relevance only | §4 brief "Who is relevant"; §9 | DEMONSTRATED IN FOCUSED SLICE | No live directory; relevance not willingness |
| Patient-friendly experience | Plain-language summaries, definitions, evidence key, 60-second demo path, mobile layout | Home; results | DEMONSTRATED IN FOCUSED SLICE | No user testing with families yet |
| Concrete next action | **Research Action Brief**: opportunity, why it surfaced, assets, who is relevant, sources to bring, question to ask, what to validate, what it does not mean | §4 | DEMONSTRATED IN FOCUSED SLICE | n/a |
| 10× milestone | Milestone defined; prototype benchmark measured **4.2× (time), 5× (evidence openings)** in one run, with no 10× claim | §8; `docs/benchmark.md`; `docs/10x-impact.md` | PARTIAL | Needs naive-user, multi-disease measurement |
| OpenAI: Extract | Evidence Extractor over 8 sources; 114 quote-verified claims; corroborates 26 analyst edges | Provenance bar; "OpenAI extracted" badges | COMPLETE (in ingestion) | n/a |
| OpenAI: Reconcile | Entity Reconciler: candidates only, type-aware, high-confidence only (79 calls) | `data/real/extractions.json` | COMPLETE (in ingestion) | n/a |
| OpenAI: Explain | Live four-part Path Explainer, at most 180 words, validated, cached, rate-limited | Drawer *Explain (OpenAI)* | COMPLETE | Latency 10–18 s |
| Scalability path | Disease-agnostic providers and pipeline (fetch → extract → reconcile → verify → build); analytics and UI are data-driven | `scripts/`, `src/lib/providers`, `src/lib/analytics.ts` | PARTIAL | Curation of featured narratives is still manual per disease |

## Summary

- **No material judging gap is unaddressed.** Every requirement is either demonstrated in the focused slice or explicitly labelled partial with a reason.
- **Honest partials:** genes/variants (no variants), mechanism (no sourced mechanism, by design), 10× (measured 4.2×, not 10×), scalability (manual curation per disease).
- **Strongest differentiators:** quote-verified provenance, contradiction handling, conservative reuse classes, and transparent analytics that never use AI-only edges.
