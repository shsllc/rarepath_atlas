import "server-only";
import { DEFAULT_FIXTURE, JsonGraphService } from "./graph-service";
import { CuratedReusableAssetFinder } from "./reusable-asset-finder";
import { GraphSearchService } from "./search-service";
import { OpenAIEvidenceExtractorImpl } from "./openai/evidence-extractor";
import { OpenAIEntityReconcilerImpl } from "./openai/entity-reconciler";
import { OpenAIPathExplainerImpl } from "./openai/path-explainer";
import { getOpenAI } from "./openai/client";

/**
 * Single wiring point. To go live in Gate 2, construct the graph from provider
 * pulls (or data/cache/*.json) instead of the fixture — nothing else changes.
 */
function build() {
  const graph = JsonGraphService.fromFile(DEFAULT_FIXTURE);
  const finder = new CuratedReusableAssetFinder(graph);
  return {
    graph,
    finder,
    search: new GraphSearchService(graph, finder),
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
