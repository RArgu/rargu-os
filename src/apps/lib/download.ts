// Downloads to the visitor's own machine: bytes an app made (a WAV, a PNG, a
// backup), saved under its own name with a fitting MIME type; and a stored
// (uncompressed) .zip writer.
import { h } from "../../ui/dom";
import { extOf } from "./open";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

/**
 * The MIME type for a file name. The apps' own formats (.trk, .siege) and
 * anything unknown are plain bytes, so no browser renames them.
 */
export function mimeType(name: string): string {
  return TYPES[extOf(name).toLowerCase()] ?? "application/octet-stream";
}

/** Saves bytes or text to the visitor's machine as `name`. */
export function downloadBytes(
  data: Uint8Array | string,
  name: string,
  type = mimeType(name),
): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = h("a", { attrs: { href: url, download: name } });
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // the download has started from the URL by then; it is not needed after
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ----- zip (stored, no compression) -----

export interface ZipEntry {
  /** a path inside the archive; a folder ends with "/" and has no data */
  name: string;
  data: Uint8Array | null;
}

let crcTable: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A .zip archive of the entries, stored as is, with UTF-8 names. */
export function zip(entries: ZipEntry[], date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data ?? new Uint8Array(0);
    const crc = crc32(data);
    // shared fields: version, flags (bit 11: UTF-8), method 0, time, date,
    // crc, sizes, name length, extra length
    const head = (v: DataView, at: number): void => {
      v.setUint16(at, 20, true);
      v.setUint16(at + 2, 0x0800, true);
      v.setUint16(at + 4, 0, true);
      v.setUint16(at + 6, time, true);
      v.setUint16(at + 8, day, true);
      v.setUint32(at + 10, crc, true);
      v.setUint32(at + 14, data.length, true);
      v.setUint32(at + 18, data.length, true);
      v.setUint16(at + 22, name.length, true);
      v.setUint16(at + 24, 0, true);
    };
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    head(lv, 4);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // made by
    head(cv, 6);
    // comment length, disk, internal attributes: 0
    cv.setUint32(38, e.data === null ? 0x10 : 0, true); // directory attribute
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
