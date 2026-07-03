/* tou-now — Ontario Time-of-Use live indicator
 * - All time math uses America/Toronto (OEB billing time).
 * - Rates are hardcoded from the latest OEB RPP TOU schedule.
 *   Update RATES next on the OEB's Nov 1 / May 1 rate change.
 */

// ---------- CONFIG ----------
// OEB TOU thresholds: hour-exclusive at lower bound.
//   on-peak  = [startHour, endHour)
//   mid-peak = [startHour, endHour) (multiple windows allowed)
const TZ = 'America/Toronto';

// Seasonal boundaries (Ontario Regulated Price Plan):
//   Summer: May 1  – Oct 31 inclusive
//   Winter: Nov 1  – Apr 30 inclusive (wraps the year)
// `month` is 0-indexed (Jan=0).
const SUMMER_FIRST = { month: 4, day: 1 };  // May 1
const WINTER_FIRST = { month: 10, day: 1 }; // Nov 1
const SUMMER_LAST  = { month: 9, day: 31 }; // Oct 31 (last summer day)

// 2026/2027 OEB TOU prices (¢/kWh) — placeholder; refresh on the next OEB rate change.
// See README.md for the update procedure.
const RATES = {
  off: 9.6,   // off-peak
  mid: 15.7,  // mid-peak
  on:  24.1,  // on-peak
};

const PERIOD_LABEL = { off: 'Off-Peak', mid: 'Mid-Peak', on: 'On-Peak' };
const PERIOD_ORDER = ['off', 'mid', 'on'];

// Format helper for "5:00 PM"
const fmt12 = (h, m = 0) => {
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
};
const fmtMoney = n => `${n.toFixed(2)} ¢/kWh`;

// ---------- SCHEDULE ----------
/** Build the 24 periods for a single calendar day in America/Toronto.
 *  Returns array of { hour, period } where hour = 0..24.
 *  hour 24 = end of day (used as chart right edge).
 */
function buildDaySegments(isWeekend, isSummer) {
  // Decide weekday thresholds
  let on = [], mid = [];
  if (isWeekend) {
    // all off-peak
  } else if (isSummer) {
    on  = [[11, 17]];
    mid = [[7, 11], [17, 21]];
  } else {
    on  = [[17, 21]];
    mid = [[11, 17]];
  }

  const segs = Array(24).fill('off');
  for (const [s, e] of on)  for (let h = s; h < e; h++) segs[h] = 'on';
  for (const [s, e] of mid) for (let h = s; h < e; h++) segs[h] = 'mid';

  // Collapse into segments
  const segments = [];
  let cur = segs[0], start = 0;
  for (let h = 1; h <= 24; h++) {
    const p = h === 24 ? null : segs[h];
    if (p !== cur) {
      segments.push({ start, end: h, period: cur });
      cur = p;
      start = h;
    }
  }
  return segments;
}

/** Returns { period, nextChangeAt, nextLabel } for the given Date-like in Ontario time. */
function currentPeriodFor(now) {
  const parts = torontoParts(now);
  const hour = parts.hour + parts.minute / 60;

  const date = new Date(now);
  // Weekend check in Toronto
  const wkParts = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(date);
  const isWeekend = wkParts === 'Saturday' || wkParts === 'Sunday';

  // Season check (May 1 inclusive → Oct 31 inclusive = summer; Nov 1 → Apr 30 = winter).
  // OEB wraps winter across year boundary, so check two ranges.
  const m = parts.monthIndex, d = parts.day;
  const afterSummerStart = (m > SUMMER_FIRST.month) || (m === SUMMER_FIRST.month && d >= SUMMER_FIRST.day);
  const onOrBeforeSummerEnd = (m < SUMMER_LAST.month) || (m === SUMMER_LAST.month && d <= SUMMER_LAST.day);
  const isSummer = afterSummerStart && onOrBeforeSummerEnd;
  // winter is everything else (Nov 1 – Apr 30 inclusive)

  const segs = buildDaySegments(isWeekend, isSummer);
  // Find current segment by hour
  let current = segs.find(s => hour >= s.start && hour < s.end);
  if (!current) current = segs[segs.length - 1];

  // Next-change computation: end hour of current segment, today
  let nextAt = null;
  if (current.end < 24) {
    nextAt = current.end;
  } else {
    // roll to start of tomorrow
    nextAt = 0 + 24;
  }

  // Build friendly label
  let label;
  if (nextAt >= 24) {
    const tomorrow = new Date(date.getTime() + 24 * 3600 * 1000);
    const tParts = torontoParts(tomorrow);
    const tWk = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(tomorrow);
    const tIsWeekend = tWk === 'Saturday' || tWk === 'Sunday';
    const tM = tParts.monthIndex, tD = tParts.day;
    const tAfterSummerStart = (tM > SUMMER_FIRST.month) || (tM === SUMMER_FIRST.month && tD >= SUMMER_FIRST.day);
    const tOnOrBeforeSummerEnd = (tM < SUMMER_LAST.month) || (tM === SUMMER_LAST.month && tD <= SUMMER_LAST.day);
    const tIsSummer = tAfterSummerStart && tOnOrBeforeSummerEnd;
    const tSegs = buildDaySegments(tIsWeekend, tIsSummer);
    const first = tSegs[0];
    const nextName = PERIOD_LABEL[first.period];
    if (first.period === 'off') {
      label = `Off-Peak all day next`;
    } else {
      label = `Next: ${nextName} at 12:00 AM`;
    }
  } else {
    const nextSeg = segs.find(s => s.start === current.end);
    const nextName = PERIOD_LABEL[nextSeg.period];
    label = `Next: ${nextName} at ${fmt12(nextAt)}`;
  }

  return {
    period: current.period,
    nextLabel: label,
    nextAt: nextAt, // absolute hour-of-week (raw)
    segmentsToday: segs,
    isWeekend,
    isSummer,
  };
}

/** Ontario-localized parts. Returns ints (hour 0-23, minute 0-59, day 1-31, monthIndex 0-11). */
function torontoParts(input) {
  const d = input instanceof Date ? input : new Date(input);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  // Intl gives hour as "00".."23"; on some browsers it returns "24" at midnight — normalize.
  let h = parseInt(parts.hour, 10);
  if (h === 24) h = 0;
  return {
    hour: h,
    minute: parseInt(parts.minute, 10),
    day: parseInt(parts.day, 10),
    monthIndex: parseInt(parts.month, 10) - 1,
    year: parseInt(parts.year, 10),
  };
}

// ---------- RENDER ----------
const $ = sel => document.querySelector(sel);

function renderChart(segments) {
  const chart = $('#chart');
  chart.innerHTML = '';
  for (const seg of segments) {
    const w = ((seg.end - seg.start) / 24) * 100;
    const bar = document.createElement('div');
    bar.className = `bar ${seg.period}`;
    bar.style.width = `${w}%`;
    bar.title = `${fmt12(seg.start)}–${fmt12(seg.end === 24 ? 0 : seg.end)} · ${PERIOD_LABEL[seg.period]}`;
    chart.appendChild(bar);
  }
  // "Now" indicator
  const line = document.createElement('div');
  line.className = 'now-line';
  line.id = 'now-line';
  const dot = document.createElement('div');
  dot.className = 'now-dot';
  dot.id = 'now-dot';
  chart.appendChild(line);
  chart.appendChild(dot);
}

function setNowPosition() {
  const parts = torontoParts(new Date());
  const frac = (parts.hour + parts.minute / 60) / 24 * 100;
  const line = $('#now-line');
  const dot = $('#now-dot');
  if (line) line.style.left = `${frac}%`;
  if (dot)  dot.style.left  = `${frac}%`;
  $('#now-time').textContent =
    `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function render() {
  const info = currentPeriodFor(new Date());
  const pill = $('.status-pill');
  pill.dataset.period = info.period;
  pill.querySelector('.period-name').textContent = PERIOD_LABEL[info.period];
  pill.querySelector('.rate').textContent = fmtMoney(RATES[info.period]);
  $('#next').textContent = info.nextLabel;
  renderChart(info.segmentsToday);
  setNowPosition();
  // Day label
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }).format(new Date());
  $('#chart-day').textContent = today;
}

// ---------- THEME ----------
function applyTheme(mode) {
  let resolved = mode;
  if (mode === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
  document.querySelectorAll('.theme-switch button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.theme === mode));
  });
  try { localStorage.setItem('tou-now-theme', mode); } catch {}
}

function initTheme() {
  let stored = 'system';
  try { stored = localStorage.getItem('tou-now-theme') || 'system'; } catch {}
  applyTheme(stored);
  document.querySelectorAll('.theme-switch button').forEach(b => {
    b.addEventListener('click', () => applyTheme(b.dataset.theme));
  });
  // React to system changes when in 'system' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('tou-now-theme') || 'system') === 'system') applyTheme('system');
  });
}

// ---------- TICKS ----------
function start() {
  initTheme();
  render();
  // Update "now" position every 30s (cheap), re-run full render at every minute
  setInterval(setNowPosition, 30_000);
  setInterval(render, 60_000);
}

document.addEventListener('DOMContentLoaded', start);
