// Integer pixel algorithms for Paint. No DOM: everything works on an RGBA
// byte buffer plus its width and height, so the picture only ever receives
// the exact colors it is given (no anti-aliasing).

export type Pixels = Uint8ClampedArray;

/** A color packed as 0xRRGGBB. */
export type Rgb = number;

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? parseInt(m[1], 16) : 0;
}

export function rgbToHex(c: Rgb): string {
  return "#" + (c & 0xffffff).toString(16).padStart(6, "0");
}

export function getPixel(
  buf: Pixels,
  w: number,
  h: number,
  x: number,
  y: number,
): Rgb | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const i = (y * w + x) * 4;
  return (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
}

/** Fills the half-open box [x, x+rw) x [y, y+rh), clipped to the buffer. */
export function fillRect(
  buf: Pixels,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: Rgb,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(w, x + rw);
  const y1 = Math.min(h, y + rh);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  for (let py = y0; py < y1; py++) {
    let i = (py * w + x0) * 4;
    for (let px = x0; px < x1; px++) {
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
      i += 4;
    }
  }
}

/** One square brush stamp of `size` px around (x, y). */
export function stamp(
  buf: Pixels,
  w: number,
  h: number,
  x: number,
  y: number,
  size: number,
  color: Rgb,
): void {
  const off = size >> 1;
  fillRect(buf, w, h, x - off, y - off, size, size, color);
}

/** Bresenham line, end points included. */
export function line(
  buf: Pixels,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  size = 1,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    stamp(buf, w, h, x, y, size, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Rectangle between two corners (both included). The outline grows inward. */
export function rect(
  buf: Pixels,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  filled = false,
  size = 1,
): void {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const rw = Math.abs(x1 - x0) + 1;
  const rh = Math.abs(y1 - y0) + 1;
  if (filled || rw <= size * 2 || rh <= size * 2) {
    fillRect(buf, w, h, left, top, rw, rh, color);
    return;
  }
  fillRect(buf, w, h, left, top, rw, size, color);
  fillRect(buf, w, h, left, top + rh - size, rw, size, color);
  fillRect(buf, w, h, left, top + size, size, rh - size * 2, color);
  fillRect(buf, w, h, left + rw - size, top + size, size, rh - size * 2, color);
}

/**
 * Ellipse inscribed in the box between two corners (both included), using
 * the integer midpoint method (Zingl's box variant, which also handles even
 * diameters).
 */
export function ellipse(
  buf: Pixels,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  filled = false,
  size = 1,
): void {
  let xa = Math.min(x0, x1);
  let xb = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  let a = xb - xa;
  const b = Math.abs(y1 - y0);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  let ya = top + ((b + 1) >> 1);
  let yb = ya - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;

  // one mirrored pair of rows: either the two edge pixels or the whole span
  const row = (l: number, r: number, y: number): void => {
    if (filled) {
      fillRect(buf, w, h, l, y, r - l + 1, 1, color);
    } else {
      stamp(buf, w, h, l, y, size, color);
      stamp(buf, w, h, r, y, size, color);
    }
  };

  do {
    row(xa, xb, ya);
    row(xa, xb, yb);
    const e2 = 2 * err;
    if (e2 <= dy) {
      ya++;
      yb--;
      dy += a;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      xa++;
      xb--;
      dx += b1;
      err += dx;
    }
  } while (xa <= xb);
  // flat ellipses: finish the tips the loop above stops short of
  while (ya - yb <= b) {
    row(xa - 1, xb + 1, ya++);
    row(xa - 1, xb + 1, yb--);
  }
}

/** 4-connected flood fill from (x, y). Returns the number of pixels changed. */
export function floodFill(
  buf: Pixels,
  w: number,
  h: number,
  x: number,
  y: number,
  color: Rgb,
): number {
  const target = getPixel(buf, w, h, x, y);
  if (target === null) return 0;
  const tr = (target >> 16) & 255;
  const tg = (target >> 8) & 255;
  const tb = target & 255;
  const ta = buf[(y * w + x) * 4 + 3];
  if (target === (color & 0xffffff) && ta === 255) return 0;
  const match = (px: number, py: number): boolean => {
    const i = (py * w + px) * 4;
    return (
      buf[i] === tr &&
      buf[i + 1] === tg &&
      buf[i + 2] === tb &&
      buf[i + 3] === ta
    );
  };
  let changed = 0;
  // scanline fill: each stack entry is a seed whose whole run gets filled
  const stack: number[] = [x, y];
  while (stack.length > 0) {
    const sy = stack.pop() as number;
    const sx = stack.pop() as number;
    if (!match(sx, sy)) continue;
    let l = sx;
    while (l > 0 && match(l - 1, sy)) l--;
    let r = sx;
    while (r < w - 1 && match(r + 1, sy)) r++;
    fillRect(buf, w, h, l, sy, r - l + 1, 1, color);
    changed += r - l + 1;
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inRun = false;
      for (let px = l; px <= r; px++) {
        const m = match(px, ny);
        if (m && !inRun) stack.push(px, ny);
        inRun = m;
      }
    }
  }
  return changed;
}

/** Copies a box out of the buffer; parts outside it come back transparent. */
export function copyRegion(
  buf: Pixels,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
): Pixels {
  const out = new Uint8ClampedArray(rw * rh * 4);
  for (let py = 0; py < rh; py++) {
    const sy = y + py;
    if (sy < 0 || sy >= h) continue;
    for (let px = 0; px < rw; px++) {
      const sx = x + px;
      if (sx < 0 || sx >= w) continue;
      const s = (sy * w + sx) * 4;
      const d = (py * rw + px) * 4;
      out[d] = buf[s];
      out[d + 1] = buf[s + 1];
      out[d + 2] = buf[s + 2];
      out[d + 3] = buf[s + 3];
    }
  }
  return out;
}

/** Pastes a region at (x, y), clipped. Fully transparent source pixels are skipped. */
export function blit(
  buf: Pixels,
  w: number,
  h: number,
  src: Pixels,
  sw: number,
  sh: number,
  x: number,
  y: number,
): void {
  for (let py = 0; py < sh; py++) {
    const dy = y + py;
    if (dy < 0 || dy >= h) continue;
    for (let px = 0; px < sw; px++) {
      const dx = x + px;
      if (dx < 0 || dx >= w) continue;
      const s = (py * sw + px) * 4;
      if (src[s + 3] === 0) continue;
      const d = (dy * w + dx) * 4;
      buf[d] = src[s];
      buf[d + 1] = src[s + 1];
      buf[d + 2] = src[s + 2];
      buf[d + 3] = 255;
    }
  }
}

/** Largest zoom of 4/2/1 at which a picture fits a view; 1 when none does. */
export function fitZoom(
  picW: number,
  picH: number,
  viewW: number,
  viewH: number,
): 1 | 2 | 4 {
  for (const z of [4, 2] as const) {
    if (picW * z <= viewW && picH * z <= viewH) return z;
  }
  return 1;
}
