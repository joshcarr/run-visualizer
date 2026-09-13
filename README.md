# run-visualizer

A web app for browsing runs exported from Nike Run Club.

## Running it

```bash
npm install
npm run dev      # regenerates the data, then serves on http://localhost:5173
npm run build    # regenerates the data, then builds to dist/
```

## How it works

`activities/` holds the raw NRC exports: one JSON per run, ~90 MB in total, each
one a bundle of timestamped metric series (latitude, longitude, elevation, pace,
distance, steps, calories) plus a summary block.

`scripts/build-data.mjs` turns that into something a browser can load — about
1.7 MB, written to `public/data/` (generated, so it isn't checked in):

- `index.json` — one summary per run for the list view, including a normalised
  route outline for the thumbnail, and lifetime totals.
- `runs/<id>.json` — the full track for one run: position, elevation, pace and
  cumulative distance at every GPS sample, plus mile and kilometre markers.

Along the way the script:

- detects pauses from gaps between GPS fixes and keeps the track from drawing a
  straight line across them,
- scales GPS path length to the watch's own distance total, so the mile markers
  agree with the headline number,
- smooths pace and elevation over a time window, since raw GPS pace is noisy,
- looks up each run's timezone from its start coordinates, so a run is dated in
  the place it happened rather than wherever you're reading it.

## The app

**List** — runs grouped by month, newest first. Each row shows the day, time,
title, distance, average pace, time, and a small route outline drawn as plain
SVG (no map tiles, so a list of 78 runs stays cheap).

**Detail** — the headline distance and the stats NRC shows (average pace, time,
calories, elevation gain, cadence, steps), then:

- a map with the route coloured green-to-red by pace, numbered mile markers, and
  start/finish pins,
- a pace chart and an elevation chart sharing one distance axis. Scrubbing
  either one moves a marker along the route on the map. Arrow keys work too.
- a splits table showing each mile against the run's average pace.

Distances toggle between miles and kilometres; the choice sticks.

Map tiles come from CARTO's OpenStreetMap basemaps, so the map needs network
access. Everything else works offline.
