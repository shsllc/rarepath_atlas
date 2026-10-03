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
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
        <span className="text-muted">Try:</span>
        {examples.map((e) => (
          <Link key={e} href={`/results?q=${encodeURIComponent(e)}`} className="rounded-full border border-line bg-white px-3 py-1 hover:border-ink">
            {e}
          </Link>
        ))}
      </div>
      <div className="mt-12 flex justify-center">
        <StatusLegend />
      </div>
      <p className="mt-6 text-xs text-muted">Prototype covering one verified journey (CDKL5 deficiency disorder), built from retrieved public sources. Not a diagnosis or treatment tool.</p>
    </div>
  );
}
