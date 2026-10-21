import Link from "next/link";
import { researchSources } from "@/lib/research/registry";
import { FACTOR_CAPS, FACTOR_WEIGHTS } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata = { title: "For research teams" };

export default function ResearchPage() {
  const sources = researchSources();
  const live = sources.filter((s) => s.mode === "live");
  const features = [
    ["Rankings you can check", "Neighbouring research communities ranked by reviewed links only, with the formula, every contributing source and every counterweight shown beside the score."],
    ["Two evidence tiers, never mixed", "Reviewed evidence drives rankings and briefs. Machine-assembled discovery is labelled on every record and can only be promoted by a reviewer."],
    [`Live discovery from ${live.length} sources`, "Literature and preprints, trials across three registries, genetics, Orphanet, model organisms and NIH-funded projects, reconciled by stable identifiers."],
    ["Review queue with an audit trail", "Reviewers check each claim against its source, record a confidence and a note, and can withdraw decisions. Every action is logged."],
    ["Organisations and roles", "Owners invite members, reviewers and admins. Decisions carry the reviewer's name and organisation."],
    ["Alerts and exports", "Watch any disease for new papers, studies, grants and reviewed findings. Export briefs to PDF or Word and sources to BibTeX or RIS."],
  ];
  return (
    <div className="space-y-14">
      <section className="space-y-5 rounded-3xl bg-ink p-8 text-white sm:p-12">
        <p className="text-xs font-bold tracking-[0.14em] text-[#b7b2f5] uppercase">{BRAND.name} for research teams</p>
        <h1 className="max-w-3xl font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl">An evidence map for rare disease that you can audit.</h1>
        <p className="max-w-2xl text-lg text-white/80">
          See how a disease connects to neighbouring research communities through shared studies, shared research tools and shared clinical features, and see exactly why, from which source, and what argues against it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/results?q=CDKL5&view=research" className="rounded-full bg-white px-5 py-2.5 font-semibold text-ink hover:bg-brand-wash">
            Open the CDKL5 research view
          </Link>
          {accountsEnabled() && (
            <Link href="/account/sign-up?next=/account" className="rounded-full border border-white/30 px-5 py-2.5 font-semibold hover:border-white">
              Create an organisation
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([t, b]) => (
          <div key={t} className="space-y-2 border-t-2 border-ink pt-4">
            <h2 className="font-display text-lg font-bold">{t}</h2>
            <p className="text-ink/75">{b}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 rounded-3xl border border-line bg-white p-7 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-bold">The whole formula</h2>
          <p className="text-ink/75">
            Research connection strength counts reviewed, sourced research links between two diseases. It is not a measure of biological or clinical similarity, and contradicted, inferred or AI-only links add nothing.
          </p>
          <Link href="/sources" className="font-semibold text-brand hover:underline">
            Sources and methods →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                <th className="py-2 pr-4 font-semibold">Reviewed link</th>
                <th className="py-2 font-semibold">Points</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(FACTOR_WEIGHTS).map(([k, f]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-4">{f.label}</td>
                  <td className="py-2.5 font-mono tabular-nums whitespace-nowrap">
                    +{f.points}
                    {FACTOR_CAPS[k as keyof typeof FACTOR_CAPS] ? <span className="text-muted"> each, max {FACTOR_CAPS[k as keyof typeof FACTOR_CAPS]}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Live sources</h2>
        <div className="flex flex-wrap gap-2">
          {live.map((s) => (
            <a key={s.name} href={s.homepage} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-brand hover:text-brand">
              {s.name}
            </a>
          ))}
        </div>
        <p className="text-sm text-muted">What {BRAND.short} uses from each source, and how, is listed on the sources page.</p>
      </section>

      <section className="rounded-3xl bg-brand-wash p-7 sm:p-10">
        <h2 className="font-display text-2xl font-bold">Organisation plans are coming</h2>
        <p className="mt-2 max-w-2xl text-ink/80">
          Searching, journeys, briefs, alerts and exports are free today. Team plans with shared watchlists, organisation review queues and an API are in development, and patients and families will always use {BRAND.short} for free.
        </p>
      </section>
    </div>
  );
}
