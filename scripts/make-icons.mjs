/**
 * Generate the extension's PNG icons.
 *
 * Chrome does not accept SVG for action or extension icons, and pulling in an
 * image library for four flat shapes is not worth the dependency, so this
 * rasterises the mark directly and writes the PNGs with zlib.
 *
 * The mark is the accent rounded square from the mockup with three lines of
 * "note" on it, which stays legible down to 16px.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/public/icons');
const SIZES = [16, 32, 48, 128];

// Light-theme palette. Chrome tints toolbar icons for dark themes itself.
const ACCENT = [0x31, 0x5e, 0x49];
const PAPER = [0xfb, 0xfa, 0xf7];

/** Signed distance to a rounded rectangle, in the unit square. */
function roundedRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** The three note lines: [centre y, half-width]. */
const LINES = [
  [0.335, 0.26],
  [0.5, 0.26],
  [0.665, 0.175],
];

function sample(x, y) {
  // Background plate.
  if (roundedRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null;
  for (const [cy, hw] of LINES) {
    if (roundedRect(x, y, 0.5, cy, hw, 0.043, 0.043) <= 0) return PAPER;
  }
  return ACCENT;
}

function render(size) {
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
          const colour = sample(x, y);
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
