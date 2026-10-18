import Link from "next/link";
import type { DiscoveryResult, PartialDiseaseResult, SearchResult } from "@/lib/schemas";
import { rankResearchConnections, type CautionKind, type FactorKind, type RankedConnection } from "@/lib/analytics";
import { shortName } from "@/lib/journey";

/** Plain-language wording for the ranking's reasons and counterweights (the research view keeps the formal terms). */
const WHY: Record<FactorKind, (d: string) => string> = {
  shared_study: (d) => `Both are part of the same study: ${d}`,
  shared_asset: (d) => `The same research tool has been used in both: ${d}`,
  shared_phenotype: (d) => `${d[0]?.toUpperCase()}${d.slice(1)} is reported in both`,
  phenotypic_overlap: (d) => `A published source describes overlapping features (“${d}”)`,
  historical_link: () => "They were grouped together in earlier research",
};
const LIMIT: Record<CautionKind, string> = {
  contradicted_classification: "An older label linking them is contradicted by current evidence",
  clinical_differences: "Sources describe important clinical differences",
  no_mechanism_evidence: "No source shows they share the same underlying biology",
  no_treatment_transfer_evidence: "There is no evidence that a treatment for one works for the other",
};

function Meter({ score }: { score: number }) {
  const filled = Math.min(10, Math.round(score));
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`h-2 flex-1 rounded-full ${i < filled ? "bg-brand" : "bg-line"}`} />
      ))}
    </div>
  );
}

function Mark({ kind }: { kind: "yes" | "no" }) {
  return (
    <span aria-hidden className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${kind === "yes" ? "bg-sage-wash text-supported" : "bg-coral-wash text-coral-deep"}`}>
      {kind === "yes" ? "✓" : "!"}
    </span>
  );
}

function ConnectionCard({ focus, top, label, others }: { focus: string; top: RankedConnection; label: (id: string) => string; others: RankedConnection[] }) {
  return (
    <section className="space-y-5 rounded-3xl border border-line bg-white p-6 sm:p-8">
      <div className="space-y-2">
        <p className="text-sm text-muted">{focus} · from reviewed evidence</p>
        <h2 className="font-display text-2xl font-bold sm:text-3xl">The closest research community is {label(top.disease_id)}</h2>
        <div className="max-w-md space-y-1">
          <Meter score={top.score} />
          <p className="text-sm text-muted">
            {top.band} research connection · {top.score} points from reviewed research links. This measures shared research, not how alike the conditions are.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl bg-canvas p-5">
          <h3 className="font-display text-lg font-bold">Why they&apos;re connected</h3>
          <ul className="space-y-2.5">
            {top.factors.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <Mark kind="yes" />
                <span>{WHY[f.kind](f.detail)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 rounded-2xl bg-canvas p-5">
          <h3 className="font-display text-lg font-bold">Why it&apos;s not the same condition</h3>
          <ul className="space-y-2.5">
            {top.cautions.map((c, i) => (
              <li key={i} className="flex gap-2.5">
                <Mark kind="no" />
                <span>{LIMIT[c.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {others.length > 0 && (
        <p className="text-sm text-muted">
          Also connected through research: {others.map((o) => `${label(o.disease_id)} (${o.score} points)`).join(", ")}.
        </p>
      )}
    </section>
  );
}

function BriefCard({ query, opportunity, question, nextStep, generated }: { query: string; opportunity: string; question: string; nextStep?: string; generated: boolean }) {
  const q = encodeURIComponent(query);
  return (
    <section className="grid gap-6 rounded-3xl bg-coral-wash p-6 sm:p-8 md:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <p className="text-xs font-bold tracking-[0.14em] text-coral-deep uppercase">Your Action Brief</p>
        <h2 className={`font-display font-bold ${opportunity.length > 140 ? "text-xl leading-snug" : "text-2xl"}`}>{opportunity}</h2>
        <p>
          <strong>The question to ask:</strong> {question}
        </p>
        {nextStep && (
          <p>
            <strong>A next step this week:</strong> {nextStep}
          </p>
        )}
        <p className="text-sm text-muted">{generated ? "Assembled by a fixed template from reviewed evidence." : "Hand-checked against every source."} Bring it to your care team or your research advisors.</p>
      </div>
      <div className="flex flex-col gap-2 self-start md:pt-7">
        <a href={`/api/export/brief?q=${q}&format=pdf`} className="rounded-full bg-coral px-5 py-3 text-center font-semibold text-white hover:bg-coral-deep">
          Download the brief (PDF)
        </a>
        <a href={`/api/export/brief?q=${q}&format=docx`} className="rounded-full border border-coral/40 bg-white px-5 py-3 text-center font-semibold text-coral-deep hover:border-coral">
          Word version
        </a>
      </div>
    </section>
  );
}

function ResearchLink({ query }: { query: string }) {
  return (
    <p className="text-center text-sm text-muted">
      Want every source, the scoring formula and the full evidence map?{" "}
      <Link href={`/results?q=${encodeURIComponent(query)}&view=research`} className="font-semibold text-brand hover:underline">
        Switch to the research view →
      </Link>
    </p>
  );
}

/** Family view of the fully reviewed journey. */
export function FamilyJourneyView({ result }: { result: SearchResult }) {
  const labelMap = new Map(result.nodes.map((n) => [n.id, n.label]));
  const label = (id: string) => labelMap.get(id) ?? id;
  const ranked = rankResearchConnections(result.nodes, result.edges, result.disease.node_id);
  const focus = label(result.disease.node_id);
  const b = result.action_brief;
  return (
    <div className="space-y-6">
      {ranked[0] && <ConnectionCard focus={focus} top={ranked[0]} label={label} others={ranked.slice(1, 4)} />}
      {b && <BriefCard query={result.query} opportunity={b.opportunity.text} question={b.question.text} nextStep={b.this_week?.next_step.text} generated={false} />}
      <PeopleCount n={result.collaborators.length} query={result.query} />
      <ResearchLink query={result.query} />
    </div>
  );
}

function PeopleCount({ n, query }: { n: number; query: string }) {
  if (!n) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-white p-6">
      <div>
        <h2 className="font-display text-lg font-bold">{n} researchers and organisations are relevant to this path</h2>
        <p className="text-sm text-muted">From public records such as study listings and author lists. Being listed does not mean they are available to contact.</p>
      </div>
      <Link href={`/results?q=${encodeURIComponent(query)}&view=research#people`} className="font-semibold text-brand hover:underline">
        See who →
      </Link>
    </section>
  );
}

/** Family view of a disease with reviewed evidence at partial depth. */
export function FamilyPartialView({ result }: { result: PartialDiseaseResult }) {
  const labelMap = new Map(result.nodes.map((n) => [n.id, n.label]));
  const label = (id: string) => labelMap.get(id) ?? id;
  const j = result.journey;
  const focus = result.coverage.label;
  const b = j.brief;
  return (
    <div className="space-y-6">
      {j.ranked[0] ? (
        <ConnectionCard focus={focus} top={j.ranked[0]} label={label} others={j.ranked.slice(1, 4)} />
      ) : (
        <section className="space-y-2 rounded-3xl border border-line bg-white p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">{focus}</h2>
          <p>
            {j.facts.length} reviewed finding{j.facts.length === 1 ? "" : "s"} so far. No other condition shares a reviewed study or research tool with it yet, so there is no ranking.
          </p>
        </section>
      )}
      {b && <BriefCard query={result.query} opportunity={b.opportunity} question={b.question} generated />}
      {result.preview && <DiscoverySummary preview={result.preview} />}
      <ResearchLink query={result.query} />
    </div>
  );
}

function DiscoverySummary({ preview: p }: { preview: DiscoveryResult["preview"] }) {
  const active = p.clinical.groups.active ?? [];
  const n = (x: number) => x.toLocaleString("en-US");
  return (
    <section className="space-y-5 rounded-3xl border-2 border-dashed border-line bg-white p-6 sm:p-8">
      <div className="space-y-1">
        <p className="text-xs font-bold tracking-[0.14em] text-unknown uppercase">Gathered automatically · not yet reviewed</p>
        <h2 className="font-display text-2xl font-bold">What public research sources hold on {p.disease.label}</h2>
        <p className="text-sm text-muted">Collected live from public databases. No one has checked these links yet, so treat them as starting points.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Papers", p.literature.total],
          ["Clinical studies", p.clinical.total],
          ["Active or upcoming", active.length],
          ["NIH-funded projects", p.funding.total],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl bg-canvas p-4">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{n(v as number)}</dd>
          </div>
        ))}
      </dl>
      {active.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display text-lg font-bold">Studies listed as active</h3>
          <ul className="space-y-2">
            {active.slice(0, 3).map((s) => (
              <li key={s.nct}>
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-brand hover:underline">
                  {s.official_title ?? s.nct} ↗
                </a>
                <span className="block text-sm text-muted">
                  {s.status_label} · {s.nct}. Ask your care team before contacting a study: listing does not mean you are eligible.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Family view of a disease outside the reviewed graph. */
export function FamilyDiscoveryView({ result }: { result: DiscoveryResult }) {
  return (
    <div className="space-y-6">
      <DiscoverySummary preview={result.preview} />
      <ResearchLink query={result.query} />
    </div>
  );
}

export { shortName };
