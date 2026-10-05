/**
 * Draws the app icons by code (the gold X of the logo on the navy of the menu) and writes them to
 * `apps/web/public/icons`: the browser tab, the iOS home screen and the two the web app manifest asks for.
 * The PNGs are committed; run `bun run icons` again only when the mark changes.
 */
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

type RGB = [number, number, number];

/** the colours of the client: `--bg`, `--gold` and the outline of the figures */
const NAVY: RGB = [0x12, 0x20, 0x3a];
const NAVY_LIT: RGB = [0x2a, 0x4a, 0x80];
const GOLD: RGB = [0xff, 0xc9, 0x3c];
const GOLD_SHADE: RGB = [0xe0, 0x96, 0x1c];
const INK: RGB = [0x0a, 0x10, 0x20];

/** how far the strokes of the X lean from upright (radians) and how much the letter slants, like the italic logo */
const STROKE_ANGLE = 0.62;
const SLANT = 0.16;
/** the outline and the drop shadow, as a share of the icon */
const OUTLINE = 0.034;
const SHADOW_DROP = 0.03;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Distance from (x, y) to a box with rounded corners centred on the origin and turned by `angle`: negative inside. */
function roundedBox(x: number, y: number, halfW: number, halfH: number, radius: number, angle = 0): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const qx = Math.abs(x * c + y * s) - (halfW - radius);
  const qy = Math.abs(-x * s + y * c) - (halfH - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance to the X, which reaches `reach` from the centre of the icon (all in shares of the icon). */
function letterX(x: number, y: number, reach: number): number {
  const sx = x + y * SLANT;
  const halfW = reach * 0.25;
  const halfH = reach * 1.18;
  return Math.min(roundedBox(sx, y, halfW, halfH, halfW * 0.22, STROKE_ANGLE), roundedBox(sx, y, halfW, halfH, halfW * 0.22, -STROKE_ANGLE));
}

/**
 * One square icon as RGBA bytes. `reach` is how far the X goes from the centre (0.5 is the edge) and `corner` rounds
 * the background, leaving the corners clear (0 for a full square, which is what launchers crop themselves).
 */
function drawIcon(size: number, reach: number, corner = 0): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  // how much of a pixel a shape covers, from its distance to the pixel's centre: this is what smooths the edges
  const cover = (d: number) => clamp01(0.5 - d * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size - 0.5;
      const y = (j + 0.5) / size - 0.5;
      let rgb = mix(NAVY_LIT, NAVY, clamp01(Math.hypot(x, y + 0.08) / 0.62));
      const d = letterX(x, y, reach);
      rgb = mix(rgb, INK, cover(letterX(x, y - SHADOW_DROP, reach) - OUTLINE) * 0.55);
      rgb = mix(rgb, INK, cover(d - OUTLINE));
      // two flat tones, like the toon shading of the figures: lit from above
      rgb = mix(rgb, y > reach * 0.2 ? GOLD_SHADE : GOLD, cover(d));
      const at = (j * size + i) * 4;
      px[at] = Math.round(rgb[0]);
      px[at + 1] = Math.round(rgb[1]);
      px[at + 2] = Math.round(rgb[2]);
      px[at + 3] = Math.round(255 * (corner ? cover(roundedBox(x, y, 0.5, 0.5, corner)) : 1));
    }
  }
  return px;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data and the checksum of the last two. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A square of RGBA bytes as a PNG file. */
function encodePng(px: Uint8Array, size: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA
  // every row starts with a byte that says "not filtered"
  const rows = new Uint8Array(size * (size * 4 + 1));
  for (let j = 0; j < size; j++) rows.set(px.subarray(j * size * 4, (j + 1) * size * 4), j * (size * 4 + 1) + 1);
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

const out = new URL("../apps/web/public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

/** the X fills most of a plain icon; a "maskable" one keeps it inside the circle a launcher may crop to */
const PLAIN = 0.34;
const MASKABLE = 0.25;

const icons: [name: string, size: number, reach: number, corner?: number][] = [
  ["favicon.png", 64, 0.36, 0.2],
  ["icon-180.png", 180, PLAIN], // iOS home screen: it rounds the corners itself
  ["icon-192.png", 192, PLAIN],
  ["icon-512.png", 512, PLAIN],
  ["icon-maskable-512.png", 512, MASKABLE],
];
for (const [name, size, reach, corner] of icons) {
  await Bun.write(new URL(name, out), encodePng(drawIcon(size, reach, corner), size));
  console.log(`${name} (${size}x${size})`);
}
