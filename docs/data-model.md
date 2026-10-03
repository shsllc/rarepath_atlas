# Data model

Source of truth: `src/lib/schemas/` (Zod). TypeScript types are inferred from these schemas, and every bundle is validated when it loads.

## Nodes (`entities.ts`)

`GraphNode` is a discriminated union on `type`:

| type | extra fields |
|---|---|
| Disease | `inheritance[]`, `typical_onset` |
| Gene | `symbol` |
| Variant | `hgvs`, `clinical_significance` |
| Phenotype | — (HPO id in `external_ids`) |
| Mechanism | — |
| Paper | `year`, `journal` |
| Study | `study_type` (natural_history, interventional, observational, registry, other), `status` |
| ResearchAsset | `asset_kind`, `owner_disease_id`, `access_notes` |
| PatientOrganization | `website` |
| Researcher | `affiliation` |

Common fields: `id`, `label`, `aliases[]`, `external_ids[] {system, id, url, verification}`, `description`, `lay_summary`, `verification`.

`verification` takes one of three values: `verified` (resolved by a provider), `unverified_fixture` (hand-entered) or `pending`.

`asset_kind` values: natural_history_protocol, registry, disease_model, biomarker, outcome_measure, clinical_study_design, research_infrastructure, investigator_relationship.

## Evidence edges (`evidence.ts`)

Relationships are objects that carry their own evidence, not bare graph edges.

```jsonc
{
  "id": "edge:13",
  "subject_id": "disease:cdd",
  "predicate": "historically_classified_with",
  "object_id": "disease:rett",
  "source": "...", "source_url": "...", "retrieval_date": "2026-10-03",
  "source_type": "literature",            // ontology | variant_database | literature | trial_registry | funding_database | patient_org_site | web_scrape | model_inference | demo_fixture
  "evidence_type": "direct_statement",    // curated_annotation | direct_statement | study_record | computed_overlap | llm_extraction | llm_inference | placeholder
  "quoted_or_structured_evidence": "...",
  "evidence": [ /* EvidenceItem[]: full provenance list, first item mirrored in the flat fields */ ],
  "confidence": "moderate",               // high | moderate | low | insufficient
  "inferred": false,
  "contradiction_status": "contested",    // none | contested | contradicted
  "contradiction_notes": "...",
  "created_at": "2026-10-03"
}
```

Predicates: caused_by_variant_in, has_variant, has_phenotype, involves_mechanism, phenotypically_overlaps, shares_mechanism_with, historically_classified_with, **classified_as_variant_of**, **co_studied_with**, **clinically_differs_from**, **applied_to**, **informed_development_of**, studied_in, produced_asset, asset_measures, supports_community, investigates, described_in. Each predicate has a type signature, which the build enforces.

Each evidence item also records:
- `method`: structured_api, analyst_quote, openai_extractor or fixture
- `stance`: supports, contradicts, or qualifies (a limitation or caveat)
- `source_record_id`: the stored source the quote was verified against
- `extraction`: model, run id and timestamp, when OpenAI produced the item

`SourceRecord` (`sources.ts`) stores each retrieved text verbatim, along with its citation, retrieval date and license note. `GraphBundle.sources` carries these records, so tests can re-verify every quote.

Reuse cards carry a `reuse_classification`: directly_reusable, potentially_adaptable, shared_infrastructure_precedent or discovery_lead. A featured card can also carry a `story`: labelled lines, each citing its own evidence edges.

## Evidence status: one rule, one place

`deriveEvidenceStatus(edge)` is the only function that decides what the UI shows:

1. `contradiction_status != none` → **contradictory**
2. `inferred`, `source_type = model_inference` or `evidence_type = llm_inference` → **inferred**
3. `confidence = insufficient` → **unknown**
4. otherwise → **supported**

An inferred edge therefore can never display as supported, and a test enforces this. `combineStatuses()` rolls card-level status up to the most cautious status present. Reuse opportunities are always shown as **inferred** or **contradictory**, never **supported**, because a reuse idea is a hypothesis by definition.

The UI (`StatusBadge.tsx`) gives each status an icon, a label, a color and a border style: solid ● supported, dashed ◇ inferred, double ▲ contradictory, dotted ? unknown. Status is readable without relying on color.

Fixture evidence additionally carries `source_type: demo_fixture`, a `[FIXTURE — NOT RETRIEVED EVIDENCE]` text prefix and a yellow **Demo fixture** chip.

## Result objects (`results.ts`)

- **CandidateConnection**: `disease_id`, `connection_type`, `why_connected` (plain language), `evidence_edge_ids` (min 1), `evidence_count`, `confidence`, `status`, `key_difference`.
- **ReusableAssetOpportunity** (the main result card): `asset_id`, `source_disease_id`, `headline`, `why_it_may_transfer[]`, `what_differs[]`, `what_is_uncertain[]`, `requires_expert_validation[]`, `evidence_edge_ids[]`, `confidence`, `status`, `next_actions[]`. Every list requires at least one item, so a card cannot ship without its differences and uncertainties.
- **ActionRecommendation**: `kind` (contact_organization, contact_researcher, review_protocol, compare_outcome_measures, compare_eligibility, request_data_access, ask_expert_question), `label`, `target_node_id`, `evidence_edge_ids` (min 1, so every action has an evidence trail).
- **KnowledgeGap**: `kind` (missing_evidence, contradictory_evidence, assumption, open_question), `statement`, `suggested_question_or_experiment`, `related_edge_ids`.
- **SearchResult**: the full results-page payload (disease summary and coverage, connections, opportunities, people, gaps, subgraph). **NotFoundResult**: an honest "no supported connection" response with suggestions.
- **GraphBundle**: the on-disk format. Raw `nodes` and `edges` plus the curated `connections`, `opportunities` and `gaps`, with `is_fixture` and `fixture_warning`.
