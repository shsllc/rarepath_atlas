import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { StatusLegend } from "@/components/StatusBadge";

const examples = ["CDKL5", "CDKL5 deficiency disorder", "CDD", "Seizure", "Rett syndrome"];

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl pt-12 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Rare shouldn&apos;t mean researching alone.</h1>
      <p className="mt-3 text-muted">
        Find what another rare-disease community has already built — protocols, registries, outcome measures — that yours may be able to reuse,
        with the evidence for and against.
      </p>
      <div className="mt-8">
        <SearchBox />
      </div>
      <Link
        href="/results?q=CDKL5&demo=1"
        className="mt-5 inline-flex items-center gap-2 rounded-lg border-2 border-ink bg-white px-4 py-2 text-sm font-semibold hover:bg-ink hover:text-white"
      >
        Start the 60-second demo: CDKL5 deficiency disorder →
      </Link>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
        <span className="text-muted">Try:</span>
        {examples.map((e) => (
          <Link key={e} href={`/results?q=${encodeURIComponent(e)}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-ink">
            {e}
          </Link>
        ))}
      </div>
      <div className="mt-12 grid gap-3 text-left sm:grid-cols-3">
        {[
          ["Find shared research history", "See which other rare-disease communities your disease has already been studied alongside, and why."],
          ["Spot what may be reusable", "Natural-history infrastructure, outcome measures and biobanks, each classified conservatively."],
          ["Leave with a next question", "Every claim opens to its verbatim source quote, with differences and uncertainty shown."],
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
      <p className="mt-6 text-xs text-muted">Prototype covering one verified journey (CDKL5 deficiency disorder), built from retrieved public sources. Not a diagnosis or treatment tool.</p>
    </div>
  );
}
