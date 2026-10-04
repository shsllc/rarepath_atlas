import "server-only";
import { bundlePath, JsonGraphService } from "./graph-service";
import { CuratedReusableAssetFinder } from "./reusable-asset-finder";
import { GraphSearchService } from "./search-service";
import { OpenAIEvidenceExtractorImpl } from "./openai/evidence-extractor";
import { OpenAIEntityReconcilerImpl } from "./openai/entity-reconciler";
import { OpenAIPathExplainerImpl } from "./openai/path-explainer";
import { getOpenAI } from "./openai/client";
import { OpenDataDiscoveryService } from "@/lib/discovery";

/**
 * Single wiring point. Loads the verified real bundle by default
 * (built offline by scripts/ — see docs/demo-path.md); DATA_BUNDLE=fixture loads the demo fixture.
 */
function build() {
  const graph = JsonGraphService.fromFile(bundlePath());
  const finder = new CuratedReusableAssetFinder(graph);
  return {
    graph,
    finder,
    // DISCOVERY=off disables the live research-API layer (reviewed search is unaffected).
    search: new GraphSearchService(graph, finder, process.env.DISCOVERY === "off" ? undefined : new OpenDataDiscoveryService()),
    ai: {
      configured: () => getOpenAI() !== null,
      extractor: new OpenAIEvidenceExtractorImpl(),
      reconciler: new OpenAIEntityReconcilerImpl(),
      explainer: new OpenAIPathExplainerImpl(),
    },
  };
}

let services: ReturnType<typeof build> | undefined;
export function getServices() {
  return (services ??= build());
}
