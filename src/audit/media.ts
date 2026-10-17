// Figures out what an uploaded attachment really is (by its bytes, not the label)
// and converts iPhone HEIC photos to JPEG, which the vision model accepts.

export type BillMedia = { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf" };

export function sniffType(b: Uint8Array): string | undefined {
  const ascii = (start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (ascii(0, 4) === "%PDF") return "application/pdf";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(brand)) return "image/heic";
  }
  return undefined;
}

/** Returns bytes the parser can read, or undefined if this isn't a bill-ish file. */
export async function toBillMedia(bytes: Uint8Array, declared?: string): Promise<BillMedia | undefined> {
  const type = sniffType(bytes) ?? declared;
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp" || type === "application/pdf") {
    return { bytes, mediaType: type };
  }
  if (type === "image/heic" || type === "image/heif") {
    const { default: convert } = await import("heic-convert");
    const jpeg = await convert({ buffer: bytes, format: "JPEG", quality: 0.85 });
    return { bytes: new Uint8Array(jpeg), mediaType: "image/jpeg" };
  }
  return undefined;
}
