# tou-now

A tiny static site that tells you, **live**, which Time-of-Use (TOU) electricity
rate period you are currently in — built for London Hydro / Ontario residential
customers on the OEB Regulated Price Plan.

Open [https://JorgeQuijano.github.io/tou-now](https://JorgeQuijano.github.io/tou-now) and
keep the tab open — the indicator ticks along the 24-hour timeline and flips
automatically when the period changes (e.g. Mid-Peak → On-Peak at 11 AM).

## Features

- **Big live status pill** — current period + rate (¢/kWh) + "next change" countdown.
- **Today's timeline** — color-coded 24-hour chart with a moving "now" marker.
- **Theme selector** — system / light / dark (persisted).
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

The current ¢/kWh numbers live at the top of `app.js` in the `RATES` constant:

```js
const RATES = { off: 9.6, mid: 15.7, on: 24.1 };
```

Update them whenever the OEB publishes new rates (typically **May 1** and **Nov 1**):

1. Pull the latest from
   <https://www.oeb.ca/electricity/policies-and-directives/regulated-price-plan-electricity-rates>.
2. Edit `app.js`, push, done — no build, no cache.

## Local dev

Just open `index.html` in a browser. That's it.

## Source

Based on the schedule at
<https://www.londonhydro.com/accounts-services/electricity-rates>.
