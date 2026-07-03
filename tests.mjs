// Smoke test for the TOU schedule logic in app.js.
// Run with: `node tests.mjs`
// Validates the hour boundaries, weekend rule, and season flips
// (May 1 = start of summer, Nov 1 = start of winter).

const TZ = 'America/Toronto';

function torontoParts(input) {
  const d = input instanceof Date ? input : new Date(input);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  let h = parseInt(parts.hour, 10);
  if (h === 24) h = 0;
  return {
    hour: h, minute: parseInt(parts.minute, 10),
    day: parseInt(parts.day, 10), monthIndex: parseInt(parts.month, 10) - 1,
  };
}

const SUMMER_FIRST = { month: 4, day: 1 };
const SUMMER_LAST  = { month: 9, day: 31 };

function buildDaySegments(isWeekend, isSummer) {
  let on = [], mid = [];
  if (isWeekend) {}
  else if (isSummer) { on = [[11,17]]; mid = [[7,11],[17,21]]; }
  else               { on = [[17,21]]; mid = [[11,17]]; }
  const segs = Array(24).fill('off');
  for (const [s,e] of on)  for (let h=s;h<e;h++) segs[h]='on';
  for (const [s,e] of mid) for (let h=s;h<e;h++) segs[h]='mid';
  const segments = [];
  let cur = segs[0], start = 0;
  for (let h=1;h<=24;h++) {
    const p = h===24 ? null : segs[h];
    if (p !== cur) { segments.push({start,end:h,period:cur}); cur=p; start=h; }
  }
  return segments;
}

function periodAt(now) {
  const parts = torontoParts(now);
  const hour = parts.hour + parts.minute/60;
  const wk = new Intl.DateTimeFormat('en-US', { weekday:'long', timeZone:TZ }).format(now);
  const isWeekend = wk === 'Saturday' || wk === 'Sunday';
  const m = parts.monthIndex, d = parts.day;
  const isSummer = (m > SUMMER_FIRST.month || (m === SUMMER_FIRST.month && d >= SUMMER_FIRST.day))
                && (m < SUMMER_LAST.month  || (m === SUMMER_LAST.month  && d <= SUMMER_LAST.day));
  const segs = buildDaySegments(isWeekend, isSummer);
  return segs.find(s => hour >= s.start && hour < s.end) || segs[segs.length-1];
}

function torontoDate(y, mo, d, h, mi) {
  const ref = new Date(Date.UTC(y, mo-1, d, h, mi));
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12:false,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(ref).map(p => [p.type, p.value]));
  let refH = parseInt(p.hour,10); if (refH===24) refH=0;
  const offsetHours = refH - h;
  return new Date(ref.getTime() - offsetHours * 3600 * 1000);
}

const tests = [
  // Summer weekday (Tue Jul 7 2026)
  [torontoDate(2026, 7,  7,  6,30), 'off', 'Summer Tue 06:30'],
  [torontoDate(2026, 7,  7,  7, 0), 'mid', 'Summer Tue 07:00 boundary'],
  [torontoDate(2026, 7,  7, 10,59), 'mid', 'Summer Tue 10:59'],
  [torontoDate(2026, 7,  7, 11, 0), 'on',  'Summer Tue 11:00 boundary'],
  [torontoDate(2026, 7,  7, 14, 0), 'on',  'Summer Tue 14:00'],
  [torontoDate(2026, 7,  7, 17, 0), 'mid', 'Summer Tue 17:00 boundary'],
  [torontoDate(2026, 7,  7, 20,59), 'mid', 'Summer Tue 20:59'],
  [torontoDate(2026, 7,  7, 21, 0), 'off', 'Summer Tue 21:00 boundary'],
  [torontoDate(2026, 7,  7, 23,30), 'off', 'Summer Tue 23:30'],
  // Winter weekday (Tue Jan 12 2027)
  [torontoDate(2027, 1, 12,  6,30),'off', 'Winter Tue 06:30'],
  [torontoDate(2027, 1, 12, 11, 0),'mid', 'Winter Tue 11:00 boundary'],
  [torontoDate(2027, 1, 12, 14, 0),'mid', 'Winter Tue 14:00'],
  [torontoDate(2027, 1, 12, 17, 0),'on',  'Winter Tue 17:00 boundary'],
  [torontoDate(2027, 1, 12, 20, 0),'on',  'Winter Tue 20:00'],
  [torontoDate(2027, 1, 12, 21, 0),'off', 'Winter Tue 21:00 boundary'],
  // Weekends all off-peak
  [torontoDate(2026, 7,  4, 12, 0), 'off', 'Summer Sat 12:00'],
  [torontoDate(2026, 7,  5, 18, 0), 'off', 'Summer Sun 18:00'],
  [torontoDate(2027, 1,  9, 12, 0), 'off', 'Winter Sat 12:00'],
  // Season flips (use Tuesdays to avoid weekend collision)
  [torontoDate(2026, 4, 30, 14, 0), 'mid', 'Apr 30 2026 (winter) weekday 14:00'],
  [torontoDate(2026, 5,  5, 14, 0), 'on',  'May 5 2026 (summer) weekday 14:00'],
  [torontoDate(2026,10, 27, 11, 0), 'on',  'Oct 27 2026 (still summer) weekday 11:00'],
  [torontoDate(2026,11,  3, 19, 0), 'on',  'Nov 3 2026 (winter) weekday 19:00'],
  [torontoDate(2027, 1,  5, 19, 0), 'on',  'Jan 5 2027 (winter) weekday 19:00'],
  [torontoDate(2027, 2, 16, 11,30), 'mid', 'Feb 16 2027 (winter) weekday 11:30'],
  [torontoDate(2027, 4, 27, 19, 0), 'on',  'Apr 27 2027 (winter) weekday 19:00'],
  [torontoDate(2027, 5,  4, 11, 0), 'on',  'May 4 2027 (summer) weekday 11:00'],
];

let pass = 0, fail = 0;
for (const [t, exp, label] of tests) {
  const got = periodAt(t);
  const ok = got && got.period === exp;
  console.log(`${ok ? 'PASS' : 'FAIL'}  want=${exp.padEnd(4)} got=${got?.period.padEnd(4)}  ${label}`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
