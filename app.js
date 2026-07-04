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

// The date these rates were last verified against an OEB source. Update this
// when you bump RATES — it powers the "rates may be stale" notice.
const RATES_LAST_UPDATED = '2026-07-03';

// Ontario TOU rates refresh twice a year (May 1, Nov 1). Show a soft reminder
// when we're within 14 days of the next refresh window so users know to check
// the source if they're planning around the price.
const RATE_REFRESH_DATES = ['05-01', '11-01'];
const FRESHNESS_WINDOW_DAYS = 14;

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
  wireShareButton();
  wireNotifyButton();
  wireBellButton();
  watchPeriodChanges();
  renderRatesFreshness();

  // Sync the 60s render to wall-clock minute boundaries so the "now" line
  // doesn't lag up to ~60s behind reality right after boot. Then re-render
  // every minute. The 30s now-position tick runs as a background refresh.
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    render();
    setInterval(render, 60_000);
  }, msToNextMinute);
  setInterval(setNowPosition, 30_000);
}

document.addEventListener('DOMContentLoaded', start);

// ---------- SHARE BUTTON ----------
// Uses the Web Share API when available (mobile, some desktops), otherwise
// copies a period-aware share string to the clipboard with the modern
// Clipboard API, with a fallback to document.execCommand for ancient browsers.
function buildShareText(period, rate) {
  const map = {
    off: "Off-peak right now in Ontario — best time to run the dryer.",
    mid: "Mid-peak right now in Ontario — hold off on the big loads if you can.",
    on:  "On-peak right now in Ontario — avoid heavy loads until evening.",
  };
  const emoji = { off: '\u{1F33F}', mid: '\u{26A1}', on: '\u{1F525}' };
  return `${emoji[period] ?? ''} ${map[period]}\nCurrent TOU: ${PERIOD_LABEL[period]} · ${rate.toFixed(2)} ¢/kWh\nhttps://jorgequijano.github.io/tou-now/`;
}

function wireShareButton() {
  const btn = document.getElementById('share-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const { period, rate } = readCurrentState();
    const text = buildShareText(period, rate);
    const url = 'https://jorgequijano.github.io/tou-now/';
    const title = `tou-now · ${PERIOD_LABEL[period]} · ${rate.toFixed(2)} ¢/kWh`;
    // Prefer native share sheet on capable devices (mobile, Safari, modern Chrome)
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    // Clipboard fallback (works on every desktop)
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Old browser fallback
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    flashShareButton(btn, ok);
  });
}

function readCurrentState() {
  // Cheap helper: read whatever the renderer last wrote to the DOM, so the
  // share text always matches what the user sees.
  const period = document.body.dataset.period || 'off';
  const amt = document.querySelector('.rate-amount');
  const rate = amt ? parseFloat(amt.textContent) : RATES[period];
  return { period, rate: Number.isFinite(rate) ? rate : RATES[period] };
}

// ---------- notify / period-change alert ----------
const NOTIFY_KEY = 'tou-notify';
const NOTIFY_TOAST_TTL_MS = 9000;

function getNotifyPref() {
  try { return localStorage.getItem(NOTIFY_KEY) || 'off'; } catch { return 'off'; }
}
function setNotifyPref(v) {
  try { localStorage.setItem(NOTIFY_KEY, v); } catch {}
}

function wireNotifyButton() {
  const btn = document.getElementById('notify-btn');
  if (!btn) return;
  const label = document.getElementById('notify-label');

  function reflect() {
    const pref = getNotifyPref();
    const permission = ('Notification' in window) ? Notification.permission : 'denied';
    const enabled = pref === 'in-app' || pref === 'browser' || (pref === 'auto' && permission === 'granted');
    btn.setAttribute('aria-pressed', String(enabled));
    label.textContent = enabled
      ? (pref === 'in-app' ? 'In-app' : pref === 'browser' ? 'Browser' : 'On')
      : 'Notify';
    btn.classList.toggle('is-denied', permission === 'denied' && pref === 'browser');
    // Keep the bell button in sync with the notify state
    if (typeof reflectNotifyControls === 'function') reflectNotifyControls();
  }
  reflect();

  btn.addEventListener('click', async () => {
    const pref = getNotifyPref();
    if (pref === 'off' || pref === '') {
      // First click → request browser permission if available, fall back to in-app toast.
      // We *always* enable the in-app toast regardless of browser-notification outcome,
      // because the user clicked an explicit button.
      setNotifyPref('in-app');
      // Try to upgrade to browser notification in the same gesture.
      let upgraded = false;
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission();
          upgraded = result === 'granted';
        } catch { /* ignored */ }
      }
      if (upgraded) setNotifyPref('browser');
      reflect();
    } else {
      // Already on → turn off.
      setNotifyPref('off');
      reflect();
    }
  });

  // Reflect externally if the user revokes permission via the browser.
  if ('Notification' in window) {
    setInterval(() => {
      const pref = getNotifyPref();
      if (pref === 'browser' && Notification.permission !== 'granted') {
        setNotifyPref('in-app');
        reflect();
      }
    }, 10_000);
  }
}

function showPeriodToast(newPeriod, prevPeriod, rate) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  // Pull a period-appropriate line from the existing TIPS table.
  let friendly;
  if (newPeriod === 'off') {
    friendly = TIPS.off.base;
  } else if (newPeriod === 'mid') {
    // morning vs evening split (matches the page's buildTip logic)
    const parts = torontoParts(new Date());
    friendly = parts.hour < 11 ? TIPS.mid.morning : TIPS.mid.evening;
  } else {
    // on-peak: format the template if possible
    friendly = (typeof TIPS.on === 'string')
      ? TIPS.on.replace('{nextLabel}', 'off-peak tonight')
      : 'Heavy loads should wait.';
  }

  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.dataset.period = newPeriod;

  // Per-period accent color from the existing CSS tokens
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${newPeriod}-fg`).trim() || 'currentColor';
  const iconBg = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${newPeriod}-bg`).trim() || 'transparent';
  t.style.setProperty('--toast-accent', accent);
  t.style.setProperty('--toast-icon-bg', iconBg);

  const shortLabel = { off: 'Off', mid: 'Mid', on: 'On' }[newPeriod] ?? newPeriod;
  const titleText = `${PERIOD_LABEL[newPeriod]} · ${rate.toFixed(2)} ¢/kWh`;
  t.innerHTML = `
    <div class="toast-icon">${shortLabel.toUpperCase()}</div>
    <div class="toast-body">
      <p class="toast-title">${titleText}</p>
      <p class="toast-message">${friendly}</p>
    </div>
    <button type="button" class="toast-close" aria-label="Dismiss" tabindex="-1">×</button>
  `;
  stack.appendChild(t);

  // Animate in
  requestAnimationFrame(() => t.classList.add('is-visible'));

  const dismiss = () => {
    if (!t.isConnected) return;
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 350);
  };
  t.querySelector('.toast-close').addEventListener('click', e => { e.stopPropagation(); dismiss(); });
  t.addEventListener('click', e => {
    if (e.target.closest('.toast-close')) return;
    dismiss();
  });
  setTimeout(dismiss, NOTIFY_TOAST_TTL_MS);
}

function firePeriodChangeAlert(newPeriod, prevPeriod) {
  const { rate } = readCurrentState();
  const pref = getNotifyPref();

  // In-app toast — always try if user opted in (even if they only said 'browser').
  if (pref !== 'off') {
    showPeriodToast(newPeriod, prevPeriod, rate);
  }

  // Audio chime — independent of notify channel, but only enabled when
  // the user has explicitly toggled it on via the bell button.
  if (getSoundPref() === 'on') {
    playChime(newPeriod);
  }

  // Browser notification — only when opted in *and* permission is granted.
  if (pref === 'browser' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`${PERIOD_LABEL[newPeriod]} · ${rate.toFixed(2)} ¢/kWh`, {
        body: `Rate just changed from ${PERIOD_LABEL[prevPeriod]} to ${PERIOD_LABEL[newPeriod]}.`,
        tag: 'tou-period-change',
        icon: '/og-image.png',
      });
      // Auto-close after 8s — browsers honor this on macOS Safari, less reliably elsewhere
      setTimeout(() => n.close(), 8000);
    } catch (e) {
      // Notifications can throw if called from non-top-level frame, etc. Fall back silently.
    }
  }
}

function watchPeriodChanges() {
  // Hook into the existing render pipeline: piggyback on _justFlipped.
  // We override renderAfter to also fire the alert when _justFlipped is true.
  // (Implementation: we use a MutationObserver so we don't have to fork render())
  const target = document.body;
  let lastSeenPeriod = target.dataset.period || null;
  new MutationObserver(() => {
    const newPeriod = target.dataset.period;
    if (newPeriod && lastSeenPeriod && newPeriod !== lastSeenPeriod) {
      firePeriodChangeAlert(newPeriod, lastSeenPeriod);
    }
    lastSeenPeriod = newPeriod;
  }).observe(target, { attributes: true, attributeFilter: ['data-period'] });
}

// ---------- audio chime (Web Audio API, opt-in, period-tuned) ----------
//
// Three short, gentle two-note melodies — one per period — synthesized live
// with OscillatorNode + GainNode. No asset files, no autoplay risk: AudioContext
// is only `resume()`d inside a user gesture (the bell-button click).
//
// Tuning philosophy:
//   - Off-Peak = ascending (good news, "go ahead")
//   - Mid-Peak  = mild upward (heads-up, neutral)
//   - On-Peak   = descending (heads-up, "wait")

const SOUND_KEY = 'tou-chime';
let _audioCtx = null;
let _audioPrimed = false;

function audioCtx() {
  if (!_audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    _audioCtx = new C();
  }
  return _audioCtx;
}

// Ensure the AudioContext is running. Must be called inside a user gesture
// handler (browsers won't start a suspended context from arbitrary code paths).
function primeAudio() {
  const ctx = audioCtx();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  _audioPrimed = true;
  return true;
}

// Notes (frequencies in Hz). Pure-tone sine for a clean, non-intrusive feel.
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50,
};

// Per-period melody: array of { freq, dur } notes (sequential, no overlap).
// Each melody is ~0.5–0.8 seconds total — short enough not to be intrusive.
const CHIMES = {
  off: [ // ascending: "good news, run your loads"
    { freq: NOTE.C5, dur: 0.16 },
    { freq: NOTE.E5, dur: 0.16 },
    { freq: NOTE.G5, dur: 0.34 },
  ],
  mid: [ // mild rise: neutral heads-up
    { freq: NOTE.A4, dur: 0.18 },
    { freq: NOTE.C5, dur: 0.30 },
  ],
  on: [ // descending: "wait, prices are highest"
    { freq: NOTE.C5, dur: 0.16 },
    { freq: NOTE.A4, dur: 0.16 },
    { freq: NOTE.F4, dur: 0.40 },
  ],
};

function playChime(period) {
  if (getSoundPref() !== 'on') return;       // user opted out
  const ctx = audioCtx();
  if (!ctx) return;
  // Lazy resume — fine in the same call stack (no user gesture needed if already
  // primed). Browsers may still block the very first call if not primed.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const melody = CHIMES[period] || CHIMES.mid;
  const master = ctx.createGain();
  master.gain.value = 0; // start at 0 — we use the envelope on each note instead
  master.connect(ctx.destination);

  let t = ctx.currentTime + 0.01;
  const peak = 0.10; // master peak — quiet enough to not startle
  const notePeak = peak / Math.max(1, Math.sqrt(melody.length));

  for (const n of melody) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    // ADSR: 8ms attack, 60ms decay, sustain at notePeak, release over remaining dur
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(notePeak, t + 0.008);
    env.gain.linearRampToValueAtTime(notePeak * 0.55, t + 0.07);
    env.gain.linearRampToValueAtTime(0, t + n.dur);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + n.dur + 0.02);
    t += n.dur;
  }
}

function getSoundPref() {
  try { return localStorage.getItem(SOUND_KEY) || 'off'; } catch { return 'off'; }
}
function setSoundPref(v) {
  try { localStorage.setItem(SOUND_KEY, v); } catch {}
}

// Shared reflect function: keeps the notify button label/state AND the bell
// button enabled-state in sync with current prefs.
function reflectNotifyControls() {
  const btn = document.getElementById('notify-btn');
  const bell = document.getElementById('notify-bell');
  if (!btn || !bell) return;

  const notifyOn = getNotifyPref() !== 'off';
  const soundOn = getSoundPref() === 'on';

  bell.disabled = !notifyOn;
  bell.setAttribute('aria-pressed', String(soundOn));
  bell.title = soundOn
    ? 'Period-change chime ON — click to mute'
    : 'Toggle period-change chime (requires notifications on)';
}

function wireBellButton() {
  const bell = document.getElementById('notify-bell');
  if (!bell) return;

  reflectNotifyControls();

  bell.addEventListener('click', async () => {
    if (bell.disabled) return;
    primeAudio(); // user gesture: safe to start the AudioContext here
    const next = getSoundPref() === 'on' ? 'off' : 'on';
    setSoundPref(next);
    reflectNotifyControls();
    if (next === 'on') {
      // Play a preview so the user knows what to expect.
      // Use the current period's melody (or mid if undetermined).
      const cur = (document.body.dataset.period || 'mid');
      playChime(cur);
      // Tiny visual confirmation ring (CSS animation)
      bell.classList.remove('chime-preview');
      void bell.offsetWidth;
      bell.classList.add('chime-preview');
    }
  });
}

function flashShareButton(btn, ok) {
  const label = btn.querySelector('span');
  const original = label.textContent;
  label.textContent = ok ? 'Copied' : 'Press ⌘C';
  btn.classList.add('is-copied');
  btn.disabled = true;
  setTimeout(() => {
    label.textContent = original;
    btn.classList.remove('is-copied');
    btn.disabled = false;
  }, 1600);
}

// ---------- RATES-FRESHNESS NOTICE ----------
// Show a soft reminder if today is within FRESHNESS_WINDOW_DAYS of the next
// OEB rate change window, or if RATES_LAST_UPDATED is older than 8 months.
function renderRatesFreshness() {
  const el = document.getElementById('rates-freshness');
  if (!el) return;

  // Find the next refresh date from today (Toronto time)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const yyyy = now.getFullYear();
  const candidates = RATE_REFRESH_DATES.map(mmdd => {
    const [m, d] = mmdd.split('-').map(Number);
    return new Date(yyyy, m - 1, d);
  });
  // Add next year's windows too, so we always find a future candidate
  candidates.push(...RATE_REFRESH_DATES.map(mmdd => {
    const [m, d] = mmdd.split('-').map(Number);
    return new Date(yyyy + 1, m - 1, d);
  }));
  const future = candidates.filter(d => d.getTime() >= now.getTime())
                           .sort((a, b) => a - b)[0];
  const daysUntil = future ? Math.round((future - now) / 86_400_000) : Infinity;

  // Also check if RATES_LAST_UPDATED is itself stale (>8 months old)
  const updated = new Date(RATES_LAST_UPDATED + 'T00:00:00');
  const monthsOld = (now.getFullYear() - updated.getFullYear()) * 12
                  + (now.getMonth() - updated.getMonth());

  let body = null;
  if (monthsOld >= 8) {
    const mmdd = `${String(updated.getMonth() + 1).padStart(2,'0')}-${String(updated.getDate()).padStart(2,'0')}`;
    body = `Rates were last verified on <strong>${mmdd}</strong>. OEB typically updates twice yearly — confirm against the <a href="https://www.londonhydro.com/accounts-services/electricity-rates" target="_blank" rel="noopener">London Hydro source</a>.`;
  } else if (daysUntil <= FRESHNESS_WINDOW_DAYS) {
    const fmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: TZ });
    const mm = future.getMonth() + 1;
    const nextSeason = mm === 5 ? 'summer' : 'winter';
    body = `OEB TOU rates refresh on <strong>${fmt.format(future)}</strong> (${daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}). The ${nextSeason} prices will go live — check back or confirm against the <a href="https://www.londonhydro.com/accounts-services/electricity-rates" target="_blank" rel="noopener">London Hydro source</a>.`;
  }

  if (!body) { el.hidden = true; return; }
  el.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l9 16H3z"/>
        <path d="M12 10v4"/>
        <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
      </g>
    </svg>
    <span>${body}</span>
  `;
  el.hidden = false;
}
