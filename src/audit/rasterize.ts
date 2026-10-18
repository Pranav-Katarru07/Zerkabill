// PDFs (what the iPhone's "Scan Documents" produces) are rendered to PNG here and sent
// down the image path, which parses flat pages reliably. Sending PDFs to xAI directly
// (file upload) failed 2 of 3 times in testing.
const MAX_PAGES = 4;
const SCALE = 2; // ~144 dpi: sharp enough for small bill text, small enough to upload fast

export async function pdfToPngs(bytes: Uint8Array): Promise<Uint8Array[]> {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pages = Math.min(doc.countPages(), MAX_PAGES);
  const out: Uint8Array[] = [];
  for (let i = 0; i < pages; i++) {
    const pixmap = doc.loadPage(i).toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false);
    out.push(pixmap.asPNG());
  }
  return out;
}
