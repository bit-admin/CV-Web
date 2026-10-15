import type { PDFPageProxy } from "pdfjs-dist";
import type { PdfPageText } from "./layoutAnalysis";

/** Reads a page's text runs from pdf.js for layout analysis. */
export async function extractPageText(page: PDFPageProxy): Promise<PdfPageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const runs = content.items.flatMap((item) => {
    if (!("str" in item) || item.str.length === 0) {
      return [];
    }
    const [, , c, d, x, y] = item.transform as number[];
    return [{ text: item.str, x, y, width: item.width, fontSize: Math.hypot(c, d) || item.height }];
  });
  return { width: viewport.width, height: viewport.height, runs };
}
