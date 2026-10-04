"use client";

import { useState } from "react";
import type { ActionBrief, Collaborator, GraphNode, SearchResult } from "@/lib/schemas";
import type { RankedConnection } from "@/lib/analytics";
import { BENCHMARK, ratio } from "@/lib/benchmark";
import { HYPOTHESIS } from "@/lib/tenx";

type Open = (title: string, edgeIds: string[]) => void;

function EvBtn({ ids, open, title, label = "Evidence", dark = false }: { ids: string[]; open: Open; title: string; label?: string; dark?: boolean }) {
  if (!ids.length) return null;
  return (
    <button
      onClick={() => open(title, ids)}
      aria-label={`${label}: ${title}`}
      className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${dark ? "border-white/40 text-white hover:bg-white/10" : "border-line bg-white text-ink hover:border-brand hover:text-brand"}`}
    >
      {label} ({ids.length})
    </button>
  );
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** CDD community → research connection → reusable asset → relevant investigator → patient-group action. */
export function JourneyStrip({ brief, top, label }: { brief: ActionBrief; top?: RankedConnection; label: (id: string) => string }) {
  const tw = brief.this_week;
  const steps = [
    { k: "CDD community", v: tw ? tw.community_ids.map(label).join(" · ") : "", to: "people" },
    { k: "Research connection", v: top ? `${label(top.disease_id)} (#1)` : "", to: "ranking" },
    { k: "Reusable asset", v: label(brief.existing_assets[0]?.asset_id ?? "").replace(/ \(.*\)$/, ""), to: "hero" },
    { k: "Relevant investigators", v: brief.who_is_relevant.filter((id) => id.startsWith("researcher:")).map((id) => label(id).replace(/,.*$/, "").replace(/ \(.*\)$/, "")).join(", "), to: "brief" },
    { k: "Patient-group action", v: "What to do this week", to: "this-week" },
  ];
  return (
    <nav aria-label="Patient-group journey" className="mt-3 rounded-2xl border border-line bg-white p-3 sm:p-4">
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.k} className="relative">
            <button onClick={() => scrollTo(s.to)} className="h-full w-full rounded-xl bg-canvas px-3 py-2 text-left transition hover:bg-brand-wash">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-brand">
                {i + 1}. {s.k}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-ink">{s.v}</span>
            </button>
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-muted sm:block">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function briefAsText(brief: ActionBrief, collaborators: Collaborator[], label: (id: string) => string) {
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

/** The final, unmissable action. */
export function ThisWeekPanel({ brief, collaborators, nodes, open, label }: { brief: ActionBrief; collaborators: Collaborator[]; nodes: Map<string, GraphNode>; open: Open; label: (id: string) => string }) {
  const tw = brief.this_week;
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  if (!tw) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(briefAsText(brief, collaborators, label));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }
  return (
    <article id="this-week" aria-label="What can this patient group do this week" className="scroll-mt-6 overflow-hidden rounded-3xl border-2 border-teal bg-white shadow-lg shadow-teal/10">
      <header className="bg-teal px-5 py-4 text-white sm:px-7">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/85">What can this patient group do this week?</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-lg font-semibold leading-snug sm:text-xl">{tw.next_step.text}</p>
          <EvBtn ids={tw.next_step.evidence_edge_ids} open={open} title="This week: next step" dark />
        </div>
      </header>
      <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">For: CDD community</h3>
          <p className="mt-1 text-sm">
            {tw.community_ids.map((id) => label(id)).join(" · ")}{" "}
            <EvBtn ids={tw.community_evidence_edge_ids} open={open} title="CDD community organizations" />
          </p>
        </section>
        <section className="rounded-2xl border border-line p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Relevant destinations to verify this opportunity</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {tw.destinations.map((d) => (
              <li key={d.node_id} className="flex items-start justify-between gap-2">
                <span>
                  <strong>{nodes.get(d.node_id)?.label ?? d.node_id}</strong>
                  <span className="block text-muted">{d.why}</span>
                </span>
                <EvBtn ids={d.evidence_edge_ids} open={open} title={`Destination: ${nodes.get(d.node_id)?.label ?? d.node_id}`} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">No contact details are stored. Listing a destination does not indicate availability or willingness.</p>
        </section>
        <section className="rounded-2xl border border-line p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Evidence to bring</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {brief.bring_sources.map((b) => (
              <li key={b.url} className="flex items-start justify-between gap-2">
                <a href={b.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-brand">
                  {b.label.split(":")[0]}
                </a>
                <EvBtn ids={b.evidence_edge_ids} open={open} title={b.label} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl bg-ink p-4 text-white">
          <h3 className="text-xs font-bold uppercase tracking-wide text-white/75">Question to ask</h3>
          <p className="mt-1 font-semibold leading-snug">{brief.question.text}</p>
        </section>
        <section className="rounded-2xl bg-amber-wash p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-unknown">What must be verified</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {brief.must_validate.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span>
                  <span aria-hidden className="mr-1">?</span>
                  {l.text}
                </span>
                <EvBtn ids={l.evidence_edge_ids} open={open} title={l.text.slice(0, 70)} />
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl bg-rose-wash p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-contradictory">What this does not mean</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {brief.does_not_mean.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span>
                  <span aria-hidden className="mr-1">▲</span>
                  {l.text}
                </span>
                <EvBtn ids={l.evidence_edge_ids} open={open} title={l.text.slice(0, 70)} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 sm:px-7">
        <button onClick={copy} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand">
          Copy Research Action Brief
        </button>
        <span role="status" className="text-xs text-muted">
          {copied === "ok" ? "Copied as plain text, with source links." : copied === "fail" ? "Copy was blocked by the browser. Select and copy the text instead." : "Plain text with source links, ready for a meeting."}
        </span>
      </footer>
    </article>
  );
}

/** Two layers: a measured result, then a clearly labelled forward hypothesis. */
export function ImpactPanel({ result }: { result: SearchResult }) {
  const m = BENCHMARK.manual;
  const r = BENCHMARK.rarepath;
  const quotes = result.edges.reduce((n, e) => n + e.evidence.length, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-3xl border-2 border-teal bg-white p-5 sm:p-6" aria-label="Measured in this prototype">
        <p className="text-[11px] font-bold uppercase tracking-widest text-supported">Layer 1 · Measured in this prototype</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight text-ink">~{ratio(m.seconds, r.seconds)}× faster</p>
        <p className="text-base font-medium">evidence discovery and assembly</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-canvas p-3">
            <dt className="text-xs text-muted">Manual</dt>
            <dd className="font-semibold">
              {m.seconds} s · {m.searches} searches · {m.evidenceOpenings} pages
            </dd>
          </div>
          <div className="rounded-xl bg-teal-wash p-3">
            <dt className="text-xs text-muted">RarePath</dt>
            <dd className="font-semibold">
              {r.seconds} s · {r.searches} search · {r.evidenceOpenings} click
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">{BENCHMARK.task}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>One benchmark run. Measures discovery and evidence assembly only, not treatment-development speed.</li>
          {BENCHMARK.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Behind this page: {result.sources.length} retrieved records and {quotes} verbatim evidence quotes.
        </p>
      </section>

      <section className="rounded-3xl border-2 border-dashed border-brand bg-white p-5 sm:p-6" aria-label="The 10× hypothesis to validate">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand">Layer 2 · The 10× hypothesis to validate</p>
          <span className="rounded-full border border-dashed border-brand bg-brand-wash px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand">{HYPOTHESIS.badge}</span>
        </div>
        <p className="mt-2 text-sm">
          <span className="font-semibold">Milestone:</span> {HYPOTHESIS.milestone}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Traditional discovery route</h4>
            <ol className="mt-1 space-y-0.5 text-xs">
              {HYPOTHESIS.traditional.map((s, i) => (
                <li key={s}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-brand">RarePath-assisted route</h4>
            <ol className="mt-1 space-y-0.5 text-xs">
              {HYPOTHESIS.rarepath.map((s, i) => (
                <li key={s}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-brand-wash p-3 text-sm font-medium">{HYPOTHESIS.statement}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Assumptions</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {HYPOTHESIS.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted">How to validate it</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {HYPOTHESIS.validation.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

const TRUST = [
  ["Every important connection is inspectable", "See the source and evidence behind it."],
  ["Counter-evidence stays visible", "Contradictions are not averaged away."],
  ["AI does not score its own claims", "Unreviewed AI-only edges cannot increase Research Connection Strength."],
  ["Action stays grounded", "The Research Action Brief points back to the evidence supporting it."],
] as const;

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-h" className="mt-14 rounded-3xl bg-ink px-5 py-6 text-white sm:px-7">
      <h2 id="trust-h" className="text-xs font-bold uppercase tracking-widest text-white/75">
        Why RarePath is different
      </h2>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST.map(([t, d]) => (
          <li key={t}>
            <p className="font-semibold leading-snug">{t}</p>
            <p className="mt-1 text-sm text-white/75">{d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
