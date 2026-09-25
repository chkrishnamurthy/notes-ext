/**
 * Generate the extension's PNG icons.
 *
 * Chrome does not accept SVG for action or extension icons, and pulling in an
 * image library for four flat shapes is not worth the dependency, so this
 * rasterises the mark directly and writes the PNGs with zlib.
 *
 * The mark is a pad held by a clip: a paper sheet with a folded corner and
 * three lines of note, clipped at the top, on the accent rounded square. Every
 * part is a flat shape thick enough to survive at 16px.
 *
 * The 128px icon keeps the artwork to the middle 96px, with 16px of clear
 * space on every side, as the Chrome Web Store asks. The toolbar sizes fill
 * their whole square.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/public/icons');
const SIZES = [16, 32, 48, 128];
// Clear space around the artwork, as a fraction of the icon, per size.
const PADDING = { 128: 16 / 128 };

// Light-theme palette. Chrome tints toolbar icons for dark themes itself.
const ACCENT = [0x31, 0x5e, 0x49];
const PAPER = [0xfb, 0xfa, 0xf7];
// The underside of the folded corner, and the clip.
const FOLD = [0xc9, 0xdc, 0xd1];
const CLIP = [0x9f, 0xcf, 0xb5];
const CLIP_EDGE = [0x1f, 0x3d, 0x2f];

/** Signed distance to a rounded rectangle, in the unit square. */
function roundedRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** The sheet: left, top, right, bottom, corner radius, fold size. */
const SHEET = { l: 0.225, t: 0.24, r: 0.775, b: 0.855, radius: 0.07, fold: 0.17 };

/** The note lines on the sheet, left-aligned: [centre y, right end]. */
const LINES = [
  [0.47, 0.6],
  [0.595, 0.665],
  [0.72, 0.535],
];
const LINE_LEFT = 0.325;
const LINE_HALF = 0.036;

function sample(x, y) {
  // Background plate.
  if (roundedRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null;

  // The clip, over the top edge of the sheet: a dark rim around a light body.
  const clip = roundedRect(x, y, 0.5, SHEET.t + 0.005, 0.135, 0.07, 0.045);
  if (clip <= 0) return clip > -0.028 ? CLIP_EDGE : CLIP;

  const { l, t, r, b, radius, fold } = SHEET;
  const inSheet =
    roundedRect(x, y, (l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2, radius) <= 0;
  if (inSheet) {
    // Top-right corner folded down: beyond the diagonal is gone, and the
    // triangle just inside it is the paper's underside.
    const beyond = x - y > r - t - fold;
    if (beyond) return ACCENT;
    if (x > r - fold && y < t + fold) return FOLD;
    for (const [cy, right] of LINES) {
      const cx = (LINE_LEFT + right) / 2;
      if (roundedRect(x, y, cx, cy, (right - LINE_LEFT) / 2, LINE_HALF, LINE_HALF) <= 0) return ACCENT;
    }
    return PAPER;
  }
  return ACCENT;
}

function render(size) {
  const pad = PADDING[size] ?? 0;
  // 4x supersampling: the 16px icon's 0.7px-tall lines need it to read at all.
  const SS = 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const colour = sample((x - pad) / (1 - 2 * pad), (y - pad) / (1 - 2 * pad));
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }
      const samples = SS * SS;
      const offset = (py * size + px) * 4;
      if (a > 0) {
        // Un-premultiply so the edge pixels keep their colour as they fade.
        const covered = a / 255;
        pixels[offset] = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
        pixels[offset + 3] = Math.round(a / samples);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10..12: deflate, adaptive filtering, no interlace — all zero.

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const from = y * size * 4;
    pixels.copy(raw, y * (size * 4 + 1) + 1, from, from + size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log(`icon-${size}.png`);
}
