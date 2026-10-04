"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Core, ElementDefinition, StylesheetJson } from "cytoscape";
import type { EvidenceEdge, GraphNode } from "@/lib/schemas";
import { buildGraphView, CATEGORY_LABEL, DEFAULT_FILTERS, DEFAULT_POSITIONS, drawerTargetFor, type DrawerTarget, type GraphFilters, type NodeCategory } from "@/lib/graph-view";

const C = {
  supported: "#168C84", // teal: constructive connection
  inferred: "#4F46A5", // brand
  contradictory: "#B84A62", // rose: conflict
  unknown: "#C47A20", // amber: uncertainty
  ink: "#182033",
  brand: "#4F46A5",
};

const STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 12,
      "font-family": "Inter, system-ui, sans-serif",
      color: C.ink,
      "text-wrap": "wrap",
      "text-max-width": "150px",
      "text-valign": "bottom",
      "text-margin-y": 6,
      width: 26,
      height: 26,
      "background-color": "#e2e0ee",
      "border-width": 1.5,
      "border-color": "#4f5873",
    },
  },
  { selector: "node.cat-disease", style: { shape: "round-rectangle", "background-color": "#ECEAF8", "border-color": "#4F46A5" } },
  { selector: "node.cat-study", style: { shape: "rectangle", "background-color": "#FBF1E3", "border-color": "#9a5f17" } },
  { selector: "node.cat-asset", style: { shape: "diamond", "background-color": "#E4F3F1", "border-color": "#168C84", width: 30, height: 30 } },
  { selector: "node.cat-organization", style: { shape: "ellipse", "background-color": "#F8E9ED", "border-color": "#B84A62" } },
  { selector: "node.cat-other", style: { shape: "ellipse", "background-color": "#F5F4FA" } },
  { selector: "node.focus", style: { width: 50, height: 50, "background-color": C.brand, "border-color": C.ink, "border-width": 3, "font-size": 14, "font-weight": "bold" } },
  {
    selector: "edge",
    style: {
      width: 2,
      "curve-style": "bezier",
      "control-point-step-size": 42,
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.8,
      label: "data(label)",
      "font-size": 10,
      color: "#334155",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.9,
      "text-background-padding": "2px",
      "text-rotation": "autorotate",
    },
  },
  // Status line styles — same semantics as StatusBadge: solid / dashed / double / dotted
  { selector: "edge.status-supported", style: { "line-style": "solid", "line-color": C.supported, "target-arrow-color": C.supported } },
  { selector: "edge.status-inferred", style: { "line-style": "dashed", "line-dash-pattern": [8, 5], "line-color": C.inferred, "target-arrow-color": C.inferred } },
  {
    selector: "edge.status-contradictory",
    style: { "line-style": "solid", width: 2.5, "line-color": "#ffffff", "line-outline-width": 2, "line-outline-color": C.contradictory, "target-arrow-color": C.contradictory, color: C.contradictory, "font-weight": "bold" },
  },
  { selector: "edge.status-unknown", style: { "line-style": "dotted", "line-color": C.unknown, "target-arrow-color": C.unknown } },
  { selector: "edge.unreviewed-ai", style: { opacity: 0.55 } },
  { selector: "edge.hover", style: { width: 4, "z-index": 10 } },
  { selector: "node.hover", style: { "border-width": 3 } },
  { selector: "node:selected", style: { "border-width": 4, "border-color": C.brand, "overlay-opacity": 0.1, "overlay-color": C.brand, "overlay-padding": 6 } },
  { selector: "edge:selected", style: { width: 5, "z-index": 20, "overlay-opacity": 0.12, "overlay-color": C.brand, "overlay-padding": 4 } },
];

export function LineLegend() {
  const Line = ({ kind }: { kind: "solid" | "dashed" | "double" | "dotted" }) => (
    <svg width="36" height="10" aria-hidden>
      {kind === "double" ? (
        <>
          <line x1="0" y1="2.5" x2="36" y2="2.5" stroke={C.contradictory} strokeWidth="2" />
          <line x1="0" y1="7.5" x2="36" y2="7.5" stroke={C.contradictory} strokeWidth="2" />
        </>
      ) : (
        <line
          x1="0"
          y1="5"
          x2="36"
          y2="5"
          strokeWidth="2.5"
          stroke={kind === "solid" ? C.supported : kind === "dashed" ? C.inferred : C.unknown}
          strokeDasharray={kind === "dashed" ? "7 4" : kind === "dotted" ? "1.5 3.5" : undefined}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
  const items: [Parameters<typeof Line>[0]["kind"], string][] = [
    ["solid", "Known / supported"],
    ["dashed", "AI-inferred"],
    ["double", "Contradictory"],
    ["dotted", "Unknown"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Line style legend">
      {items.map(([k, t]) => (
        <li key={k} className="flex items-center gap-1.5">
          <Line kind={k} /> {t}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  nodes: GraphNode[];
  edges: EvidenceEdge[];
  focusId: string;
  onOpen: (t: DrawerTarget) => void;
}

export function EvidenceGraph({ nodes, edges, focusId, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const view = useMemo(() => buildGraphView(nodes, edges, focusId, filters), [nodes, edges, focusId, filters]);
  const label = useMemo(() => {
    const m = new Map(nodes.map((n) => [n.id, n.label]));
    return (id: string) => m.get(id) ?? id;
  }, [nodes]);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (cancelled || !ref.current) return;
      // Narrow screens: rotate the left-to-right story layout into a top-to-bottom one.
      const narrow = ref.current.clientWidth < 640;
      const pos = (id: string) => {
        const p = DEFAULT_POSITIONS[id];
        return p && narrow ? { x: p.y, y: p.x } : p;
      };
      const elements: ElementDefinition[] = [
        ...view.nodes.map((n) => ({ data: { id: n.id, label: n.label }, classes: n.classes, position: pos(n.id) })),
        ...view.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label }, classes: e.classes })),
      ];
      cyRef.current?.destroy();
      const cy = cytoscape({
        container: ref.current,
        elements,
        style: STYLE,
        layout:
          !filters.showAll && view.nodes.every((n) => DEFAULT_POSITIONS[n.id])
            ? { name: "preset", padding: 30 }
            : { name: "cose", padding: 30, animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 120, randomize: false },
        minZoom: 0.3,
        maxZoom: 2.5,
        wheelSensitivity: 0.2,
      });
      cy.on("tap", "edge", (ev) => {
        const t = drawerTargetFor("edge", ev.target.id(), edges, label);
        if (t) onOpenRef.current(t);
      });
      cy.on("tap", "node", (ev) => {
        const t = drawerTargetFor("node", ev.target.id(), edges, label);
        if (t) onOpenRef.current(t);
      });
      cy.on("mouseover", "edge, node", (ev) => {
        ev.target.addClass("hover");
        if (ref.current) ref.current.style.cursor = "pointer";
      });
      cy.on("mouseout", "edge, node", (ev) => {
        ev.target.removeClass("hover");
        if (ref.current) ref.current.style.cursor = "default";
      });
      cyRef.current = cy;
    })();
    return () => {
      cancelled = true;
    };
  }, [view, edges, focusId, label, filters.showAll]);

  useEffect(() => () => cyRef.current?.destroy(), []);

  const toggleCat = (c: NodeCategory) => setFilters((f) => ({ ...f, categories: { ...f.categories, [c]: !f.categories[c] } }));
  const set = (k: keyof Omit<GraphFilters, "categories">) => setFilters((f) => ({ ...f, [k]: !f[k] }));

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-wash/70 px-4 py-3 sm:px-5">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Line style = evidence status</p>
          <LineLegend />
        </div>
        <span className="text-xs text-muted" data-testid="graph-counts">
          Showing {view.nodes.length} entities · {view.edges.length} evidence-backed relationships
        </span>
      </div>
      <div ref={ref} className="h-[620px] w-full bg-[radial-gradient(#e2e0ee_1px,transparent_1px)] [background-size:22px_22px] sm:h-[540px]" role="img" aria-label="Evidence graph. Use the table below or the cards above for the same information." />
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line bg-canvas/60 px-4 py-3 text-xs sm:px-5">
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <legend className="sr-only">Entity types</legend>
          {(Object.keys(CATEGORY_LABEL) as NodeCategory[]).map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input type="checkbox" checked={filters.categories[c]} onChange={() => toggleCat(c)} /> {CATEGORY_LABEL[c]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <legend className="sr-only">Evidence options</legend>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={filters.showAll} onChange={() => set("showAll")} /> Show full graph
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={filters.supportedOnly} onChange={() => set("supportedOnly")} /> Supported only
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={filters.includeInferred} onChange={() => set("includeInferred")} /> Include inferred
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={filters.includeUnreviewedAi} onChange={() => set("includeUnreviewedAi")} /> Include analyst-unreviewed AI extractions
          </label>
        </fieldset>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">Click any line to see its source quotes, or any node to see its identifiers and relationships. Drag to pan, scroll or pinch to zoom.</p>
    </div>
  );
}
