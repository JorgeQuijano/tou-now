# tou-now

A tiny static site that tells you, **live**, which Time-of-Use (TOU) electricity
rate period you are currently in — built for London Hydro / Ontario residential
customers on the OEB Regulated Price Plan.

Open [https://JorgeQuijano.github.io/tou-now](https://JorgeQuijano.github.io/tou-now) and
keep the tab open — the indicator ticks along the 24-hour timeline and flips
automatically when the period changes (e.g. Mid-Peak → On-Peak at 11 AM).

## Features

- **Big live status hero** — current period label + huge rate (¢/kWh) + "next change" + delta vs today's weighted average
- **Period-aware tip line** — calendar- and period-aware copy that tells you *what to do right now*
- **Today's timeline** — color-coded 24-hour chart with period-tinted bands, color-blind-safe patterns (dotted off / striped mid / solid on), 3-hour axis ticks, "Now" badge, and in-band labels (OFF-PEAK / MID-PEAK / ON-PEAK)
- **Period-flip micro-animation** — subtle pulse on the hero and tip line when the period changes (respects `prefers-reduced-motion`)
- **Share button** — native Web Share API on mobile, clipboard fallback on desktop, with period-aware copy
- **Rates-freshness notice** — soft amber banner appears within 14 days of an OEB rate refresh (May 1 / Nov 1) and when `RATES_LAST_UPDATED` is over 8 months old
- **OG image** — static 1200×630 card for Twitter / iMessage / Discord / Slack link previews
- **Theme selector** — system / light / dark (persisted in localStorage)
- **No build step** — pure HTML/CSS/JS. Loads instantly.

## Schedule used

The OEB RPP-TOU thresholds are hardcoded:

| Period  | Summer weekdays (May 1 – Oct 31)  | Winter weekdays (Nov 1 – Apr 30) | Weekends / holidays |
|---------|----------------------------------|----------------------------------|---------------------|
| On-Peak | 11 AM – 5 PM                     | 5 PM – 9 PM                      | —                   |
| Mid-Peak| 7–11 AM, 5–9 PM                  | 11 AM – 5 PM                     | —                   |
| Off-Peak| All other hours                  | All other hours                  | All day             |

Season flips on **May 1** and **November 1**, which is also when the OEB updates the
**prices**.

## Updating prices

The current ¢/kWh numbers and the freshness sentinel live at the top of `app.js`:

```js
const RATES = { off: 9.6, mid: 15.7, on: 24.1 };
const RATES_LAST_UPDATED = '2026-07-03';   // bump this every time you bump RATES
const RATE_REFRESH_DATES = ['05-01', '11-01'];  // when the freshness banner appears
```

Update them whenever the OEB publishes new rates (typically **May 1** and **Nov 1**):

1. Pull the latest from
   <https://www.oeb.ca/electricity/policies-and-directives/regulated-price-plan-electricity-rates>.
2. Edit `RATES` and `RATES_LAST_UPDATED` in `app.js`, push, done — no build, no cache.
3. The freshness banner will appear within 14 days of the next refresh window and remind any
   user with the tab open to verify against the source.

If you want to regenerate `og-image.png` to match the new prices:

```bash
node generate-og.mjs
```

(needs `sharp`, installed via `npm install sharp` — already in `.gitignore`)

## Accessibility

- Theme switcher uses `role="radiogroup"` with `aria-pressed` for screen-reader navigation
- Live updates are announced via `aria-live="polite"` on the tip line
- All animations respect `prefers-reduced-motion` — the flip pulse, eyebrow-dot pulse, now-line
  transition, and share-flash are all disabled when the user opts out
- Color is never the sole signal: chart bands use pattern fills (dot / stripe / solid) so the
  timeline is readable without color perception

## Local dev

Just open `index.html` in a browser. That's it.

## Source

Based on the schedule at
<https://www.londonhydro.com/accounts-services/electricity-rates>.
