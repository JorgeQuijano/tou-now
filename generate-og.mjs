// Generate og-image.png (1200x630) using current TOU period data.
// Used both:
//   - Manually by humans:  node generate-og.mjs
//   - By GitHub Actions cron:  node generate-og.mjs --auto
//
// The --auto flag only writes the file if the period changed since the
// previous commit, so the commit log stays clean.

import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { currentState, PERIOD_LABEL } from './og-period.mjs';

const W = 1200, H = 630;

// Hardcoded rates — keep in sync with app.js
const RATES = { off: 9.6, mid: 15.7, on: 24.1 };

// Color per period
const COLORS = {
  off: '#7be0a4',
  mid: '#f7c97a',
  on:  '#ff8a78',
};

const now = new Date();
const state = currentState(now, RATES);
const periodColor = COLORS[state.period];

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="60%">
      <stop offset="0%"  stop-color="${periodColor}" stop-opacity="0.45"/>
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
    <text x="80" y="100" font-size="22" letter-spacing="3" font-weight="600">LIVE · LONDON, ON · AMERICA/TORONTO</text>
    <line x1="80" y1="120" x2="${W-80}" y2="120" stroke="url(#line)" stroke-width="1"/>
  </g>

  <g transform="translate(80, 152)">
    <g stroke="#ecedef" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M30 4 L13 28 L23 28 L19 50 L41 24 L31 24 L36 4 Z"/>
    </g>
    <text x="58" y="44" font-size="34" font-weight="700" letter-spacing="-1" fill="#ecedef" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">tou-now</text>
  </g>

  <text x="${W/2}" y="240" font-size="30" letter-spacing="6" font-weight="700" text-anchor="middle" fill="${periodColor}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">${state.periodLabel.toUpperCase()} · ${state.endLabel.toUpperCase()}</text>

  <g font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" fill="#ecedef">
    <text x="${W/2 - 100}" y="450" font-size="220" font-weight="800" letter-spacing="-8" text-anchor="middle" font-feature-settings="'tnum','lnum'">${state.rate.toFixed(2)}</text>
    <text x="${W/2 + 230}" y="450" font-size="56" fill="#9aa3b2" font-weight="500" letter-spacing="-1" dominant-baseline="alphabetic">¢/kWh</text>
  </g>

  <g font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif" fill="#9aa3b2">
    <text x="80" y="${H-44}" font-size="20" font-weight="500">The live Ontario Time-of-Use rate, at a glance.</text>
    <text x="${W-80}" y="${H-44}" font-size="20" font-weight="600" text-anchor="end" fill="#ecedef">jorgequijano.github.io/tou-now</text>
  </g>
</svg>`;

const buf = await sharp(Buffer.from(svg), { density: 192 })
  .resize(W, H, { fit: 'contain', background: { r: 10, g: 12, b: 16, alpha: 1 } })
  .png()
  .toBuffer();

const isAuto = process.argv.includes('--auto');

if (isAuto) {
  // Only commit if the period text actually changed since the last committed version.
  // The simplest "did it change" check is to compare the rendered PNG bytes — but
  // that changes every render even when nothing important did, because font rendering
  // and antialiasing are non-deterministic. Better: compare the embedded text.
  // We hash the visible text (period + label + rate) and store it in a tiny JSON
  // sidecar; if it matches, skip the commit.
  const stateFile = '.og-state.json';
  const newState = { period: state.period, end: state.endTime, rate: state.rate };
  let oldState = null;
  if (existsSync(stateFile)) {
    try { oldState = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
  }
  if (oldState
      && oldState.period === newState.period
      && oldState.end === newState.end
      && Math.abs(oldState.rate - newState.rate) < 0.005) {
    console.log(`og-image: no change (still ${state.periodLabel} ${state.endLabel}). skipping.`);
    process.exit(0);
  }
  writeFileSync('og-image.png', buf);
  writeFileSync(stateFile, JSON.stringify(newState));
  console.log(`og-image: ${state.periodLabel} ${state.endLabel} ${state.rate.toFixed(2)} ¢/kWh — wrote + state updated.`);
  // Touch a marker so the commit step knows to run
  writeFileSync('.og-updated', new Date().toISOString());
} else {
  writeFileSync('og-image.png', buf);
  console.log(`og-image.png written: ${state.periodLabel} ${state.endLabel} ${state.rate.toFixed(2)} ¢/kWh`);
}