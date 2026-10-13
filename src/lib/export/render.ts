/** Word (.docx) and PDF renderers for a BriefDoc. Server-side only. */
import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { BRIEF_FOOTER, briefSections, briefSubtitle, briefTitle, type BriefDoc } from "./brief-doc";

export async function briefToDocx(d: BriefDoc): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(briefTitle(d))] }),
    new Paragraph({ children: [new TextRun({ text: briefSubtitle(d), italics: true, size: 18 })] }),
  ];
  for (const s of briefSections(d)) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.title)] }));
    if (s.title.startsWith("Bring these sources")) {
      d.sources.forEach((src, i) =>
        children.push(new Paragraph({ children: [new TextRun(`${i + 1}. ${src.label}: `), new ExternalHyperlink({ link: src.url, children: [new TextRun({ text: src.url, style: "Hyperlink" })] })] })),
      );
    } else if (s.items.length === 1) children.push(new Paragraph({ children: [new TextRun(s.items[0])] }));
    else for (const it of s.items) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(it)] }));
  }
  children.push(
    new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: BRIEF_FOOTER, italics: true, size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: "Live page with evidence: ", size: 18 }), new ExternalHyperlink({ link: d.page_url, children: [new TextRun({ text: d.page_url, style: "Hyperlink", size: 18 })] })] }),
  );
  const doc = new Document({ creator: "RarePath Atlas", title: briefTitle(d), description: briefSubtitle(d), sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** The standard PDF fonts only cover WinAnsi; map the few symbols RarePath uses and drop the rest. */
export function winAnsi(s: string): string {
  return s
    .replace(/[→⟶]/g, "->")
    .replace(/≠/g, "!=")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[▲●■◌✓]/g, "")
    .replace(/[‐-‒]/g, "-")
    .normalize("NFC")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…€]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) line = tryLine;
      else {
        if (line) out.push(line);
        // Break very long tokens (URLs) by characters.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let i = w.length;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          out.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export async function briefToPdf(d: BriefDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(briefTitle(d)));
  pdf.setCreator("RarePath Atlas");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const [W, H, M] = [595.28, 841.89, 50]; // A4
  const ink = rgb(0.094, 0.125, 0.2);
  const brand = rgb(0.31, 0.275, 0.647);
  const muted = rgb(0.31, 0.345, 0.45);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const draw = (text: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; bullet?: string } = {}) => {
    const font = o.font ?? regular;
    const size = o.size ?? 10.5;
    const indent = o.indent ?? 0;
    const lines = wrap(winAnsi(text), font, size, W - 2 * M - indent);
    lines.forEach((ln, i) => {
      if (y < M + size) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      if (i === 0 && o.bullet) page.drawText(o.bullet, { x: M + indent - 12, y, size, font, color: o.color ?? ink });
      page.drawText(ln, { x: M + indent, y, size, font, color: o.color ?? ink });
      y -= size * 1.35;
    });
    y -= o.gap ?? 0;
  };
  draw(briefTitle(d), { font: bold, size: 18, color: brand, gap: 2 });
  draw(briefSubtitle(d), { font: italic, size: 9, color: muted, gap: 10 });
  for (const s of briefSections(d)) {
    y -= 4;
    draw(s.title.toUpperCase(), { font: bold, size: 9, color: muted, gap: 2 });
    if (s.items.length === 1 && !s.numbered) draw(s.items[0], { gap: 4 });
    else s.items.forEach((it, i) => draw(it, { indent: 14, bullet: s.numbered ? `${i + 1}.` : "•", gap: 2 }));
  }
  y -= 8;
  draw(BRIEF_FOOTER, { font: italic, size: 8.5, color: muted, gap: 2 });
  draw(`Live page with evidence: ${d.page_url}`, { size: 8.5, color: muted });
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`RarePath Atlas - ${i + 1}/${pages.length}`, { x: M, y: 24, size: 8, font: regular, color: muted }));
  return pdf.save();
}
