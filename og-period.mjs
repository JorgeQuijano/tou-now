// Shared period math — used by both app.js (inlined via copy) and the
// OG-image generator. Pure ES module, no DOM, no Node-specific APIs.
// Keep this in sync with app.js if you change the schedule.

export const TZ = 'America/Toronto';
export const SUMMER_FIRST = { month: 4, day: 1 };   // May 1
export const SUMMER_LAST  = { month: 9, day: 31 };  // Oct 31
export const PERIOD_LABEL = { off: 'Off-Peak', mid: 'Mid-Peak', on: 'On-Peak' };

/** Returns { year, monthIndex, day, hour, minute, weekday } in Toronto time. */
export function torontoParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
    weekday: 'long',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    year:        parseInt(parts.year, 10),
    monthIndex:  parseInt(parts.month, 10) - 1,
    day:         parseInt(parts.day, 10),
    hour:        parseInt(parts.hour === '24' ? '0' : parts.hour, 10),
    minute:      parseInt(parts.minute, 10),
    weekday:     parts.weekday,
  };
}

function isWeekend(weekday) {
  return weekday === 'Saturday' || weekday === 'Sunday';
}

function isSummer(monthIndex, day) {
  const afterStart = (monthIndex > SUMMER_FIRST.month)
                  || (monthIndex === SUMMER_FIRST.month && day >= SUMMER_FIRST.day);
  const onOrBeforeEnd = (monthIndex < SUMMER_LAST.month)
                     || (monthIndex === SUMMER_LAST.month && day <= SUMMER_LAST.day);
  return afterStart && onOrBeforeEnd;
}

/** Returns { start, end, period }[] for the given day in Toronto time. */
export function buildDaySegments(date) {
  const p = torontoParts(date);
  const weekend = isWeekend(p.weekday);
  const summer = isSummer(p.monthIndex, p.day);

  let on = [], mid = [];
  if (!weekend) {
    if (summer) { on = [[11, 17]]; mid = [[7, 11], [17, 21]]; }
    else        { on = [[17, 21]]; mid = [[11, 17]]; }
  }
  const segs = Array(24).fill('off');
  for (const [s, e] of on)  for (let h = s; h < e; h++) segs[h] = 'on';
  for (const [s, e] of mid) for (let h = s; h < e; h++) segs[h] = 'mid';

  const segments = [];
  let cur = segs[0], start = 0;
  for (let h = 1; h <= 24; h++) {
    const next = h === 24 ? null : segs[h];
    if (next !== cur) {
      segments.push({ start, end: h, period: cur });
      cur = next; start = h;
    }
  }
  return segments;
}

const fmt12 = (h, m = 0) => {
  const hh24 = ((h % 24) + 24) % 24;
  const period = hh24 >= 12 ? 'PM' : 'AM';
  const hh = ((hh24 + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
};

/**
 * Returns { period, rate, periodLabel, endLabel, endTime } for the given
 * Date in Toronto time. Rate is from RATES.
 */
export function currentState(date, rates) {
  const p = torontoParts(date);
  const hour = p.hour + p.minute / 60;
  const segs = buildDaySegments(date);
  let current = segs.find(s => hour >= s.start && hour < s.end) || segs[segs.length - 1];
  const period = current.period;
  return {
    period,
    rate: rates[period],
    periodLabel: PERIOD_LABEL[period],
    endLabel: period === 'off' ? 'Until next period' : `Until ${fmt12(current.end)}`,
    endTime: fmt12(current.end),
    hour: p.hour,
    minute: p.minute,
  };
}