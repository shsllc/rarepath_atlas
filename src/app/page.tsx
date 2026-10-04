import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { StatusLegend } from "@/components/StatusBadge";
import { BrandMark } from "@/components/BrandMark";
import { CoverageDisclosure, NetworkPreview } from "@/components/CoverageSections";
import { BroadDiscovery } from "@/components/DiscoveryPreview";
import { researchSources } from "@/lib/research/registry";
import { getServices } from "@/lib/services/registry";
import { coverageCounts, diseaseCoverage } from "@/lib/coverage";

const examples = ["CDKL5", "CDKL5 deficiency disorder", "STK9", "MONDO:0100039", "Seizure", "Rett syndrome"];

export default function Home() {
  const bundle = getServices().graph.bundle();
  return (
    <div className="mx-auto max-w-3xl">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-white px-6 py-10 text-center shadow-sm sm:px-12 sm:py-14">
        {/* Subtle brand wash: two soft tinted discs, no gradients across the page */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand-wash" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-teal-wash" />
        <div className="relative">
          <BrandMark size={44} className="mx-auto" />
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
            RarePath <span className="text-brand">Atlas</span>
          </h1>
          <p className="mt-3 text-xl font-medium text-supported sm:text-2xl">Rare shouldn&apos;t mean researching alone.</p>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink/85">
            RarePath connects scattered disease research, patient communities, studies and reusable research infrastructure, with evidence behind every connection.
          </p>
          <p className="mx-auto mt-3 max-w-xl rounded-xl bg-brand-wash px-4 py-2 text-sm text-ink">
            <strong>For rare-disease patient-group leaders:</strong> find what another community has already built that you could reuse, and leave with a sourced next step.{" "}
            <span className="text-muted">Prototype scope: one fully verified journey, CDKL5 deficiency disorder.</span>
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/results?q=CDKL5&demo=1"
              className="w-full rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white shadow-md shadow-brand/20 transition hover:bg-brand-deep sm:w-auto"
            >
              Start the 60-second demo →
            </Link>
            <a href="#search" className="w-full rounded-xl border border-line bg-white px-6 py-3.5 text-base font-semibold text-ink transition hover:border-brand sm:w-auto">
              Search on your own
            </a>
          </div>

          <p className="mt-5 text-xs text-muted">Evidence extraction, entity reconciliation and path explanations powered by OpenAI.</p>
        </div>
      </section>

      <div id="search" className="mx-auto mt-10 max-w-2xl scroll-mt-8 text-center">
        <SearchBox />
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {examples.map((e) => (
            <Link key={e} href={`/results?q=${encodeURIComponent(e)}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-brand hover:text-brand">
              {e}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
        {[
          ["Find shared research history", "See which other rare-disease communities your disease has already been studied alongside, and why.", "bg-brand-wash"],
          ["Spot what may be reusable", "Natural-history studies, outcome measures and biobanks, each classified cautiously.", "bg-teal-wash"],
          ["Leave with a next question", "Every claim opens to its exact source quote, with differences and uncertainty shown.", "bg-amber-wash"],
        ].map(([t, d, tint], i) => (
          <div key={t} className="rounded-2xl border border-line bg-white p-5">
            <span aria-hidden className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-ink ${tint}`}>
              {i + 1}
            </span>
            <h2 className="mt-3 text-sm font-semibold">{t}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <NetworkPreview diseases={diseaseCoverage(bundle)} />
      </div>
      <div className="mt-4">
        <CoverageDisclosure counts={coverageCounts(bundle)} />
      </div>
      <div className="mt-4">
        <BroadDiscovery sources={researchSources()} />
      </div>
      <div className="mt-8 flex justify-center">
        <StatusLegend />
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted">
        Prototype with one fully verified journey (CDKL5 deficiency disorder) and further diseases at partial-evidence depth, built from retrieved public sources. A research-navigation tool, not a diagnosis or treatment tool.
      </p>
    </div>
  );
}
