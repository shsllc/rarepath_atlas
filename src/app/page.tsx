import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { StatusLegend } from "@/components/StatusBadge";
import { AtlasMap } from "@/components/AtlasMap";
import { CoverageDisclosure, NetworkPreview } from "@/components/CoverageSections";
import { BroadDiscovery } from "@/components/DiscoveryPreview";
import { researchSources } from "@/lib/research/registry";
import { getServices } from "@/lib/services/registry";
import { coverageCounts, diseaseCoverage } from "@/lib/coverage";
import { BRAND } from "@/lib/brand";

const EXAMPLES = ["CDKL5 deficiency disorder", "Dravet syndrome", "Rett syndrome", "SCN1A"];

const Icon = ({ d }: { d: string }) => (
  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default async function Home() {
  const bundle = (await getServices().reviewedGraph()).bundle();
  const focus = bundle.nodes.find((n) => n.id === bundle.focus_disease_id)?.label ?? "the reviewed journey";
  const liveSources = researchSources().filter((s) => s.mode === "live").length;

  return (
    <div className="space-y-16">
      {/* Hero: search first, the real evidence map beside it */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <p className="inline-flex rounded-full bg-coral-wash px-3 py-1 text-sm font-bold text-coral-deep">Free for families · built for research teams</p>
          <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl xl:text-[3.6rem]">
            Find the research already connected to <span className="text-brand">your rare disease.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-ink/80">
            {BRAND.short} shows which studies, research tools and communities link to a diagnosis, what each link is based on, and what argues against it. {BRAND.tagline}
          </p>
          <SearchBox />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Try</span>
            {EXAMPLES.map((e) => (
              <Link key={e} href={`/results?q=${encodeURIComponent(e)}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-brand hover:text-brand">
                {e}
              </Link>
            ))}
          </div>
        </div>
        <figure className="rounded-3xl border border-line bg-white p-3 shadow-[0_30px_60px_-40px_rgba(40,36,110,.45)]">
          <AtlasMap bundle={bundle} />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 px-3 pt-1 pb-2 text-xs text-muted">
            <span>From reviewed evidence: {focus} and its closest research communities.</span>
            <Link href="/results?q=CDKL5&view=research" className="font-semibold text-brand hover:underline">
              Open this map →
            </Link>
          </figcaption>
        </figure>
      </section>

      {/* Two doors */}
      <section id="families" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-3xl bg-coral-wash p-7">
          <p className="text-xs font-bold tracking-[0.14em] text-coral-deep uppercase">For families and patient groups</p>
          <h2 className="font-display text-2xl font-bold">Understand where research on your condition stands</h2>
          <ul className="space-y-2 text-ink/85">
            <li>Plain-language results: who is studying it, and which other conditions research connects it to</li>
            <li>What each finding is based on, and what argues against it</li>
            <li>A one-page Action Brief to bring to your care team or research advisors</li>
          </ul>
          <div className="mt-auto flex flex-wrap gap-3">
            <Link href="/results?q=CDKL5&view=family" className="rounded-full bg-coral px-5 py-2.5 font-semibold text-white hover:bg-coral-deep">
              See an example
            </Link>
            <span className="self-center text-sm text-muted">No account needed</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-3xl bg-ink p-7 text-white">
          <p className="text-xs font-bold tracking-[0.14em] text-[#b7b2f5] uppercase">For research teams and funders</p>
          <h2 className="font-display text-2xl font-bold">An evidence map you can audit</h2>
          <ul className="space-y-2 text-white/85">
            <li>Research-connection rankings with the formula and counter-evidence in view</li>
            <li>Live discovery across {liveSources} public sources, labelled separately from reviewed evidence</li>
            <li>Review queue with an audit trail, alerts, and exports to PDF, Word, BibTeX and RIS</li>
          </ul>
          <div className="mt-auto flex flex-wrap gap-3">
            <Link href="/research" className="rounded-full bg-white px-5 py-2.5 font-semibold text-ink hover:bg-brand-wash">
              For research teams
            </Link>
            <Link href="/results?q=CDKL5&view=research" className="self-center text-sm font-semibold text-[#cfcbff] hover:underline">
              Open the research view →
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="grid gap-6 sm:grid-cols-3">
        {[
          { d: "M9 12l2 2 4-4M7 3h7l5 5v13H7z", t: "Every claim has a source", b: "Open the paper, trial record or registry entry behind any connection, with its exact quote and retrieval date." },
          { d: "M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zm10 0-3 7a3 3 0 0 0 6 0z", t: "The other side, always", b: "Counter-evidence and limits sit next to every connection. A strong research link never means the same disease." },
          { d: "M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z", t: "Free and private for families", b: "No ads, no tracking pixels, nothing sold. Searching never needs an account." },
        ].map((x) => (
          <div key={x.t} className="space-y-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-wash text-brand">
              <Icon d={x.d} />
            </span>
            <h3 className="font-display text-lg font-bold">{x.t}</h3>
            <p className="text-ink/75">{x.b}</p>
          </div>
        ))}
      </section>

      {/* How it works: a real sequence, so it is numbered */}
      <section className="rounded-3xl border border-line bg-white p-7 sm:p-10">
        <h2 className="font-display text-2xl font-bold">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            ["Search", "Type a diagnosis, gene or symptom. Reviewed journeys appear first; anything else is gathered live from public research sources."],
            ["See the connections", "Neighbouring research communities, shared studies and reusable research tools, each with its evidence and its limits."],
            ["Take the next step", "Download an Action Brief, watch for new research, or share a link with your team."],
          ].map(([t, b], i) => (
            <li key={t} className="space-y-2">
              <span className="font-mono text-sm text-coral-deep">0{i + 1}</span>
              <h3 className="font-display text-lg font-bold">{t}</h3>
              <p className="text-ink/75">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What's covered */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-bold">What&apos;s covered today</h2>
          <p className="text-muted">One fully reviewed journey, further diseases at partial depth, and live discovery for the rest.</p>
        </div>
        <NetworkPreview diseases={diseaseCoverage(bundle)} />
        <CoverageDisclosure counts={coverageCounts(bundle)} />
        <BroadDiscovery sources={researchSources()} />
        <div className="flex justify-center pt-2">
          <StatusLegend />
        </div>
      </section>
    </div>
  );
}
