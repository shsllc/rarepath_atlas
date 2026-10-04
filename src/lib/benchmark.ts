/**
 * Single exploratory prototype benchmark (see docs/benchmark.md).
 * Measures DISCOVERY + EVIDENCE ASSEMBLY only, not treatment development,
 * scientific validation, clinical research or drug development.
 * The measured result is below 10×, and it is reported as measured.
 */
export const BENCHMARK = {
  label: "Prototype benchmark (one run, exploratory)",
  scope: "Discovery and evidence assembly only: finding shared research infrastructure, a resulting research asset, and the sources for both.",
  task: "Starting only from \"CDKL5 deficiency disorder\": find evidence of shared research infrastructure with another rare-disease community, a related reusable research asset, and the sources supporting both.",
  manual: { seconds: 93, searches: 3, sourceSystems: 3, evidenceOpenings: 5 },
  rarepath: { seconds: 22, searches: 1, sourceSystems: 1, evidenceOpenings: 1 },
  caveats: [
    "One run, performed by an AI agent driving a browser, not by a patient-organization volunteer.",
    "The manual run was done with prior knowledge of where the answer was, so it is an optimistic lower bound for manual effort.",
    "Below 10×. The result is reported as measured; it supports a step-reduction story, not a 10× claim.",
  ],
} as const;

export const ratio = (a: number, b: number) => Math.round((a / b) * 10) / 10;
