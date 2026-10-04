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

export function Study({ s }: { s: StudyView }) {
  return (
    <li className="py-2 text-sm">
      <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">
        {s.label}
      </a>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <span className="rounded border border-solid border-ink px-1.5 py-0.5 font-semibold text-ink">{s.status_label}</span>
        <span className="font-mono">{s.nct}</span>
        {s.phases.length > 0 && <span>{s.phases.map((x) => x.replace("EARLY_PHASE", "Early phase ").replace("PHASE", "Phase ").replace(/^NA$/, "N/A")).join(", ")}</span>}
        {s.study_type && <span>{s.study_type.toLowerCase()}</span>}
        {s.enrollment != null && <span>{n(s.enrollment)} enrolled/planned</span>}
        {(s.start_date || s.completion_date) && (
          <span>
            {s.start_date ?? "?"} → {s.completion_date ?? "?"}
          </span>
        )}
      </span>
      <span className="mt-1 block text-[11px] text-muted">
        {s.sponsor && <>Sponsor: {s.sponsor}</>}
        {s.collaborators.length > 0 && <> · Collaborators: {s.collaborators.slice(0, 3).join(", ")}</>}
        {s.countries.length > 0 && <> · {s.countries.slice(0, 4).join(", ")}</>}
      </span>
      {s.officials.length > 0 && <span className="mt-1 block text-[11px] text-muted">Listed officials: {s.officials.map((o) => `${o.name}${o.affiliation ? ` (${o.affiliation})` : ""}`).join("; ")}</span>}
    </li>
  );
}

export function DiscoveryPreviewView({ result }: { result: DiscoveryResult }) {
  const p = result.preview;
  const lit = p.literature;
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

      <Section title="Clinical research" note="ClinicalTrials.gov studies listing this condition. Each study keeps its own status: completed, terminated, withdrawn and recruiting are never treated as equivalent.">
        {p.clinical.status_counts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
            {p.clinical.status_counts.map((s) => (
              <span key={s.status} className="rounded border border-line px-2 py-0.5">
                {s.label}: <strong>{s.count}</strong>
              </span>
            ))}
            <span className="text-muted">in the {p.clinical.studies.length} most relevant of {n(p.clinical.total)} studies</span>
          </div>
        )}
        {p.clinical.studies.length ? (
          <ul className="divide-y divide-line">
            {p.clinical.studies.slice(0, 8).map((s) => (
              <Study key={s.nct} s={s} />
            ))}
          </ul>
        ) : (
          <Empty>No ClinicalTrials.gov studies returned for this condition.</Empty>
        )}
      </Section>

      <Section title="Genetics" note="Open Targets, ClinVar (via Open Targets) and the GWAS Catalog. An association is not causation, a drug-trial target is not a genetic cause, and nothing here applies to any individual.">
        <Sub>Associated genes and targets</Sub>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Sub>Variant records (ClinVar)</Sub>
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

      <Section title="Research assets" note="DOI-registered datasets and collections (DataCite), plus natural-history, registry or biobank studies with their status. Reuse terms must be checked with each repository or sponsor.">
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
            <Sub>Potential reuse leads (status preserved)</Sub>
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

export function BroadDiscovery({ sources }: { sources: { name: string; mode: "live" | "offline" }[] }) {
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
