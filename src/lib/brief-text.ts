import type { ActionBrief, Collaborator } from "@/lib/schemas";

/** Plain-text Research Action Brief for copy/paste into a meeting. Always includes limitations and sources. */
export function briefAsText(brief: ActionBrief, collaborators: Collaborator[], label: (id: string) => string) {
  const tw = brief.this_week;
  const L = (xs: { text: string }[]) => xs.map((x) => `- ${x.text}`).join("\n");
  return [
    "RESEARCH ACTION BRIEF: CDKL5 deficiency disorder (RarePath Atlas)",
    "",
    "OPPORTUNITY",
    brief.opportunity.text,
    "",
    tw ? `WHAT CAN THIS PATIENT GROUP DO THIS WEEK?\n${tw.next_step.text}` : "",
    "",
    "RELEVANT DESTINATIONS TO VERIFY THIS OPPORTUNITY",
    ...(tw?.destinations.map((d) => `- ${label(d.node_id)}: ${d.why}`) ?? []),
    "",
    "WHO IS RELEVANT TO THIS RESEARCH PATH (public metadata; does not indicate willingness)",
    ...collaborators.filter((c) => brief.who_is_relevant.includes(c.node_id)).map((c) => `- ${label(c.node_id)}: ${c.role}`),
    "",
    "EVIDENCE TO BRING",
    ...brief.bring_sources.map((b) => `- ${b.label}: ${b.url}`),
    "",
    "QUESTION TO ASK",
    brief.question.text,
    "",
    "WHAT MUST BE VERIFIED",
    L(brief.must_validate),
    "",
    "WHAT THIS DOES NOT MEAN",
    L(brief.does_not_mean),
    "",
    "Research navigation only, not medical advice. Every statement links to its source at https://rarepathatlas.netlify.app/results?q=CDKL5",
  ]
    .filter((x) => x !== undefined)
    .join("\n");
}
