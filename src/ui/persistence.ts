import type { ECGCase } from "../engine/types";
import { normalizeImportedCase } from "../presets/case-context";
export function encodeCase(c: ECGCase) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(normalizeImportedCase(c)),
  );
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return (
    "#case=" +
    btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}
export function decodeCase(hash: string): ECGCase | null {
  if (!hash.startsWith("#case=")) return null;
  if (hash.length > 15000)
    throw new Error("El enlace de caso es demasiado extenso.");
  const encoded = hash.slice(6).replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(encoded),
    bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
  return normalizeImportedCase(JSON.parse(new TextDecoder().decode(bytes)));
}
export function download(blob: Blob, name: string) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function savedCases(): ECGCase[] {
  try {
    return JSON.parse(localStorage.getItem("ecglab-cases") || "[]")
      .map(normalizeImportedCase)
      .slice(0, 30);
  } catch {
    return [];
  }
}
export function saveCase(c: ECGCase) {
  const normalized = normalizeImportedCase(c),
    all = savedCases(),
    same = all.findIndex((x) => x.name === normalized.name);
  if (same >= 0) all[same] = normalized;
  else all.unshift(normalized);
  localStorage.setItem("ecglab-cases", JSON.stringify(all.slice(0, 30)));
}
/** Embed actual physical PNG density (pHYs), independent of browser's default 96 dpi metadata. */
export async function pngWithDpi(blob: Blob, dpi = 300): Promise<Blob> {
  const data = new Uint8Array(await blob.arrayBuffer());
  if (data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71)
    throw new Error("No es un PNG");
  const chunk = new Uint8Array(21),
    view = new DataView(chunk.buffer),
    ppm = Math.round(dpi / 0.0254);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (let i = 4; i < 17; i++) {
    crc ^= chunk[i];
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts: BlobPart[] = [data.slice(0, 8)];
  let offset = 8,
    inserted = false;
  while (offset + 12 <= data.length) {
    const len = new DataView(data.buffer).getUint32(offset),
      type = String.fromCharCode(...data.slice(offset + 4, offset + 8)),
      end = offset + len + 12;
    if (end > data.length) throw new Error("PNG incompleto");
    if (type !== "pHYs") parts.push(data.slice(offset, end));
    if (type === "IHDR" && !inserted) {
      parts.push(chunk);
      inserted = true;
    }
    offset = end;
  }
  return new Blob(parts, { type: "image/png" });
}
