import fs from "node:fs";
import path from "node:path";
import { GraphBundle, type EvidenceEdge, type GraphNode, type Predicate } from "@/lib/schemas";
import type { GraphService } from "./interfaces";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** In-memory graph over a validated JSON bundle. Swap the loader for a DB later. */
export class JsonGraphService implements GraphService {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, EvidenceEdge>();
  private byNode = new Map<string, EvidenceEdge[]>();

  constructor(private readonly data: GraphBundle) {
    for (const n of data.nodes) this.nodes.set(n.id, n);
    for (const e of data.edges) {
      this.edges.set(e.id, e);
      for (const id of [e.subject_id, e.object_id]) {
        const list = this.byNode.get(id) ?? [];
        list.push(e);
        this.byNode.set(id, list);
      }
    }
  }

  static fromFile(file: string): JsonGraphService {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return new JsonGraphService(GraphBundle.parse(raw));
  }

  getNode(id: string) {
    return this.nodes.get(id);
  }

  getEdge(id: string) {
    return this.edges.get(id);
  }

  edgesFor(nodeId: string) {
    return this.byNode.get(nodeId) ?? [];
  }

  neighbors(nodeId: string, predicates?: Predicate[]) {
    return this.edgesFor(nodeId)
      .filter((e) => !predicates || predicates.includes(e.predicate))
      .map((edge) => {
        const otherId = edge.subject_id === nodeId ? edge.object_id : edge.subject_id;
        return { node: this.nodes.get(otherId)!, edge };
      })
      .filter((x) => x.node);
  }

  resolve(query: string) {
    const q = norm(query);
    if (!q) return undefined;
    for (const n of this.nodes.values()) {
      if (norm(n.label) === q || n.aliases.some((a) => norm(a) === q)) return n;
      if (n.external_ids.some((x) => x.id !== "pending" && norm(x.id) === q)) return n;
    }
    return undefined;
  }

  bundle() {
    return this.data;
  }
}

export const DEFAULT_FIXTURE = path.join(process.cwd(), "data", "fixtures", "cdd-demo.json");
