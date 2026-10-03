import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { StatusLegend } from "@/components/StatusBadge";

const examples = ["CDKL5", "CDKL5 deficiency disorder", "CDD", "Seizure", "Rett syndrome"];

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl pt-8 text-center sm:pt-12">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">RarePath Atlas</h1>
      <p className="mt-2 text-xl text-muted">Rare shouldn&apos;t mean researching alone.</p>
      <p className="mx-auto mt-5 max-w-xl text-lg">
        RarePath connects scattered disease research, patient communities, studies and reusable research infrastructure, with evidence behind every connection.
      </p>

      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/results?q=CDKL5&demo=1" className="rounded-lg bg-ink px-5 py-3 font-semibold text-white hover:opacity-90">
          Start the 60-second demo
        </Link>
        <a href="#search" className="rounded-lg border-2 border-ink px-5 py-3 font-semibold hover:bg-white">
          Search on your own
        </a>
      </div>

      <p className="mt-4 text-xs text-muted">Evidence extraction, entity reconciliation and path explanations powered by OpenAI.</p>

      <div id="search" className="mt-12 scroll-mt-8">
        <SearchBox />
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          {examples.map((e) => (
            <Link key={e} href={`/results?q=${encodeURIComponent(e)}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-ink">
              {e}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-3 text-left sm:grid-cols-3">
        {[
          ["Find shared research history", "See which other rare-disease communities your disease has already been studied alongside, and why."],
          ["Spot what may be reusable", "Natural-history studies, outcome measures and biobanks, each classified cautiously."],
          ["Leave with a next question", "Every claim opens to its exact source quote, with differences and uncertainty shown."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border border-line bg-white p-4">
            <h2 className="text-sm font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <StatusLegend />
      </div>
      <p className="mt-6 text-xs text-muted">
        Prototype covering one verified journey (CDKL5 deficiency disorder), built from retrieved public sources. A research-navigation tool, not a diagnosis or treatment tool.
      </p>
    </div>
  );
}
