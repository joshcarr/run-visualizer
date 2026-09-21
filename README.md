# run-visualizer

A web app for browsing runs exported from Nike Run Club.

## Running it

```bash
npm install
npm run dev      # regenerates the data, then serves on http://localhost:5173
npm run build    # regenerates the data, then builds to dist/
```

## Getting new runs

```bash
cp .env.example .env    # once: paste a Nike token in
npm run sync            # downloads runs that aren't in activities/ yet
npm run dev             # rebuilds the data and serves the app
```

`scripts/nike-sync.mjs` walks Nike's activity feed newest-first, skips anything
already saved under `activities/`, and downloads the rest with the full metric
set. It stops as soon as it hits a page of runs it already has, so a routine
sync is two or three requests.

The token comes from a logged-in nike.com session: DevTools, Application, Local
Storage, the entry holding a JSON blob with `access_token` in it. Paste the
whole blob into `.env` as `NIKE_CREDENTIAL` and the script pulls the token out.
It lasts about an hour, so you re-copy it before a sync; the script prints how
much life is left and stops before making a request if it's dead. `.env` is
gitignored. Full details in `.env.example`.

| flag | |
| --- | --- |
| `--dry-run` | list what would be downloaded, write nothing |
| `--all` | walk the whole history instead of stopping at the first page you already have, which fills gaps |
| `--limit N` | stop after N new runs |

Pass them through npm with a `--` separator: `npm run sync -- --dry-run`.

The website credential is enough for activity data — no Run Club app token
needed. If Nike answers 401 on a token that's still in date, re-copy the blob;
the entry gets rewritten when the session refreshes.

## Deploying

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages
on every push to `main`. The data build runs in CI from the exports in
`activities/`, so `public/data/` stays generated rather than committed.

Turn it on once under Settings → Pages by setting the source to **GitHub
Actions**. The site is served from a subdirectory, which the app already handles:
`vite.config.js` sets `base: './'` so the asset and data URLs stay relative, and
the router reads `window.location.hash`, so a link straight to a single run
survives a hard refresh without any redirect rules.

## How it works

`activities/` holds the raw NRC exports: one JSON per run, ~90 MB in total, each
one a bundle of timestamped metric series (latitude, longitude, elevation, pace,
distance, steps, calories) plus a summary block.

`scripts/build-data.mjs` turns that into something a browser can load — about
1.9 MB, written to `public/data/` (generated, so it isn't checked in):

- `index.json` — one summary per run for the list view, including a normalised
  route outline for the thumbnail, each run's best efforts and walk breaks, its
  own slice of the pace histogram, and lifetime totals.
- `runs/<id>.json` — the full track for one run: position, elevation, pace and
  cumulative distance at every GPS sample, plus mile and kilometre markers.

Along the way the script:

- detects pauses from gaps between GPS fixes and keeps the track from drawing a
  straight line across them,
- scales GPS path length to the watch's own distance total, so the mile markers
  agree with the headline number,
- smooths pace and elevation over a time window, since raw GPS pace is noisy,
- looks up each run's timezone from its start coordinates, so a run is dated in
  the place it happened rather than wherever you're reading it,
- works out every best effort in the run — see below,
- and finds the walk breaks: stretches slower than 12:00 per mile held for at
  least half a minute, which is walking rather than a kerb or a gate.

## Best efforts

`scripts/best-efforts.mjs` answers "what's my fastest mile" by sliding a window
across the run rather than reading the splits off a table, so an effort that
straddles two mile markers still counts.

It works on Nike's own distance stream instead of the GPS track: a run arrives
as a few hundred small distance increments, each stamped with the window it
covers, and they sum exactly to the headline total. Auto-pauses come through as
`halt` moments, which get paired up and subtracted, so the clock stops when you
do. The result is a cumulative series of active seconds against kilometres, and
three searches over it:

- **fastest time for a distance** — 400 m up to a half marathon, whichever rungs
  the run is long enough for,
- **furthest in a window of time** — 30 seconds to 20 minutes, which is where
  flat-out efforts show up,
- **the core** — the fastest contiguous stretch covering 80% of the run, which
  is the run with the walk at the start and the walk after the goal beeps cut
  away.

Each search anchors one end of the window on a sample and interpolates the
other, in both directions, so the answer doesn't depend on where the samples
happened to land. Each run also stores its pace shape (pace across twentieths of
its distance, divided by its own average) and its own slice of the pace
histogram, so "where the time goes" can be answered for any subset of runs
rather than only for all of them.

## The app

**List** — runs grouped by month, newest first. Each row shows the day, time,
title, distance, average pace, time, and a small route outline drawn as plain
SVG (no map tiles, so a list of 78 runs stays cheap).

**Analysis** (`#/analysis`) — everything measured across a stretch of running at
once. It opens on the current block: the history is split wherever the running
stopped for a month or more, since the runs either side of a layoff aren't the
same training, and one chip switches back to the whole thing.

The page leads with where the training is now:

- **The ladder** — the twelve weeks of the half marathon plan in `src/lib/plan.js`
  against what was actually run, week by week, plus the current week's sessions.
  `PLAN_START` is the Monday week 1 began; move it if a week gets skipped and the
  alignment drifts.
- **Going long** — the longest run of each week, what the extra distance costs in
  pace (every recent run filed by distance), and each long run's pace shape as a
  sparkline.
- **Walk breaks** — the share of each run spent walking, run by run, and the same
  thing one run at a time as a bar with the breaks cut out of it.

Then the measurements that hold whatever you're training for: leaderboards of the
fastest mile, 5K and so on with the record stepping down over the months; the same
for sprints; what trimming the warm-up and cool-down is actually worth; the median
shape of a run; pace progression, weekly volume, a histogram of time spent at each
pace, and which days, times and temperatures you run in. Every leaderboard row
links to the run with that stretch lit up.

**Detail** — the headline distance and the stats NRC shows (average pace, time,
calories, elevation gain, cadence, steps), then:

- a map with the route coloured green-to-red by pace, numbered mile markers, and
  start/finish pins,
- a pace chart and an elevation chart sharing one distance axis. Scrubbing
  either one moves a marker along the route on the map. Arrow keys work too.
- a splits table showing each mile against the run's average pace,
- and this run's own best efforts; pick one and it lights up on the map while
  the rest of the route dims, with the same stretch shaded in the pace chart.

Distances toggle between miles and kilometres; the choice sticks.

Map tiles come from CARTO's OpenStreetMap basemaps, so the map needs network
access. Everything else works offline.
