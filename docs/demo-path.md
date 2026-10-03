# Demo path

## The seeded journey

**Persona:** a volunteer at a CDKL5 deficiency disorder (CDD) patient organization who wants to start a natural-history effort and doesn't know what already exists.

1. Search **"CDKL5"** (or "CDD", "DEE2", "CDKL5 deficiency disorder"). The gene resolves to the disease page.
2. **Your disease:** CDD, gene CDKL5, mechanism (loss of CDKL5 kinase function), key features, identifier badges marked unverified or pending, and evidence coverage counts.
3. **Connected communities:** four cards that together show all four evidence statuses:
   - Rett syndrome, overlapping features: **Known**
   - Rett syndrome, historical classification: **Contradictory** (older literature called CDD a Rett variant; newer literature treats it as distinct)
   - Rett syndrome, shared synaptic mechanism: **AI-inferred**, low confidence
   - FOXG1 syndrome, overlapping features: **Known**, low confidence
4. **Reusable research** (main section):
   - *Natural-history protocol from the Rett community*: why it may transfer, what differs (onset age, gene function, seizure burden), what is uncertain (whether CDD was ever eligible), expert questions, and next actions (pull the registry record, contact IRSF, take it to the scientific advisory board).
   - *Rett outcome measures*: what differs (visual impairment, seizures), and a check for whether CDD-specific measures already exist before adapting Rett ones.
5. **People & communities:** IRSF, IFCR, Loulou Foundation, FOXG1 Research Foundation. Investigators are deliberately unnamed until a registry lookup supplies them.
6. **What we don't know:** five gaps, including the unverified study enrolment, the contested classification, and the AI-only mechanism link.
7. **Evidence graph:** an edge table (graph view comes in Gate 3). Click any row, card or "why?" link to open the evidence drawer. **Explain (OpenAI)** produces a family-readable explanation that flags hypotheses and unretrieved evidence.

Honest negatives to show: search "Seizure" (symptom → lists the diseases it is annotated on, no guessing), or any unknown term (→ "No supported connection found").

## What is real and what is fixture

| Item | State |
|---|---|
| Disease, gene, organization names and websites | Real entities, entered by hand. Verify the URLs in Gate 2. |
| OMIM 300672, OMIM 312750, ORPHA 778, HGNC:11411, HGNC:6990, HP:0001250, HP:0001252 | Entered from memory and marked `unverified_fixture`. **Must be resolved through the APIs.** |
| MONDO IDs, remaining HPO IDs | `pending`. Not guessed. |
| Every relationship's evidence text | Describes what a source is *expected* to say. Prefixed `[FIXTURE — NOT RETRIEVED EVIDENCE]`. |
| Source URLs | Real search or landing pages (PubMed search, ClinicalTrials.gov search, OLS, HPO). No PMIDs or NCT numbers are cited. |
| "Rett natural history study" | A placeholder node. The actual registry record (NCT, eligibility, outcome measures) must be retrieved. |
| Investigators | Not named. |
| The CDD ↔ Rett synaptic mechanism link | Marked AI-inferred, low confidence, with no retrieved source. Remove it in Gate 2 unless the Extractor finds a supporting quote. |

## Gate 2 verification checklist (before the demo)

- [ ] Resolve CDD, Rett and FOXG1 MONDO ids; confirm OMIM and Orphanet ids.
- [ ] Pull HPO annotations for CDD and Rett, and compute real phenotype overlap.
- [ ] Find the Rett natural-history study on ClinicalTrials.gov: record its NCT number, conditions, eligibility (does it include CDKL5?) and listed outcome measures.
- [ ] Retrieve two or three PubMed abstracts on CDD vs. Rett classification and run them through the Evidence Extractor.
- [ ] Pull investigators from the registry record or NIH RePORTER.
- [ ] Confirm the organization URLs and mission statements.
- [ ] Set `is_fixture: false` only after every edge has a retrieved source.

## 10x milestone (to quantify later)

Milestone: *identifying and evaluating an existing reusable natural-history protocol or research asset.*
Compare the traditional path (literature review, conference networking, cold emails, waiting on advisors) with RarePath Atlas (search, then an evidence-backed shortlist with differences and named next contacts).
