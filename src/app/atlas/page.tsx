import Link from "next/link";
import type { Metadata } from "next";
import { getServices } from "@/lib/services/registry";
import { coverageCounts, diseaseCoverage, TIER_META, COVERAGE_TIERS } from "@/lib/coverage";
import { CoverageDisclosure, DiseaseCoverageCard, TierBadge } from "@/components/CoverageSections";

export const metadata: Metadata = { title: "Coverage · RarePath Atlas" };

export default function AtlasPage() {
  const bundle = getServices().graph.bundle();
  const diseases = diseaseCoverage(bundle);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Explore the network</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Diseases in the atlas</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every disease shares one evidence model. Each is shown only at the depth its reviewed evidence supports, and only{" "}
          <Link href="/results?q=CDKL5&demo=1" className="font-medium text-brand hover:underline">
            CDKL5 deficiency disorder
          </Link>{" "}
          has a full, reviewed action path.
        </p>
      </div>
      <CoverageDisclosure counts={coverageCounts(bundle)} />
      <div className="space-y-3">
        {diseases.map((d) => (
          <DiseaseCoverageCard key={d.node_id} d={d} />
        ))}
      </div>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">How depth is labelled</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {COVERAGE_TIERS.map((t) => (
            <li key={t} className="flex flex-wrap items-start gap-2">
              <TierBadge tier={t} />
              <span className="text-muted">{TIER_META[t].help}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Tiers are computed from analyst-reviewed relationships only. They describe what has been reviewed, not how similar or important a disease is, and there is no numeric score.</p>
      </section>
    </div>
  );
}
