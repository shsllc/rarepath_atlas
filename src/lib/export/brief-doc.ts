/**
 * One format-neutral Research Action Brief, built from either the hand-curated brief (the CDKL5 journey)
 * or the template-generated brief (any disease with reviewed evidence). Word, PDF and shared snapshots
 * all render from this, so every export carries the same limits and sources as the page.
 */
import type { SearchResponse } from "@/lib/schemas";

export interface BriefDoc {
  disease: string;
  kind: "curated" | "generated";
  opportunity: string;
  why: string[];
  existing: string[];
  people: string[];
  next_step?: string;
  question: string;
  must_validate: string[];
  does_not_mean: string[];
  cautions: string[];
  sources: { label: string; url: string }[];
  /** Absolute URL of the live page this brief came from. */
  page_url: string;
  generated_at: string;
}

export const BRIEF_FOOTER =
  "Research navigation only, not medical advice. Built only from reviewed relationships; each statement links to its source on the live page. Sources can change: check them before acting.";

export function briefDocFrom(r: SearchResponse, origin: string, now = new Date()): BriefDoc | null {
  const page_url = `${origin}/results?q=${encodeURIComponent(r.query)}`;
  const generated_at = now.toISOString();
  if ("found" in r && r.found && r.action_brief) {
    const b = r.action_brief;
    const label = new Map(r.nodes.map((n) => [n.id, n.label]));
    const disease = label.get(r.disease.node_id) ?? r.query;
    return {
      disease,
      kind: "curated",
      opportunity: b.opportunity.text,
      why: b.why_surfaced.map((x) => x.text),
      existing: b.existing_assets.map((x) => x.text),
      people: r.collaborators.filter((c) => b.who_is_relevant.includes(c.node_id)).map((c) => `${label.get(c.node_id) ?? c.node_id}: ${c.role}`),
      next_step: b.this_week?.next_step.text,
      question: b.question.text,
      must_validate: b.must_validate.map((x) => x.text),
      does_not_mean: b.does_not_mean.map((x) => x.text),
      cautions: [],
      sources: b.bring_sources.map((s) => ({ label: s.label, url: s.url })),
      page_url,
      generated_at,
    };
  }
  if ("partial" in r && r.journey.brief) {
    const b = r.journey.brief;
    return {
      disease: r.coverage.label,
      kind: "generated",
      opportunity: b.opportunity,
      why: b.why.map((w) => w.text),
      existing: [...b.assets.map((a) => a.label), ...b.studies.map((s) => `${s.label} (shared study)`)],
      people: b.team.map((t) => `${t.label}: listed study investigator`),
      question: b.question,
      must_validate: b.must_validate,
      does_not_mean: b.does_not_mean,
      cautions: b.cautions.map((c) => c.detail),
      sources: b.bring_sources,
      page_url,
      generated_at,
    };
  }
  return null;
}

/** Sections in reading order, shared by every renderer. */
export function briefSections(d: BriefDoc): { title: string; items: string[]; numbered?: boolean }[] {
  return [
    { title: "Opportunity", items: [d.opportunity] },
    { title: "Why this surfaced", items: d.why },
    { title: "Existing assets", items: d.existing },
    { title: "Who is relevant (public metadata; does not indicate willingness)", items: d.people },
    ...(d.next_step ? [{ title: "A next step this week", items: [d.next_step] }] : []),
    { title: "The question to ask", items: [d.question] },
    { title: "Must validate first", items: d.must_validate },
    { title: "This does not mean", items: d.does_not_mean },
    { title: "Counterweights on this connection", items: d.cautions },
    { title: "Bring these sources", items: d.sources.map((s) => `${s.label}: ${s.url}`), numbered: true },
  ].filter((s) => s.items.length > 0);
}

export const briefTitle = (d: BriefDoc) => `Research Action Brief: ${d.disease}`;
export const briefSubtitle = (d: BriefDoc) =>
  `${d.kind === "curated" ? "Hand-curated from analyst-reviewed evidence" : "Assembled by a fixed template from reviewed evidence (no language model)"} · RarePath Atlas · ${d.generated_at.slice(0, 10)}`;
