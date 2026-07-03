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

// Format helper for "5:00 PM". Handles h=24 → "12:00 AM" (midnight, end-of-day).
const fmt12 = (h, m = 0) => {
  const hh24 = ((h % 24) + 24) % 24;
  const period = hh24 >= 12 ? 'PM' : 'AM';
  const hh = ((hh24 + 11) % 12) + 1;
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

// ---------- TIPS ----------
// Period-aware, calendar-aware copy. Each entry has an optional `minLeft`
// so e.g. "shift laundry" is only shown once enough of the off-peak window
// remains to actually run a load.
const TIPS = {
  off: {
    base: 'Good time to run laundry, dishwasher, dryer or charge an EV.',
    base_weekend: 'Off-peak all day — cheap window for any heavy load.',
  },
  mid: {
    morning: 'Heads up: Mid-Peak morning window. Hold off on the dryer if you can.',
    evening: 'Heads up: Mid-Peak evening. If it can wait, it usually pays.',
  },
  on: 'Heavy loads should wait — the next cheaper window is {nextLabel}.',
};

// Build today's tip + a "time-to-next-changed-state" hint.
function buildTip(now, current, segments) {
  const parts = torontoParts(now);
  const nextSeg = segments.find(s => s.start >= parts.hour + parts.minute/60 && s.period !== current.period);
  const timeStr = fmt12(parts.hour, parts.minute);
  if (current === 'off') {
    const txt = currentPeriodFor(now).isWeekend ? TIPS.off.base_weekend : TIPS.off.base;
    const h = parts.hour + parts.minute/60;
    // If we're late in the day and off-peak is wrapping, show "until X AM" wording.
    if (nextSeg && nextSeg.start !== 7 && nextSeg.start !== 0) {
      return `${txt} Until ${fmt12(nextSeg.start)}.`;
    }
    if (nextSeg && nextSeg.start === 7) return `${txt} Until 7:00 AM.`;
    if (nextSeg && nextSeg.start === 0) return `${txt}`;
    return `${txt} Right now (${timeStr}).`;
  }
  if (current === 'mid') {
    if (parts.hour < 11) return TIPS.mid.morning;
    return TIPS.mid.evening;
  }
  // on
  const nextAt = nextSeg ? nextSeg.start : 24;
  const nextLabel = nextSeg && nextAt < 24 ? fmt12(nextAt) : 'midnight';
  const minutesToNext = Math.max(0, Math.round((nextAt - (parts.hour + parts.minute/60)) * 60));
  const durStr = minutesToNext < 60 ? `${minutesToNext}m` : `${Math.floor(minutesToNext/60)}h ${minutesToNext%60 ? `${minutesToNext%60}m` : ''}`.trim();
  const txt = TIPS.on.replace('{nextLabel}', nextLabel);
  return `${txt}  Wait ${durStr} for a cheaper rate.`;
}

// Compute the weighted average of today's period prices (hours-weighted, hour-frac
// weighted at edges).
function todaysAvg(segments) {
  let total = 0, hours = 0;
  for (const s of segments) {
    total += RATES[s.period] * (s.end - s.start);
    hours += s.end - s.start;
  }
  return hours ? total / hours : RATES.off;
}

// ---------- RENDER ----------
const $ = sel => document.querySelector(sel);
// Track the previously-rendered period so we can fire a one-shot animation
// on the *next* render when the period flips.
let _lastPeriod = null;
let _justFlipped = false;

function renderChart(segments) {
  const chart = $('#chart');
  chart.innerHTML = '';
  for (const seg of segments) {
    const w = ((seg.end - seg.start) / 24) * 100;
    const bar = document.createElement('div');
    bar.className = `bar ${seg.period}`;
    bar.style.width = `${w}%`;
    bar.title = `${fmt12(seg.start)}–${fmt12(seg.end === 24 ? 0 : seg.end)} · ${PERIOD_LABEL[seg.period]} · ${RATES[seg.period].toFixed(2)} ¢/kWh`;
    // On-chart period label, only shown if the band is wide enough to fit text
    if (w >= 12) {
      const lbl = document.createElement('span');
      lbl.className = 'bar-label';
      lbl.setAttribute('aria-hidden', 'true');
      lbl.textContent = PERIOD_LABEL[seg.period].toUpperCase();
      bar.appendChild(lbl);
    }
    chart.appendChild(bar);
  }
  // "Now" line + labelled badge
  const line = document.createElement('div');
  line.className = 'now-line';
  line.id = 'now-line';
  const badge = document.createElement('div');
  badge.className = 'now-badge';
  badge.id = 'now-badge';
  badge.textContent = 'NOW';
  chart.appendChild(line);
  chart.appendChild(badge);
}

function setNowPosition() {
  const parts = torontoParts(new Date());
  const frac = (parts.hour + parts.minute / 60) / 24 * 100;
  const line = $('#now-line');
  const badge = $('#now-badge');
  if (line)  line.style.left = `${frac}%`;
  if (badge) badge.style.left = `${frac}%`;
  const hh = String(parts.hour).padStart(2, '0');
  const mm = String(parts.minute).padStart(2, '0');
  const nowEl = $('#now-time');
  if (nowEl) nowEl.textContent = `${hh}:${mm}`;
  const badgeTextEl = $('#now-badge');
  if (badgeTextEl) badgeTextEl.textContent = `Now · ${hh}:${mm}`;
}

function render() {
  const now = new Date();
  const info = currentPeriodFor(now);
  const { period, segmentsToday } = info;

  // Detect period flip (first render after a change). Skipped under
  // prefers-reduced-motion — see CSS @media (prefers-reduced-motion: reduce).
  _justFlipped = _lastPeriod !== null && _lastPeriod !== period;
  _lastPeriod = period;

  // Hero
  const hero = $('.hero');
  hero.dataset.period = period;
  document.body.dataset.period = period;
  $('.period-label').textContent = PERIOD_LABEL[period].toUpperCase();
  $('.rate-amount').textContent = RATES[period].toFixed(2);

  // Secondary line: "until" + delta vs today's avg
  const avg = todaysAvg(segmentsToday);
  const current = RATES[period];
  const diff = current - avg;
  const absDiff = Math.abs(diff);
  const deltaEl = $('.delta');
  if (absDiff < 0.005) { deltaEl.dataset.delta = 'flat'; deltaEl.textContent = 'matches today\'s avg'; }
  else if (diff > 0)   { deltaEl.dataset.delta = 'up';   deltaEl.textContent = `${absDiff.toFixed(2)} ¢ above today's avg`; }
  else                 { deltaEl.dataset.delta = 'down'; deltaEl.textContent = `${absDiff.toFixed(2)} ¢ below today's avg`; }

  // "Next change" wording on the secondary line
  const nextEl = $('.next');
  nextEl.textContent = info.nextLabel;

  // Tip
  const tipEl = $('#tip');
  tipEl.dataset.period = period;
  $('#tip-text').textContent = buildTip(now, period, segmentsToday);

  // Chart + now position
  renderChart(segmentsToday);
  setNowPosition();

  // Day label
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ }).format(now);
  $('#chart-day').textContent = today;

  // 3-hour axis ticks: 12 AM, 3 AM, 6 AM, ..., 12 AM
  const axis = $('#chart-axis');
  axis.innerHTML = '';
  for (let h = 0; h <= 24; h += 3) {
    const t = document.createElement('span');
    t.textContent = fmt12(h);
    axis.appendChild(t);
  }

  // Title flip — page title reflects current state
  document.title = `${PERIOD_LABEL[period]} · ${RATES[period].toFixed(2)} ¢/kWh — tou-now`;

  // Period-flip celebration. The class triggers a one-shot keyframe animation
  // on the hero + tip + active chart band. CSS removes it after the animation
  // ends. Skipped under prefers-reduced-motion via the @media block.
  if (_justFlipped) {
    document.body.classList.remove('period-flipped');
    // Force reflow so the animation re-fires reliably when flips happen close together
    void document.body.offsetWidth;
    document.body.classList.add('period-flipped');
  }
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
