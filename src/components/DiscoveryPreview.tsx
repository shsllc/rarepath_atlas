import Link from "next/link";
import type { DiscoveryResult } from "@/lib/schemas";
import { DISCOVERY_EXPLAINER, DISCOVERY_LABEL, DISCOVERY_SUBLABEL, type PaperView, type StudyView } from "@/lib/discovery";
import { EvidenceTierChip } from "@/components/EvidenceTierChip";

/** Each section repeats the tier so a screenshot of any one section is still unambiguous. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink">{title}</h2>
        <EvidenceTierChip tier="machine_assembled" />
      </div>
      <p className="mt-1 text-[11px] font-semibold tracking-wide text-unknown">
        <span aria-hidden>◌ </span>
        {DISCOVERY_LABEL} · {DISCOVERY_SUBLABEL}
      </p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="whitespace-nowrap text-xs text-brand hover:underline">
    {children} ↗
  </a>
);
const Sub = ({ children }: { children: React.ReactNode }) => <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted first:mt-0">{children}</h3>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;
const n = (x: number) => x.toLocaleString("en-US");

const STATUS_STYLE: Record<PaperView["publication_status"], string> = {
  peer_reviewed: "border-solid border-supported text-supported",
  preprint: "border-dashed border-contradictory text-contradictory",
  unknown: "border-dotted border-muted text-muted",
};
const STATUS_TEXT: Record<PaperView["publication_status"], string> = { peer_reviewed: "Peer-reviewed journal record", preprint: "▲ Preprint — not peer reviewed", unknown: "Publication status not stated" };

function Paper({ p }: { p: PaperView }) {
  return (
    <li className="py-2 text-sm">
      <a href={p.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">
        {p.label}
      </a>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className={`rounded border px-1.5 py-0.5 font-semibold ${STATUS_STYLE[p.publication_status]}`}>{STATUS_TEXT[p.publication_status]}</span>
        {p.year && <span>{p.year}</span>}
        {p.venue && <span>{p.venue}</span>}
        {p.cited_by_count != null && <span>cited by {n(p.cited_by_count)}</span>}
        {p.full_text_available && <span>open-access full text</span>}
        {p.ids.pmid && <span className="font-mono">PMID {p.ids.pmid}</span>}
        {p.ids.doi && <span className="font-mono break-all">DOI {p.ids.doi}</span>}
      </span>
      <span className="mt-1 block text-[11px] text-muted">
        Sources: {p.sources.join(" · ")}
        {p.verified_by_crossref && " · DOI metadata verified by Crossref"}
        {p.in_reviewed_graph && " · also in RarePath's reviewed graph"}
      </span>
      {p.update_notices.length > 0 && <span className="mt-1 block text-[11px] font-semibold text-contradictory">▲ {p.update_notices.join("; ")}</span>}
    </li>
  );
}

const CATEGORY_STYLE: Record<StudyView["status_category"], string> = {
  active: "border-2 border-solid border-supported bg-supported-bg text-supported",
  completed: "border-2 border-solid border-ink bg-white text-ink",
  caution: "border-2 border-double border-contradictory bg-contradictory-bg text-contradictory",
  unknown: "border-2 border-dotted border-unknown bg-unknown-bg text-unknown",
};
const CATEGORY_ICON: Record<StudyView["status_category"], string> = { active: "●", completed: "■", caution: "▲", unknown: "?" };
const INFRA_LABEL: Record<string, string> = { natural_history: "Natural history", registry: "Registry", observational_cohort: "Observational cohort", longitudinal: "Longitudinal", biobank: "Biobank / biospecimens" };
const enumText = (x?: string) => (x ? x.replace(/_/g, " ").toLowerCase() : undefined);

export function Study({ s }: { s: StudyView }) {
  const d = s.design;
  return (
    <li className="py-3 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${CATEGORY_STYLE[s.status_category]}`}>
          <span aria-hidden>{CATEGORY_ICON[s.status_category]} </span>
          {s.status_label}
        </span>
        <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">
          {s.label}
        </a>
      </span>
      <span className="mt-1 block text-[11px] font-semibold text-ink">{s.guidance}</span>
      <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-muted">Registered in:</span>
        {s.registrations.map((r) => (
          <a key={r.registry + r.id} href={r.url} target="_blank" rel="noreferrer" className="rounded border border-line px-1.5 py-0.5 font-mono hover:border-brand">
            {r.registry} · {r.id}
          </a>
        ))}
        {s.possible_duplicates && s.possible_duplicates.length > 0 && (
          <span title="Looks like another record (same title, or same sponsor and start date) but shares no registry identifier, so it is kept separate." className="rounded border-2 border-dotted border-unknown px-1.5 py-0.5 font-bold text-unknown">
            ? POSSIBLE DUPLICATE of {s.possible_duplicates.map((k) => k.replace(/^study:(nct|isrctn|eudract):/, "")).join(", ")}
          </span>
        )}
      </span>
      {s.status_category === "caution" && s.why_stopped && <span className="mt-0.5 block text-[11px] text-contradictory">Reason stated in the registry: &ldquo;{s.why_stopped}&rdquo;</span>}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className="font-mono">{s.nct}</span>
        {s.secondary_ids.map((x) => (
          <span key={x} className="font-mono">
            {x}
          </span>
        ))}
        {s.study_type && <span>{enumText(s.study_type)}</span>}
        {s.phases.length > 0 && <span>{s.phases.map((x) => x.replace("EARLY_PHASE", "Early phase ").replace("PHASE", "Phase ").replace(/^NA$/, "phase N/A")).join(", ")}</span>}
        {s.enrollment != null && (
          <span>
            {n(s.enrollment)} {s.enrollment_type === "ACTUAL" ? "enrolled" : "planned"}
          </span>
        )}
        {s.has_results && <span className="font-semibold">results posted (not an indication of success)</span>}
        {s.infrastructure.map((f) => (
          <span key={f.flag} title={f.basis} className="rounded border border-dashed border-teal px-1 text-teal">
            {INFRA_LABEL[f.flag]}
          </span>
        ))}
      </span>
      <details className="mt-1 text-[11px] text-muted">
        <summary className="cursor-pointer text-brand">Design, outcomes, people and sites</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {(
            [
              ["Allocation", enumText(d.allocation)],
              ["Intervention model", enumText(d.intervention_model)],
              ["Masking", enumText(d.masking)],
              ["Primary purpose", enumText(d.primary_purpose)],
              ["Observational model", enumText(d.observational_model)],
              ["Time perspective", enumText(d.time_perspective)],
              ["Sex", enumText(s.eligibility.sex)],
              ["Age", [s.eligibility.minimum_age, s.eligibility.maximum_age].filter(Boolean).join(" to ") || undefined],
              ["Dates", [s.start_date && `start ${s.start_date}`, s.primary_completion_date && `primary completion ${s.primary_completion_date}`, s.completion_date && `completion ${s.completion_date}`, s.last_update && `last update ${s.last_update}`].filter(Boolean).join(" · ") || undefined],
              ["Lead sponsor", s.sponsor && `${s.sponsor}${s.sponsor_class ? ` (${enumText(s.sponsor_class)})` : ""}`],
              ["Collaborators", s.collaborators.join(", ") || undefined],
              ["Responsible party", s.responsible_party],
            ] as [string, string | undefined][]
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="inline font-semibold">{k}: </dt>
                <dd className="inline">{v}</dd>
              </div>
            ))}
        </dl>
        {s.intervention_details.length > 0 && <p className="mt-2">Interventions (as registered): {s.intervention_details.map((i) => `${i.name} [${enumText(i.type)}]`).join("; ")}</p>}
        {s.outcomes.length > 0 && (
          <div className="mt-2">
            <p className="font-semibold">Registered outcome measures</p>
            <ul className="list-disc pl-4">
              {s.outcomes.slice(0, 6).map((o, i) => (
                <li key={i}>
                  <span className="uppercase">{o.role}</span>: {o.measure}
                  {o.time_frame && ` (time frame: ${o.time_frame})`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.officials.length > 0 && <p className="mt-2">Listed officials: {s.officials.map((o) => `${o.name}${o.affiliation ? ` (${o.affiliation})` : ""}`).join("; ")}</p>}
        {s.locations.length > 0 && (
          <p className="mt-2">
            Sites ({s.locations.length}): {s.locations.slice(0, 6).map((l) => [l.facility, l.city, l.state, l.country].filter(Boolean).join(", ")).join(" · ")}
            {s.locations.length > 6 ? " …" : ""}
          </p>
        )}
        {s.documents.length > 0 && (
          <p className="mt-2">
            Documents:{" "}
            {s.documents.map((x) => (
              <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="mr-2 text-brand hover:underline">
                {x.label} ↗
              </a>
            ))}
          </p>
        )}
      </details>
      {s.publications.length > 0 && (
        <span className="mt-1 block text-[11px] text-muted">
          Linked papers:{" "}
          {s.publications.slice(0, 4).map((pb) => (
            <a key={pb.url} href={pb.url} target="_blank" rel="noreferrer" className="mr-2 text-brand hover:underline" title={pb.native}>
              {pb.pmid ? `PMID ${pb.pmid}` : pb.label.slice(0, 40)} ({pb.relation === "trial_publication" ? pb.native.replace("ctgov_reference:", "registry: ").toLowerCase() : pb.relation === "trial_background_reference" ? "registry: background" : "mentions NCT"}
              {pb.publication_status === "preprint" ? ", preprint" : ""}) ↗
            </a>
          ))}
        </span>
      )}
    </li>
  );
}

export function DiscoveryPreviewView({ result }: { result: DiscoveryResult }) {
  const p = result.preview;
  const lit = p.literature;
  const r = p.rare;
  const counts: [string, number][] = [
    ["Papers (Europe PMC)", lit.total],
    ["Clinical studies", p.clinical.total],
    ["Associated genes", p.genetics.gene_total],
    ["ClinVar records", p.genetics.variant_total],
    ["GWAS associations", p.genetics.gwas_total],
    ["Datasets & collections", p.assets.dataset_total],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-unknown bg-white p-6">
        <div role="note" className="rounded-xl border-2 border-dashed border-unknown bg-unknown-bg px-4 py-3">
          <p className="text-sm font-bold tracking-wide text-unknown">
            <span aria-hidden>◌ </span>
            {DISCOVERY_LABEL} · {DISCOVERY_SUBLABEL}
          </p>
          <p className="mt-1 text-sm text-ink">{DISCOVERY_EXPLAINER}</p>
        </div>

        <p className="mt-5 text-xs text-muted">Discovery preview · Identity</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.disease.label}</h1>
          <EvidenceTierChip tier="machine_assembled" />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {p.disease.identifiers.map((x) =>
            x.id === p.disease.id && p.disease.url ? (
              <a key={x.id} href={p.disease.url} target="_blank" rel="noreferrer" className="font-mono text-brand hover:underline">
                {x.id}
              </a>
            ) : (
              <span key={x.id} className="font-mono text-muted">
                {x.id}
              </span>
            ),
          )}
        </div>
        {p.disease.synonyms.length > 0 && <p className="mt-2 text-xs text-muted">Also known as: {p.disease.synonyms.join(", ")}</p>}
        {p.disease.description && <p className="mt-3 max-w-3xl text-sm leading-relaxed">{p.disease.description}</p>}

        {p.warnings.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {p.warnings.map((w) => (
              <li key={w} className="rounded-lg bg-canvas px-3 py-2">
                <span aria-hidden>⚠ </span>
                {w}
              </li>
            ))}
          </ul>
        )}
        {!p.match.exact && p.match.alternatives.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Other matches:</span>
            {p.match.alternatives.map((a) => (
              <Link key={a.id} href={`/results?q=${encodeURIComponent(a.id)}`} className="rounded-full border border-line px-3 py-1 hover:border-brand">
                {a.name}
              </Link>
            ))}
          </div>
        )}

        <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
          {[
            ["Research Connection Strength", "Not eligible"],
            ["Research Action Brief", "Not eligible"],
            ["Reviewed by RarePath", "Not yet"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-canvas px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
              <dd className="font-semibold">
                <span aria-hidden>✕ </span>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <section aria-label="Source counts" className="rounded-2xl border border-line bg-canvas p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Records reported by the sources</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
          {counts.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-white px-3 py-2 text-center">
              <dt className="text-[11px] leading-tight text-muted">{k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{n(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-muted">
          Totals are what each source reports for this disease; RarePath shows a small, linked sample. {p.merges} duplicate records from different sources were merged by stable identifiers (DOI, PMID, ORCID, ROR, NCT…), keeping every source&apos;s provenance.
        </p>
      </section>

      <Section title="Rare-disease identity and natural history" note="Orphanet (Orphadata, CC BY 4.0) and Monarch. Epidemiology and natural-history fields are shown exactly as Orphanet records them and are not interpreted further.">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {r.mappings.map((m) => (
            <span key={m.id} className="font-mono text-muted">
              {m.id}
            </span>
          ))}
        </div>
        {r.mapping_basis && <p className="mt-1 text-[11px] text-muted">Orphanet link: {r.mapping_basis}. Diseases are never merged on a name alone.</p>}
        {r.natural_history && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Age of onset (Orphanet):</span> {r.natural_history.onset.join(", ") || "not stated"} · <span className="font-semibold">Inheritance:</span> {r.natural_history.inheritance.join(", ") || "not stated"}
          </p>
        )}
        {r.epidemiology.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
            {r.epidemiology.slice(0, 5).map((e, i) => (
              <li key={i}>
                {e.type}: {e.class ?? "class not stated"} {e.geographic && `(${e.geographic})`} {e.validation && `· ${e.validation}`}
              </li>
            ))}
          </ul>
        )}
        {!r.mappings.length && !r.natural_history && <Empty>No Orphanet record could be tied to this disease by a shared identifier.</Empty>}
      </Section>

      <Section title="Literature" note="Europe PMC search results, enriched by OpenAlex and verified against Crossref where a DOI exists. Search hits and citations are navigation leads, not findings.">
        <Sub>Most relevant</Sub>
        {lit.top.length ? (
          <ul className="divide-y divide-line">
            {lit.top.slice(0, 6).map((x) => (
              <Paper key={x.key} p={x} />
            ))}
          </ul>
        ) : (
          <Empty>No literature records returned.</Empty>
        )}
        {lit.most_cited.length > 0 && (
          <>
            <Sub>Most cited</Sub>
            <ul className="divide-y divide-line">
              {lit.most_cited.map((x) => (
                <Paper key={x.key} p={x} />
              ))}
            </ul>
          </>
        )}
        {lit.recent.length > 0 && (
          <>
            <Sub>Most recent</Sub>
            <ul className="divide-y divide-line">
              {lit.recent.map((x) => (
                <Paper key={x.key} p={x} />
              ))}
            </ul>
          </>
        )}
        {lit.citation.seed && (
          <>
            <Sub>Citation-network leads (OpenAlex)</Sub>
            <p className="text-xs text-muted">
              Around &ldquo;{lit.citation.seed.label}&rdquo;{lit.citation.citing_total ? ` (cited by ${n(lit.citation.citing_total)} works)` : ""}. Co-citation is not clinical similarity.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mt-2 text-xs font-semibold">Most-cited works citing it</p>
                <ul className="divide-y divide-line">{lit.citation.citing.length ? lit.citation.citing.map((x) => <Paper key={x.key} p={x} />) : <Empty>None returned.</Empty>}</ul>
              </div>
              <div>
                <p className="mt-2 text-xs font-semibold">Most-cited works it references</p>
                <ul className="divide-y divide-line">{lit.citation.referenced.length ? lit.citation.referenced.map((x) => <Paper key={x.key} p={x} />) : <Empty>None returned.</Empty>}</ul>
              </div>
            </div>
          </>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="People" note="Only researchers with an ORCID are shown as people; names are never merged on their own. Appearing here does not imply availability or willingness to collaborate.">
          {p.people.researchers.length ? (
            <ul className="space-y-2 text-sm">
              {p.people.researchers.map((r) => (
                <li key={r.key}>
                  <span className="font-medium">{r.name}</span>{" "}
                  {r.orcid && (
                    <a href={`https://orcid.org/${r.orcid}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-brand hover:underline">
                      ORCID {r.orcid}
                    </a>
                  )}
                  <span className="block text-[11px] text-muted">
                    {r.records} linked record{r.records === 1 ? "" : "s"} · {r.sources.join(" · ")}
                    {r.affiliations.length > 0 && ` · ${r.affiliations[0]}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No ORCID-identified researchers in the assembled records.</Empty>
          )}
        </Section>
        <Section title="Institutions" note="Institutions identified by ROR on authorship or dataset records.">
          {p.people.institutions.length ? (
            <ul className="space-y-1 text-sm">
              {p.people.institutions.map((i) => (
                <li key={i.ror} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {i.label} {i.country && <span className="text-[11px] text-muted">{i.country}</span>}
                  </span>
                  <Ext href={`https://ror.org/${i.ror}`}>ROR {i.ror}</Ext>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No ROR-identified institutions in the assembled records.</Empty>
          )}
        </Section>
      </div>

      <Section
        title={p.clinical.registries.length > 1 ? "Global clinical research" : "Clinical research"}
        note="Registered studies listing this condition, grouped by status. Completed, terminated, withdrawn and recruiting studies are never treated as equivalent, and a completed study or posted results do not mean the study succeeded. The same trial in several registries is shown once, with every registration."
      >
        {p.clinical.registries.length > 0 && (
          <div className="mb-3 rounded-lg bg-canvas p-3 text-[11px]">
            <p className="font-semibold text-ink">Registry coverage</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {p.clinical.registries.map((r) => (
                <li key={r.registry} className="rounded border border-line bg-white px-2 py-0.5">
                  {r.registry}: <strong>{r.trials}</strong> shown{r.total_reported ? ` of ${n(r.total_reported)} registered` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted">
              {p.clinical.not_on_ctgov} of {p.clinical.studies.length} trials shown are not in ClinicalTrials.gov · {p.clinical.countries.length} countries
              {p.clinical.possible_duplicates > 0 && ` · ${p.clinical.possible_duplicates} flagged as possible duplicates (kept separate: no shared registry id)`}
            </p>
            {p.clinical.countries.length > 0 && <p className="mt-1 text-muted">Countries: {p.clinical.countries.slice(0, 30).join(", ")}</p>}
            {p.clinical.registries.some((r) => r.registry === "EU Clinical Trials Register") && <p className="mt-1 text-muted">EU Clinical Trials Register statuses are shown per country as last reported to that (legacy) register and may be out of date. Source: EU Clinical Trials Register (EMA).</p>}
          </div>
        )}
        {p.clinical.studies.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
            {(
              [
                ["active", "Active / recruiting"],
                ["completed", "Completed"],
                ["caution", "Terminated / withdrawn / suspended / stopped"],
                ["unknown", "Status unknown"],
              ] as const
            ).map(([cat, label]) =>
              p.clinical.groups[cat].length ? (
                <span key={cat} className={`rounded px-2 py-0.5 font-semibold ${CATEGORY_STYLE[cat]}`}>
                  {CATEGORY_ICON[cat]} {label}: {p.clinical.groups[cat].length}
                </span>
              ) : null,
            )}
            <span className="text-muted">among {p.clinical.studies.length} trials retrieved; each card shows the registry&apos;s exact status</span>
          </div>
        )}
        {p.clinical.studies.length === 0 && <Empty>No registered studies returned for this condition.</Empty>}
        {(
          [
            ["active", "Active / recruiting: potential current research leads"],
            ["completed", "Completed: historical evidence and reusable design leads"],
            ["caution", "Terminated, withdrawn or suspended: cautions"],
            ["unknown", "Status not verified recently"],
          ] as const
        ).map(([cat, title]) =>
          p.clinical.groups[cat].length ? (
            <div key={cat}>
              <Sub>
                {title} ({p.clinical.groups[cat].length})
              </Sub>
              <ul className="divide-y divide-line">
                {p.clinical.groups[cat].slice(0, cat === "completed" ? 6 : 5).map((x) => (
                  <Study key={x.nct} s={x} />
                ))}
              </ul>
            </div>
          ) : null,
        )}
        {p.clinical.shared_endpoints.length > 0 && (
          <>
            <Sub>Shared endpoint leads</Sub>
            <p className="text-xs text-muted">These communities have used the same registered endpoint wording in studies of different conditions. A shared endpoint is not shared biology and does not mean any intervention transfers.</p>
            <ul className="mt-1 space-y-2 text-xs">
              {p.clinical.shared_endpoints.map((e) => (
                <li key={e.measure} className="rounded-lg border border-dashed border-line p-2">
                  <span className="font-semibold">&ldquo;{e.measure}&rdquo;</span>
                  <ul className="mt-1 list-disc pl-4 text-muted">
                    {e.studies.map((x) => (
                      <li key={x.nct}>
                        {x.nct} ({x.status_label}, {x.role}) · {x.conditions.join(", ")}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Genetics" note="ClinGen, Monarch, Orphanet, ClinVar, Open Targets and the GWAS Catalog. Expert-curated validity is shown apart from gene mentions and associations. An association is not causation, a shared gene is not a shared mechanism, and nothing here applies to any individual.">
        <Sub>Expert-curated gene-disease validity (ClinGen)</Sub>
        {r.validity.length ? (
          <ul className="space-y-2">
            {r.validity.map((v) => (
              <li key={v.gene + v.expert_panel} className="rounded-lg border-2 border-solid border-ink bg-white p-2 text-sm">
                <span className="mr-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">EXPERT-CURATED VALIDITY</span>
                <span className="font-semibold">{v.gene}</span>: <span className="font-semibold">{v.classification}</span>
                <span className="block text-[11px] text-muted">
                  {v.expert_panel} · {v.mode_of_inheritance} · released {v.released} · ClinGen&apos;s own classification, not a RarePath score <Ext href={v.url}>ClinGen</Ext>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No ClinGen gene-disease validity curation for this disease.</Empty>
        )}
        {r.dosage.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-muted">
            {r.dosage.map((d) => (
              <li key={d.gene}>
                ClinGen dosage sensitivity, {d.gene}: haploinsufficiency — {d.haploinsufficiency}; triplosensitivity — {d.triplosensitivity} <Ext href={d.url}>curation</Ext>
              </li>
            ))}
          </ul>
        )}
        {r.causal_genes.length > 0 && (
          <>
            <Sub>Curated causal genes (Monarch / Orphanet)</Sub>
            <ul className="flex flex-wrap gap-2 text-xs">
              {r.causal_genes.map((c, i) => (
                <li key={i} className="rounded border border-line px-2 py-0.5" title={c.detail}>
                  <span className="font-semibold">{c.gene}</span> <span className="text-muted">· {c.source}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {r.other_gene_associations.length > 0 && (
          <p className="mt-2 text-[11px] text-muted">
            Other Orphanet gene relationships (modifiers, susceptibility factors; not causal): {r.other_gene_associations.slice(0, 12).map((g) => `${g.gene} (${g.detail.split(" (")[0]})`).join("; ")}
          </p>
        )}
        <Sub>Gene mentions and associations (Open Targets): not validity classifications</Sub>
        {p.genetics.genes.length ? (
          <ul className="divide-y divide-line">
            {p.genetics.genes.slice(0, 10).map((t) => (
              <li key={t.ensembl_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-semibold">{t.symbol}</span> <span className="text-muted">{t.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {t.evidence_types.map((e) => (
                      <span key={e} className="rounded border border-dashed border-line px-1.5 py-0.5 text-[11px] text-muted">
                        {e}
                      </span>
                    ))}
                  </span>
                </span>
                <Ext href={t.url}>Open Targets evidence</Ext>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No associated targets returned.</Empty>
        )}
        <Sub>Variant classifications (ClinVar and ClinGen expert panels)</Sub>
        <p className="text-[11px] text-muted">Database classifications with their review strength. Not a personal interpretation, a diagnosis or a statement about any individual. {r.clinvar_total ? `${n(r.clinvar_total)} ClinVar records match this disease and gene.` : ""}</p>
        {r.clinvar.length ? (
          <ul className="mt-1 space-y-1 text-xs">
            {r.clinvar.map((v, i) => (
              <li key={i}>
                <span className="mr-1 inline-block w-10 font-mono text-amber" aria-label={`${v.stars} of 4 review stars`}>
                  {"★".repeat(v.stars)}
                  {"☆".repeat(4 - v.stars)}
                </span>
                <span className="font-semibold">{v.classification}</span> · {v.review_status} · <span className="break-all">{v.label}</span> <span className="text-muted">[{v.source}]</span> <Ext href={v.url}>record</Ext>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No ClinVar records returned.</Empty>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Sub>ClinVar evidence via Open Targets</Sub>
            {p.genetics.variants.length ? (
              <ul className="space-y-2 text-xs">
                {p.genetics.variants.map((v) => (
                  <li key={v.url + v.label}>
                    <span className="font-mono font-semibold">{v.label}</span> {v.statement.replace(/^ClinVar record \S+ /, "")} <Ext href={v.url}>record</Ext>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No ClinVar records returned for the top genetic associations.</Empty>
            )}
          </div>
          <div>
            <Sub>Genome-wide associations (GWAS Catalog)</Sub>
            {p.sources.find((s) => s.id === "gwas")?.status === "failed" ? (
              <Empty>The GWAS Catalog could not be reached this time.</Empty>
            ) : p.genetics.gwas.length ? (
              <ul className="space-y-2 text-xs">
                {p.genetics.gwas.map((g) => (
                  <li key={g.url + g.label}>
                    {g.statement} <Ext href={g.url}>study</Ext>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No GWAS Catalog associations are recorded for this trait (common for rare, monogenic conditions).</Empty>
            )}
          </div>
        </div>
      </Section>

      <Section title="Phenotypes (HPO annotations)" note="From HPO disease annotations and Orphanet, with frequency, onset, sex and references as the sources state them. Features documented as absent are listed separately. A shared feature does not mean a shared disease, and phenotypes are never compared by simply counting shared terms.">
        {p.phenotypes.annotated.length ? (
          <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {p.phenotypes.annotated.slice(0, 24).map((h) => (
              <li key={h.hpo}>
                <a href={h.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">
                  {h.name}
                </a>{" "}
                <span className="text-muted">
                  {[h.frequency, h.onset, h.sex].filter(Boolean).join(" · ") || "frequency not stated"} · {h.sources.join("+")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No HPO annotations returned.</Empty>
        )}
        {p.phenotypes.annotated.length > 24 && <p className="mt-1 text-[11px] text-muted">+{p.phenotypes.annotated.length - 24} more annotated features.</p>}
        <Sub>Documented as absent (NOT / excluded)</Sub>
        {p.phenotypes.excluded.length ? (
          <ul className="flex flex-wrap gap-2 text-xs">
            {p.phenotypes.excluded.map((h) => (
              <li key={h.hpo} className="rounded border-2 border-double border-contradictory px-2 py-0.5 text-contradictory">
                ✕ {h.name} <span className="text-muted">({h.sources.join("+")})</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No excluded features recorded by these sources.</Empty>
        )}
      </Section>

      <Section title="Models (preclinical / model-organism discovery)" note="Model-organism genotypes and experimental models from Monarch and the Alliance of Genome Resources. Preclinical evidence only: a model does not establish human clinical relevance.">
        {r.models.length ? (
          <ul className="space-y-1 text-xs">
            {r.models.map((m) => (
              <li key={m.id}>
                <span className="mr-1 rounded border border-dashed border-teal px-1 text-[10px] font-bold text-teal">PRECLINICAL</span>
                <span className="font-medium italic">{m.species}</span> · {m.label}
                {m.disease_context && <span className="text-muted"> · {m.disease_context}</span>} <span className="text-muted">[{m.source}]</span> <Ext href={m.url}>{m.id}</Ext>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No model-organism models returned.</Empty>
        )}
        {r.orthologs.length > 0 && <p className="mt-2 text-[11px] text-muted">Orthologs (Alliance): {r.orthologs.map((o) => `${o.symbol} (${o.species}${o.confidence ? `, ${o.confidence}` : ""})`).join("; ")}</p>}
      </Section>

      <Section title="Research assets" note="DOI-registered datasets and collections (DataCite), plus natural-history, registry, cohort and biobank studies flagged from registry fields, each with its status. These can reveal reusable recruitment infrastructure, outcome measures, longitudinal-data models, investigators and sites. Reuse terms must be checked with each repository or sponsor.">
        <Sub>Datasets and collections</Sub>
        {p.assets.datasets.length ? (
          <ul className="divide-y divide-line">
            {p.assets.datasets.map((d) => (
              <li key={d.doi} className="py-2 text-sm">
                <a href={d.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">
                  {d.label}
                </a>
                <span className="mt-1 block text-[11px] text-muted">
                  {d.resource_type}
                  {d.publisher && ` · ${d.publisher}`}
                  {d.year && ` · ${d.year}`} · <span className="font-mono break-all">DOI {d.doi}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No DataCite datasets or collections returned.</Empty>
        )}
        {p.assets.reuse_leads.length > 0 && (
          <>
            <Sub>Natural-history, registry, cohort and biobank studies (status preserved)</Sub>
            <ul className="divide-y divide-line">
              {p.assets.reuse_leads.map((s) => (
                <Study key={s.nct} s={s} />
              ))}
            </ul>
          </>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Adjacent research" note="Neighbouring disease communities suggested by sourced links. Ontology hierarchy and a shared gene are navigation leads: not clinical similarity, a shared mechanism, or a shared response to any intervention.">
          {p.adjacent.ontology.length > 0 && (
            <ul className="space-y-1 text-sm">
              {p.adjacent.ontology.map((r) => (
                <li key={r.id + r.relation}>
                  <span className="text-xs text-muted">{r.relation === "broader" ? "Broader term:" : "Narrower term:"}</span>{" "}
                  <Link href={`/results?q=${encodeURIComponent(r.id)}`} className="font-medium hover:text-brand hover:underline">
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {p.adjacent.same_gene && (
            <div className="mt-3 text-sm">
              <p className="text-xs text-muted">Other diseases Open Targets lists for {p.adjacent.same_gene.gene}:</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {p.adjacent.same_gene.diseases.map((d) => (
                  <li key={d.id}>
                    <Link href={`/results?q=${encodeURIComponent(d.id)}`} className="rounded-full border border-dashed border-line px-3 py-1 text-xs hover:border-brand">
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!p.adjacent.ontology.length && !p.adjacent.same_gene && <Empty>No adjacent communities returned.</Empty>}
        </Section>

        <Section title="Drugs and clinical candidates (research discovery only)" note="As recorded by Open Targets from clinical-trial and approval data, with the highest stage the source lists. Not a treatment recommendation, and not evaluated by RarePath.">
          {p.drugs.items.length ? (
            <ul className="space-y-1 text-sm">
              {p.drugs.items.map((d) => (
                <li key={d.chembl_id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{d.name.charAt(0) + d.name.slice(1).toLowerCase()}</span> <span className="text-xs text-muted">{[d.drug_type, d.stage].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Ext href={d.url}>{d.chembl_id}</Ext>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No drug or clinical-candidate records returned.</Empty>
          )}
        </Section>
      </div>

      <section className="rounded-2xl border border-line bg-canvas p-5 text-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Sources queried for this preview</h2>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {p.sources.map((s) => (
            <li key={s.id}>
              <span aria-hidden>{s.status === "ok" ? "● " : s.status === "empty" ? "○ " : s.status === "skipped" ? "– " : "✕ "}</span>
              <span className="font-medium">{s.name}</span>{" "}
              <span className="text-xs text-muted">
                {s.status === "ok" && `${s.records} records · ${s.ms} ms`}
                {s.status === "empty" && "no matching records"}
                {s.status === "skipped" && `skipped (${s.reason})`}
                {s.status === "failed" && `unavailable (${s.reason})`}
                {s.role === "metadata" && " · metadata verification"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Assembled {p.assembled_at.slice(0, 16).replace("T", " ")} UTC. {p.links.length} machine-assembled relationships keep their source identifiers and links. None count toward ranking or actions, and none become
          reviewed automatically, even when several sources agree.{" "}
          <Link href="/sources" className="text-brand hover:underline">
            About these research sources
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/results?q=${encodeURIComponent(result.full_journey.query)}&demo=1`} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-deep">
            Compare with a fully reviewed journey: {result.full_journey.label} →
          </Link>
          <EvidenceTierChip tier="reviewed" />
        </div>
      </section>
    </div>
  );
}

/** Verified live during implementation (2026-10-04): each resolves to an exact ontology match with literature, trials and genetics. */
export const DISCOVERY_EXAMPLES = ["Dravet syndrome", "Angelman syndrome", "Phelan-McDermid syndrome", "cystic fibrosis"] as const;

export function BroadDiscovery({ sources }: { sources: { name: string; mode: string }[] }) {
  const live = sources.filter((s) => s.mode === "live");
  return (
    <section aria-labelledby="broad-h" className="rounded-2xl border-2 border-dashed border-unknown bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="broad-h" className="text-lg font-bold tracking-tight">
          Broad discovery. <span className="text-supported">Reviewed decisions.</span>
        </h2>
        <span className="flex flex-wrap gap-2">
          <EvidenceTierChip tier="machine_assembled" />
          <EvidenceTierChip tier="reviewed" />
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        For diseases outside the reviewed slice, RarePath searches structured research ecosystems at search time and assembles candidate research connections: literature, clinical studies, genes and variants, datasets, researchers
        and institutions, each with its source link.
      </p>
      <p className="mt-2 text-sm">
        <strong>Only reviewed evidence</strong> can influence Research Connection Strength, reusable-asset recommendations or a Research Action Brief. Machine-assembled results are labelled as such and never become reviewed automatically.
      </p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Research sources connected (live)</p>
      <ul className="mt-1 flex flex-wrap gap-2 text-xs">
        {live.map((s) => (
          <li key={s.name} className="rounded-full border-2 border-dashed border-line px-2.5 py-1">
            {s.name}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Coverage depends on what these sources hold; it is not all medical literature or every rare disease.{" "}
        <Link href="/sources" className="text-brand hover:underline">
          See every source and how it is used →
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="text-muted">Try:</span>
        {DISCOVERY_EXAMPLES.map((q) => (
          <Link key={q} href={`/results?q=${encodeURIComponent(q)}`} className="rounded-full border-2 border-dashed border-line bg-white px-3 py-1 hover:border-brand hover:text-brand">
            {q}
          </Link>
        ))}
      </div>
    </section>
  );
}
