import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { JsonGraphService, REAL_BUNDLE } from "@/lib/services/graph-service";
import { CuratedReusableAssetFinder } from "@/lib/services/reusable-asset-finder";
import { GraphSearchService } from "@/lib/services/search-service";
import { MultiProviderDiscoveryService } from "@/lib/discovery";
import { setResearchFetch } from "@/lib/research/fetch";
import { clearClinGenCache } from "@/lib/research/providers/clingen";
import { MemoryStore, setStore } from "@/lib/store";
import { briefDocFrom, briefSections } from "@/lib/export/brief-doc";
import { briefToDocx, briefToPdf, winAnsi } from "@/lib/export/render";
import { citationsFor, toBibTeX, toRIS } from "@/lib/export/citations";
import { createShare, getShare } from "@/lib/export/share";
import { researchRouter } from "./fixtures/research-http";

const g = JsonGraphService.fromFile(REAL_BUNDLE);
const search = () => {
  setResearchFetch(researchRouter({}));
  return new GraphSearchService(g, new CuratedReusableAssetFinder(g), new MultiProviderDiscoveryService({ now: () => new Date("2026-10-04T12:00:00Z") }));
};
const ORIGIN = "https://rarepath.test";

beforeEach(() => setStore(new MemoryStore()));
afterEach(() => {
  setStore(null);
  setResearchFetch(null);
  clearClinGenCache();
});

describe("brief documents", () => {
  it("the curated CDKL5 brief keeps every limit and source from the page", async () => {
    const r = await search().search("CDKL5");
    if (!r.found || !r.action_brief) throw new Error("expected the CDKL5 journey");
    const d = briefDocFrom(r, ORIGIN)!;
    expect(d.kind).toBe("curated");
    expect(d.disease).toBe("CDKL5 deficiency disorder");
    expect(d.does_not_mean).toHaveLength(r.action_brief.does_not_mean.length);
    expect(d.sources.map((s) => s.url)).toEqual(r.action_brief.bring_sources.map((s) => s.url));
    expect(d.page_url).toBe(`${ORIGIN}/results?q=CDKL5`);
  });

  it("a generated brief carries its counterweights; discovery-only searches have no brief", async () => {
    const rett = briefDocFrom(await search().search("Rett syndrome"), ORIGIN);
    expect(rett?.kind).toBe("generated");
    expect(rett!.cautions.length).toBeGreaterThan(0);
    expect(briefSections(rett!).map((s) => s.title)).toContain("Counterweights on this connection");
    expect(briefDocFrom(await search().search("Dravet syndrome"), ORIGIN)).toBeNull();
  });

  it("renders a real .docx and a readable multi-section PDF", async () => {
    const r = await search().search("CDKL5");
    const d = briefDocFrom(r, ORIGIN)!;
    const docx = await briefToDocx(d);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    const pdf = await briefToPdf(d);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.getTitle()).toBe("Research Action Brief: CDKL5 deficiency disorder");
  });

  it("PDF text is mapped to the standard font's character set", () => {
    expect(winAnsi("A → B ≠ C – “quoted” ✓")).toBe("A -> B != C – “quoted” ");
    expect(winAnsi("日本")).toBe("??");
  });
});

describe("citations", () => {
  it("reviewed sources come first and discovery papers are tagged as not reviewed", async () => {
    const cdd = citationsFor(await search().search("CDKL5"));
    expect(cdd.length).toBeGreaterThan(5);
    expect(cdd.every((c) => c.tier === "reviewed")).toBe(true);
    const dravet = citationsFor(await search().search("Dravet syndrome"));
    expect(dravet.every((c) => c.tier === "machine_assembled")).toBe(true);
    expect(dravet.some((c) => c.type === "preprint")).toBe(true);
    // One entry per work: the paper found by Europe PMC, PubMed and OpenAlex appears once.
    expect(dravet.filter((c) => c.doi === "10.1000/dup")).toHaveLength(1);
  });

  it("BibTeX and RIS are well formed and carry the tier", async () => {
    const cs = citationsFor(await search().search("Dravet syndrome"));
    const bib = toBibTeX(cs);
    expect((bib.match(/^@/gm) ?? []).length).toBe(cs.length);
    expect(bib.split("{").length).toBe(bib.split("}").length);
    expect(bib).toMatch(/note = \{Not peer reviewed\. RarePath Atlas: machine-assembled discovery, not reviewed\}/);
    const keys = [...bib.matchAll(/^@\w+\{([^,]+),/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    const ris = toRIS(cs);
    expect((ris.match(/^TY {2}- /gm) ?? []).length).toBe(cs.length);
    expect((ris.match(/^ER {2}- /gm) ?? []).length).toBe(cs.length);
    expect(ris).toMatch(/TY {2}- UNPB/);
  });
});

describe("shared briefs", () => {
  it("a share is a frozen copy behind an unguessable id", async () => {
    const d = briefDocFrom(await search().search("CDKL5"), ORIGIN)!;
    const s = await createShare("CDKL5", d);
    expect(s.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await getShare(s.id))!.brief).toEqual(d);
    expect(await getShare("../../etc")).toBeNull();
    expect(await getShare("A".repeat(16))).toBeNull();
  });
});
