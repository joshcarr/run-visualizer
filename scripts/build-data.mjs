// Turns the raw Nike Run Club activity exports in activities/ into compact JSON
// the web app can load: one index for the list, one file per run for the detail view.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'
import tzLookup from 'tz-lookup'
import {
  activeSeries,
  bestForDistance,
  bestForDuration,
  paceHistogram,
  paceProfile,
  pausedIntervals,
} from './best-efforts.mjs'
import {
  CORE_FRACTION,
  DISTANCE_EFFORTS,
  DURATION_EFFORTS,
  PROFILE_BUCKETS,
} from '../src/lib/efforts.js'

const SRC = 'activities'
const OUT = join('public', 'data')
const GAP_MS = 20000 // a jump this big in the GPS track means the run was paused
const MAX_POINTS = 2000

const HIST = { from: 2, to: 15, width: 0.1 }

const R_EARTH_KM = 6371.0088
const toRad = (d) => (d * Math.PI) / 180

function haversineKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

const round = (v, n) => (v == null || Number.isNaN(v) ? null : Number(v.toFixed(n)))

function summaryValue(activity, metric, summary) {
  const hit = activity.summaries?.find((s) => s.metric === metric && s.summary === summary)
  return hit ? hit.value : null
}

function metricValues(activity, type) {
  const hit = activity.metrics?.find((m) => m.type === type)
  return hit ? hit.values : []
}

// Walks a timestamped series and reads it at an arbitrary time, interpolating
// between the two neighbouring samples.
function makeSampler(values, { min = -Infinity, max = Infinity } = {}) {
  const pts = values
    .map((v) => ({ t: v.start_epoch_ms, v: v.value }))
    .filter((p) => p.v >= min && p.v <= max)
    .sort((a, b) => a.t - b.t)
  if (!pts.length) return () => null
  let cursor = 0
  return (t) => {
    if (t <= pts[0].t) return pts[0].v
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v
    if (pts[cursor].t > t) cursor = 0
    while (cursor < pts.length - 2 && pts[cursor + 1].t < t) cursor++
    const a = pts[cursor]
    const b = pts[cursor + 1]
    if (b.t === a.t) return a.v
    return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t)
  }
}

// Centred moving average in the time domain, so GPS jitter doesn't turn the
// pace heat map into confetti.
function smoothOverTime(times, values, windowSec) {
  const half = (windowSec * 1000) / 2
  const out = new Array(values.length).fill(null)
  let lo = 0
  let hi = 0
  let sum = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    while (hi < values.length && times[hi] <= times[i] + half) {
      if (values[hi] != null) { sum += values[hi]; count++ }
      hi++
    }
    while (times[lo] < times[i] - half) {
      if (values[lo] != null) { sum -= values[lo]; count-- }
      lo++
    }
    out[i] = count > 0 ? sum / count : values[i]
  }
  return out
}

// Positions along the track at every whole mile / kilometre.
function markersFor(points, unitKm) {
  const out = []
  const last = points[points.length - 1]
  const total = Math.floor(last.d / unitKm)
  let idx = 1
  let prevT = points[0].t
  for (let n = 1; n <= total; n++) {
    const target = n * unitKm
    while (idx < points.length && points[idx].d < target) idx++
    const b = points[Math.min(idx, points.length - 1)]
    const a = points[Math.max(0, Math.min(idx, points.length - 1) - 1)]
    const span = b.d - a.d
    const f = span > 0 ? (target - a.d) / span : 0
    const t = a.t + (b.t - a.t) * f
    out.push({
      n,
      lat: round(a.lat + (b.lat - a.lat) * f, 5),
      lon: round(a.lon + (b.lon - a.lon) * f, 5),
      d: round(target, 3),
      t: round((t - points[0].t) / 1000, 1),
      // pace for this split, in minutes per unit
      splitPace: round((t - prevT) / 1000 / 60, 2),
    })
    prevT = t
  }
  return out
}

// A tiny normalised outline of the route for the list thumbnails.
function thumbnail(points, maxPoints = 90) {
  const stride = Math.max(1, Math.ceil(points.length / maxPoints))
  const picked = points.filter((_, i) => i % stride === 0 || i === points.length - 1)
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const p of picked) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon)
  }
  const midLat = (minLat + maxLat) / 2
  // crude equirectangular projection is plenty at this scale
  const xSpan = (maxLon - minLon) * Math.cos(toRad(midLat))
  const ySpan = maxLat - minLat
  const span = Math.max(xSpan, ySpan, 1e-6)
  const xOff = (span - xSpan) / 2
  const yOff = (span - ySpan) / 2
  return picked.map((p) => [
    Math.round((((p.lon - minLon) * Math.cos(toRad(midLat)) + xOff) / span) * 100),
    Math.round((1 - ((p.lat - minLat) + yOff) / span) * 100),
    p.seg ? 1 : 0,
  ])
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localFields(ms, tz) {
  const parts = {}
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  })
  for (const p of fmt.formatToParts(ms)) parts[p.type] = p.value
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dow: WEEKDAYS.indexOf(parts.weekday),
    hour: Number(parts.hour) % 24,
  }
}

// Every "fastest contiguous X" the run is long enough for, plus its core: the
// fastest stretch covering most of the distance, which is the run with the
// walk-out at the start and the walk-back at the end cut off.
function bestEfforts(series) {
  const totalKm = series.d[series.d.length - 1]
  const totalSec = series.t[series.t.length - 1]
  const distances = {}
  for (const effort of DISTANCE_EFFORTS) {
    if (effort.km > totalKm + 1e-9) continue
    const best = bestForDistance(series, effort.km)
    if (!best) continue
    distances[effort.key] = {
      sec: round(best.sec, 1),
      startKm: round(best.startKm, 3),
      startSec: round(best.startSec, 1),
    }
  }

  const durations = {}
  for (const effort of DURATION_EFFORTS) {
    if (effort.sec > totalSec + 1e-9) continue
    const best = bestForDuration(series, effort.sec)
    if (!best) continue
    durations[effort.key] = {
      km: round(best.km, 4),
      startKm: round(best.startKm, 3),
      startSec: round(best.startSec, 1),
    }
  }

  const coreTarget = totalKm * CORE_FRACTION
  const core = bestForDistance(series, coreTarget)

  return {
    activeSec: round(totalSec, 1),
    distances,
    durations,
    core: core && {
      km: round(coreTarget, 4),
      sec: round(core.sec, 1),
      startKm: round(core.startKm, 3),
      startSec: round(core.startSec, 1),
    },
    profile: paceProfile(series, PROFILE_BUCKETS)?.map((v) => round(v, 3)) ?? null,
  }
}

function buildRun(file) {
  const activity = JSON.parse(readFileSync(join(SRC, file), 'utf8'))
  const id = basename(file, '.json')

  const lats = metricValues(activity, 'latitude')
  const lons = metricValues(activity, 'longitude')
  const eles = metricValues(activity, 'elevation')
  if (lats.length < 2 || lats.length !== lons.length) return null

  const elevationAt = makeSampler(eles)
  const paceAt = makeSampler(metricValues(activity, 'pace'), { min: 1.5, max: 40 })

  const distanceKm = summaryValue(activity, 'distance', 'total') ?? 0
  const durationSec = activity.active_duration_ms / 1000

  // Nike's own distance stream, with paused time taken out — the basis for
  // every best-effort number. Far steadier than anything derived from GPS.
  const paced = activeSeries(metricValues(activity, 'distance'), pausedIntervals(activity))
  const efforts = paced.d[paced.d.length - 1] > 0 ? bestEfforts(paced) : null
  const histogram = efforts ? paceHistogram(paced, { ...HIST, slice: 10 }) : null

  // Raw track, with pauses detected from gaps between GPS fixes.
  const raw = []
  let rawDist = 0
  for (let i = 0; i < lats.length; i++) {
    const t = lats[i].start_epoch_ms
    const lat = lats[i].value
    const lon = lons[i].value
    let seg = false
    if (i > 0) {
      const prev = raw[raw.length - 1]
      if (t - prev.t > GAP_MS) seg = true
      else rawDist += haversineKm(prev.lat, prev.lon, lat, lon)
    }
    raw.push({ t, lat, lon, ele: elevationAt(t), d: rawDist, seg })
  }

  // GPS path length and the watch's own distance rarely agree; trust the
  // summary total so mile markers line up with the headline number.
  const scale = rawDist > 0 && distanceKm > 0 ? distanceKm / rawDist : 1
  for (const p of raw) p.d *= scale

  const stride = Math.max(1, Math.ceil(raw.length / MAX_POINTS))
  const points = raw.filter((p, i) => i % stride === 0 || i === raw.length - 1 || p.seg)

  const times = points.map((p) => p.t)
  const paces = smoothOverTime(times, points.map((p) => paceAt(p.t)), 30)
  const eleSmooth = smoothOverTime(times, points.map((p) => p.ele), 20)

  const t0 = points[0].t
  const steps = summaryValue(activity, 'steps', 'total') ?? 0
  const movingPaces = paces.filter((p) => p != null).sort((a, b) => a - b)
  const pct = (q) => movingPaces[Math.min(movingPaces.length - 1, Math.floor(movingPaces.length * q))]

  const detail = {
    id,
    title: activity.tags?.['com.nike.name'] ?? 'Run',
    startMs: activity.start_epoch_ms,
    tz: tzLookup(points[0].lat, points[0].lon),
    distanceKm: round(distanceKm, 4),
    durationSec: round(durationSec, 1),
    elapsedSec: round((activity.end_epoch_ms - activity.start_epoch_ms) / 1000, 1),
    avgPaceMinPerKm: distanceKm > 0 ? round(durationSec / 60 / distanceKm, 3) : null,
    calories: round(summaryValue(activity, 'calories', 'total') ?? 0, 0),
    ascentM: round(summaryValue(activity, 'ascent', 'total') ?? 0, 1),
    descentM: round(summaryValue(activity, 'descent', 'total') ?? 0, 1),
    steps,
    cadenceSpm: durationSec > 0 ? round(steps / (durationSec / 60), 0) : null,
    nikefuel: round(summaryValue(activity, 'nikefuel', 'total') ?? 0, 0),
    tempC: activity.tags?.['com.nike.temperature'] ? Number(activity.tags['com.nike.temperature']) : null,
    weather: activity.tags?.['com.nike.weather'] ?? null,
    location: activity.tags?.['location'] ?? null,
    goalType: activity.tags?.['com.nike.running.goaltype'] ?? null,
    // colour ramp bounds: ignore the slowest/fastest tails so one stop light
    // doesn't flatten the whole run to a single colour
    paceRange: movingPaces.length ? [round(pct(0.05), 3), round(pct(0.95), 3)] : null,
    track: {
      t: points.map((p) => round((p.t - t0) / 1000, 1)),
      lat: points.map((p) => round(p.lat, 5)),
      lon: points.map((p) => round(p.lon, 5)),
      ele: eleSmooth.map((v) => round(v, 1)),
      d: points.map((p) => round(p.d, 4)),
      pace: paces.map((v) => round(v, 3)),
      breaks: points.map((p, i) => (p.seg ? i : -1)).filter((i) => i >= 0),
    },
    milesMarkers: markersFor(points, 1.609344),
    kmMarkers: markersFor(points, 1),
    efforts,
  }

  const summary = {
    id: detail.id,
    title: detail.title,
    startMs: detail.startMs,
    tz: detail.tz,
    distanceKm: detail.distanceKm,
    durationSec: detail.durationSec,
    avgPaceMinPerKm: detail.avgPaceMinPerKm,
    calories: detail.calories,
    ascentM: detail.ascentM,
    cadenceSpm: detail.cadenceSpm,
    tempC: detail.tempC,
    weather: detail.weather,
    thumb: thumbnail(points),
    efforts,
    // Local calendar fields, worked out here where the timezone is already
    // known, so the analysis page can group by week or weekday without
    // re-deriving them 78 times in the browser.
    ...localFields(detail.startMs, detail.tz),
  }

  return { detail, summary, histogram }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'runs'), { recursive: true })

const files = readdirSync(SRC).filter((f) => f.endsWith('.json'))
const summaries = []
const histogram = new Array(Math.round((HIST.to - HIST.from) / HIST.width)).fill(0)
let skipped = 0
for (const file of files) {
  const built = buildRun(file)
  if (!built) { skipped++; continue }
  writeFileSync(join(OUT, 'runs', `${built.detail.id}.json`), JSON.stringify(built.detail))
  summaries.push(built.summary)
  if (built.histogram) built.histogram.forEach((sec, i) => { histogram[i] += sec })
}
summaries.sort((a, b) => b.startMs - a.startMs)

const totals = summaries.reduce(
  (acc, r) => ({
    runs: acc.runs + 1,
    distanceKm: acc.distanceKm + r.distanceKm,
    durationSec: acc.durationSec + r.durationSec,
    calories: acc.calories + r.calories,
    ascentM: acc.ascentM + r.ascentM,
  }),
  { runs: 0, distanceKm: 0, durationSec: 0, calories: 0, ascentM: 0 },
)

writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify({
    generatedAt: Date.now(),
    totals,
    // Seconds spent at each pace across every run, bucketed in minutes per km.
    paceHistogram: { ...HIST, seconds: histogram.map((v) => round(v, 0)) },
    runs: summaries,
  }),
)

console.log(`built ${summaries.length} runs${skipped ? `, skipped ${skipped} without usable GPS` : ''}`)
