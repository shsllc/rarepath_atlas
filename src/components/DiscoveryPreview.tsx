import Link from "next/link";
import type { DiscoveryResult } from "@/lib/schemas";
import { DISCOVERY_EXPLAINER, DISCOVERY_LABEL, DISCOVERY_SUBLABEL } from "@/lib/discovery";
import { EvidenceTierChip } from "@/components/EvidenceTierChip";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h2>
        <EvidenceTierChip tier="machine_assembled" />
      </div>
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

export function DiscoveryPreviewView({ result }: { result: DiscoveryResult }) {
  const p = result.preview;
  const counts: [string, number][] = [
    ["Associated genes / targets", p.counts.genes],
    ["ClinVar variant records", p.counts.variants],
    ["GWAS associations", p.counts.gwas_associations],
    ["Drug & clinical-candidate records", p.counts.drug_candidates],
    ["Ontology neighbours", p.counts.related_diseases],
    ["HPO phenotypes", p.counts.phenotypes],
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

        <p className="mt-5 text-xs text-muted">Discovery preview · Disease</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.disease.label}</h1>
          <EvidenceTierChip tier="machine_assembled" />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {p.disease.identifiers.map((x, i) =>
            i === 0 ? (
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
        {p.disease.therapeutic_areas.length > 0 && <p className="mt-2 text-xs text-muted">Therapeutic areas (per source): {p.disease.therapeutic_areas.join(", ")}</p>}

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
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Records returned by the sources</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
          {counts.map(([k, n]) => (
            <div key={k} className="rounded-xl border border-line bg-white px-3 py-2 text-center">
              <dt className="text-[11px] leading-tight text-muted">{k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{n.toLocaleString("en-US")}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Section title="Associated genes and targets" note="As listed by Open Targets, strongest first. Evidence types are the source's; a drug-trial target is not a genetic cause, and nothing here is a pathogenicity claim.">
        {p.targets.length === 0 ? (
          <p className="text-sm text-muted">No associated targets returned.</p>
        ) : (
          <ul className="divide-y divide-line">
            {p.targets.map((t) => (
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
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Variant records (ClinVar)" note="Classifications are as stated by ClinVar submitters, for the strongest genetically associated genes. RarePath has not reviewed them.">
          {p.variants.length === 0 ? (
            <p className="text-sm text-muted">No ClinVar variant records returned for the top genetic associations.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {p.variants.map((v) => (
                <li key={v.edge_id}>
                  <span className="font-mono font-semibold">{v.label}</span> {v.gene && <span className="text-muted">({v.gene})</span>}
                  <span className="block text-xs">
                    ClinVar: {v.clinical_significance.join(", ") || "not stated"} · {v.source_review_status ?? "review status not stated"}
                  </span>
                  <Ext href={v.url}>{v.record_id ?? "Record"}</Ext>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Genome-wide associations (GWAS Catalog)" note="Strongest reported associations for this trait. Statistical association, not causation.">
          {!p.sources.some((s) => s.name.startsWith("GWAS") && s.ok) ? (
            <p className="text-sm text-muted">The GWAS Catalog could not be reached this time.</p>
          ) : p.gwas.length === 0 ? (
            <p className="text-sm text-muted">No GWAS Catalog associations are recorded for this trait (common for rare, monogenic conditions).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {p.gwas.map((g) => (
                <li key={g.edge_id}>
                  <span className="font-mono font-semibold">{g.rs_id}</span> <span className="text-xs">p = {g.p_value}</span>
                  {g.mapped_genes.length > 0 && <span className="text-xs text-muted"> · mapped genes: {g.mapped_genes.join(", ")}</span>}
                  <span className="block">
                    <Ext href={g.url}>{g.accession ?? "GWAS Catalog"}</Ext>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Related diseases (ontology)" note="Broader and narrower terms in the disease ontology. Hierarchy only: not clinical similarity or equivalence.">
          {p.related.length === 0 ? (
            <p className="text-sm text-muted">No ontology neighbours returned.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {p.related.map((r) => (
                <li key={r.edge_id}>
                  <span className="text-xs text-muted">{r.relation === "broader" ? "Broader:" : "Narrower:"}</span>{" "}
                  <Link href={`/results?q=${encodeURIComponent(r.id)}`} className="font-medium hover:text-brand hover:underline">
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Drugs and clinical candidates recorded for this disease" note="As recorded by Open Targets from clinical-trial and approval data, with the highest stage the source lists. For research navigation only: not a treatment recommendation, and not evaluated by RarePath.">
          {p.drugs.length === 0 ? (
            <p className="text-sm text-muted">No drug or clinical-candidate records returned.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {p.drugs.map((d) => (
                <li key={d.chembl_id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{d.name.charAt(0) + d.name.slice(1).toLowerCase()}</span> <span className="text-xs text-muted">{[d.drug_type, d.stage].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Ext href={d.url}>{d.chembl_id}</Ext>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {p.phenotypes.length > 0 && (
        <Section title="Phenotypes (HPO, per source)">
          <ul className="flex flex-wrap gap-2 text-sm">
            {p.phenotypes.map((h) => (
              <li key={h.id}>
                <a href={h.url} target="_blank" rel="noreferrer" className="rounded-full border border-dashed border-line px-3 py-1 hover:border-brand">
                  {h.name}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <section className="rounded-2xl border border-line bg-canvas p-5 text-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Sources and provenance</h2>
        <ul className="mt-2 space-y-1">
          {p.sources.map((s) => (
            <li key={s.name}>
              <span aria-hidden>{s.ok ? "● " : "○ "}</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                {s.name}
              </a>{" "}
              <span className="text-muted">
                {s.version ? `${s.version} · ` : ""}retrieved {s.retrieved_at}
                {s.ok ? "" : " · unavailable"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {p.edges.length} machine-assembled relationships keep their source identifiers and links. None count toward ranking or actions, and none become reviewed automatically.
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

/** Verified live during implementation (2026-10-04): each resolves to an exact Open Targets match. */
export const DISCOVERY_EXAMPLES = ["Dravet syndrome", "Angelman syndrome", "Phelan-McDermid syndrome", "Prader-Willi syndrome"] as const;

export function BeyondTheDemo() {
  return (
    <section aria-labelledby="beyond-h" className="rounded-2xl border-2 border-dashed border-unknown bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="beyond-h" className="text-xs font-bold uppercase tracking-wide text-muted">
          Explore beyond the demo
        </h2>
        <EvidenceTierChip tier="machine_assembled" />
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        For diseases outside the reviewed slice, RarePath assembles a <strong>discovery graph</strong> at search time from structured public sources (Open Targets Platform and the GWAS Catalog): associated genes, ClinVar variant records,
        genome-wide associations, ontology neighbours and recorded clinical candidates, each with its source link.
      </p>
      <p className="mt-2 text-sm text-muted">
        Discovery results are labelled machine-assembled and stay separate from the reviewed layer: they never feed Research Connection Strength or a Research Action Brief. Coverage depends on what those sources hold; it is not a complete catalogue.
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
