// Rasterize og-image.svg (inline) → og-image.png (1200x630) using sharp.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 1200, H = 630;
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="60%">
      <stop offset="0%"  stop-color="#3a6df0" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#0a0c10" stop-opacity="0.0"/>
      <stop offset="100%" stop-color="#0a0c10" stop-opacity="0.0"/>
    </radialGradient>
    <linearGradient id="line" x1="0%" x2="100%" y1="0%" y2="0%">
      <stop offset="0%"  stop-color="#f7f6f1" stop-opacity="0"/>
      <stop offset="50%" stop-color="#f7f6f1" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#f7f6f1" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0a0c10"/>
  <rect width="100%" height="100%" fill="url(#g)"/>

  <g font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" fill="#9aa3b2">
    <text x="80" y="100" font-size="22" letter-spacing="3" font-weight="600">LIVE · AMERICA/TORONTO</text>
    <line x1="80" y1="120" x2="${W-80}" y2="120" stroke="url(#line)" stroke-width="1"/>
  </g>

  <g transform="translate(80, 152)">
    <g stroke="#ecedef" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M30 4 L13 28 L23 28 L19 50 L41 24 L31 24 L36 4 Z"/>
    </g>
    <text x="58" y="44" font-size="34" font-weight="700" letter-spacing="-1" fill="#ecedef" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">tou-now</text>
  </g>

  <text x="${W/2}" y="240" font-size="30" letter-spacing="6" font-weight="700" text-anchor="middle" fill="#f7c97a" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">MID-PEAK · UNTIL 9:00 PM</text>

  <g font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" fill="#ecedef">
    <text x="${W/2 - 100}" y="450" font-size="220" font-weight="800" letter-spacing="-8" text-anchor="middle" font-feature-settings="'tnum','lnum'">15.70</text>
    <text x="${W/2 + 230}" y="450" font-size="56" fill="#9aa3b2" font-weight="500" letter-spacing="-1" dominant-baseline="alphabetic">¢/kWh</text>
  </g>

  <g font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" fill="#9aa3b2">
    <text x="80" y="${H-44}" font-size="20" font-weight="500">The live Ontario Time-of-Use rate, at a glance.</text>
    <text x="${W-80}" y="${H-44}" font-size="20" font-weight="600" text-anchor="end" fill="#ecedef">jorgequijano.github.io/tou-now</text>
  </g>
</svg>
`;

const buf = await sharp(Buffer.from(svg), { density: 192 })
  .resize(W, H, { fit: 'contain', background: { r: 10, g: 12, b: 16, alpha: 1 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync('og-image.png', buf);
console.log(`og-image.png: ${buf.length} bytes`);
