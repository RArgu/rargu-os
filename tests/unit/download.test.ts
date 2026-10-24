import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, mimeType, zip } from "../../src/apps/lib/download";

describe("downloads", () => {
  it("names a MIME type per extension, plain bytes for the apps' own formats", () => {
    expect(mimeType("welcome.png")).toBe("image/png");
    expect(mimeType("demo.wav")).toBe("audio/wav");
    expect(mimeType("Resume.MD")).toBe("text/markdown");
    expect(mimeType("Rodrigo-Arguello-Resume.html")).toBe("text/html");
    expect(mimeType("song.trk")).toBe("application/octet-stream");
    expect(mimeType("game.siege")).toBe("application/octet-stream");
    expect(mimeType("README")).toBe("application/octet-stream");
  });

  it("computes the zip CRC-32 like zlib", () => {
    const data = new TextEncoder().encode("The quick brown fox jumps over");
    expect(crc32(data)).toBe(nodeCrc32(data));
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("writes a stored zip whose directory points at every entry", () => {
    const enc = new TextEncoder();
    const files = [
      { name: "Pictures/", data: null },
      { name: "Pictures/a.txt", data: enc.encode("hello") },
      { name: "Pictures/ñ.bin", data: new Uint8Array([0, 1, 2, 255]) },
    ];
    const out = zip(files, new Date(2026, 9, 3, 12, 30, 10));
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    // end of central directory
    const end = out.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(3);
    let at = v.getUint32(end + 16, true);
    const dec = new TextDecoder();
    for (const f of files) {
      expect(v.getUint32(at, true)).toBe(0x02014b50);
      expect(v.getUint16(at + 8, true) & 0x0800).toBe(0x0800); // UTF-8 names
      expect(v.getUint16(at + 10, true)).toBe(0); // stored
      const size = v.getUint32(at + 24, true);
      const nameLen = v.getUint16(at + 28, true);
      const name = dec.decode(out.subarray(at + 46, at + 46 + nameLen));
      expect(name).toBe(f.name);
      expect(v.getUint32(at + 38, true)).toBe(f.data ? 0 : 0x10);
      // the local header it points at holds the same name and the data
      const local = v.getUint32(at + 42, true);
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      const data = out.subarray(
        local + 30 + nameLen,
        local + 30 + nameLen + size,
      );
      expect([...data]).toEqual([...(f.data ?? [])]);
      expect(v.getUint32(local + 14, true)).toBe(nodeCrc32(data));
      at += 46 + nameLen;
    }
    // 2026-10-03 12:30:10 in DOS time
    expect(v.getUint16(10, true)).toBe((12 << 11) | (30 << 5) | 5);
    expect(v.getUint16(12, true)).toBe((46 << 9) | (10 << 5) | 3);
  });
});
