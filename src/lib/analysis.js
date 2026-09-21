// Aggregations over the run index. Everything here works on the summaries in
// index.json — the per-run best efforts were computed at build time, so ranking
// 78 runs against each other is cheap enough to do on every render.
import {
  CORE_FRACTION,
  DISTANCE_EFFORTS,
  DURATION_EFFORTS,
  LONG_RUN_KM,
  WALK_MIN_SEC,
} from './efforts.js'

const DAY_MS = 86400000

export const paceFor = (sec, km) => (km > 0 ? sec / 60 / km : null)

export const median = (values) => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function quantile(values, q) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.min(s.length - 1, lo + 1)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

// Which rungs of the ladder this history actually reaches, in the unit system
// the reader is using.
export function availableEfforts(runs, unit) {
  return DISTANCE_EFFORTS.filter(
    (e) => e.systems.includes(unit) && runs.some((r) => r.efforts?.distances?.[e.key]),
  )
}

export function availableSprints(runs) {
  return DURATION_EFFORTS.filter((e) => runs.some((r) => r.efforts?.durations?.[e.key]))
}

// One row per run for a given target, fastest first. Every run contributes its
// own best, so the same run can't fill the board twice.
export function distanceBoard(runs, effort) {
  const rows = []
  for (const run of runs) {
    const hit = run.efforts?.distances?.[effort.key]
    if (!hit) continue
    rows.push({
      run,
      sec: hit.sec,
      paceMinPerKm: paceFor(hit.sec, effort.km),
      startKm: hit.startKm,
      endKm: hit.startKm + effort.km,
      value: hit.sec,
    })
  }
  return rows.sort((a, b) => a.value - b.value)
}

export function durationBoard(runs, effort) {
  const rows = []
  for (const run of runs) {
    const hit = run.efforts?.durations?.[effort.key]
    if (!hit) continue
    rows.push({
      run,
      sec: effort.sec,
      km: hit.km,
      paceMinPerKm: paceFor(effort.sec, hit.km),
      startKm: hit.startKm,
      endKm: hit.startKm + hit.km,
      value: -hit.km,
    })
  }
  return rows.sort((a, b) => a.value - b.value)
}

// Below this a run is a warm-up in its own right, and trimming a fifth off it
// says nothing useful about the ones that count.
export const CORE_MIN_KM = 2

// The run with its slow start and slow finish cut away: the fastest stretch
// covering CORE_FRACTION of the distance, against the headline average.
export function coreRows(runs) {
  const rows = []
  for (const run of runs) {
    const core = run.efforts?.core
    if (!core || !run.avgPaceMinPerKm || run.distanceKm < CORE_MIN_KM) continue
    const corePace = paceFor(core.sec, core.km)
    rows.push({
      run,
      corePace,
      fullPace: run.avgPaceMinPerKm,
      gain: run.avgPaceMinPerKm - corePace,
      warmupKm: core.startKm,
      cooldownKm: Math.max(0, run.distanceKm - (core.startKm + core.km)),
      startKm: core.startKm,
      endKm: core.startKm + core.km,
    })
  }
  return rows
}

export const coreSummary = (rows) => ({
  fraction: CORE_FRACTION,
  medianGain: median(rows.map((r) => r.gain)),
  biggest: rows.reduce((best, r) => (!best || r.gain > best.gain ? r : best), null),
  fastest: rows.reduce((best, r) => (!best || r.corePace < best.corePace ? r : best), null),
})

// The shape of a typical run: pace across equal slices of distance, each run
// normalised to its own average first. Median rather than mean, so one crawl
// home doesn't bend the whole curve.
export function shapeProfile(runs) {
  const profiles = runs.map((r) => r.efforts?.profile).filter(Boolean)
  if (profiles.length < 3) return null
  const buckets = profiles[0].length
  const out = []
  for (let i = 0; i < buckets; i++) {
    const column = profiles.map((p) => p[i]).filter((v) => v != null)
    out.push({
      mid: median(column),
      lo: quantile(column, 0.25),
      hi: quantile(column, 0.75),
    })
  }
  return { buckets, points: out, runs: profiles.length }
}

// Monday-anchored weeks, with the empty ones kept so a gap in training reads as
// a gap rather than as two bars side by side.
export function weeklyVolume(runs) {
  if (!runs.length) return []
  const weekStart = (date) => {
    const d = new Date(`${date}T00:00:00Z`)
    const shift = (d.getUTCDay() + 6) % 7
    return new Date(d.getTime() - shift * DAY_MS)
  }
  const byWeek = new Map()
  for (const run of runs) {
    if (!run.date) continue
    const key = weekStart(run.date).toISOString().slice(0, 10)
    const week = byWeek.get(key) ?? { key, km: 0, runs: 0, sec: 0, longest: null }
    week.km += run.distanceKm
    week.sec += run.durationSec
    week.runs += 1
    if (!week.longest || run.distanceKm > week.longest.distanceKm) week.longest = run
    byWeek.set(key, week)
  }
  const keys = [...byWeek.keys()].sort()
  const out = []
  for (let t = Date.parse(keys[0]); t <= Date.parse(keys[keys.length - 1]); t += 7 * DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10)
    out.push(byWeek.get(key) ?? { key, km: 0, runs: 0, sec: 0, longest: null })
  }
  return out
}

// Trailing mean over the last `size` entries, for a trend line that doesn't
// lurch on a single outlier.
export function rolling(values, size) {
  const out = []
  let sum = 0
  let count = 0
  const window = []
  for (const v of values) {
    window.push(v)
    if (v != null) { sum += v; count++ }
    if (window.length > size) {
      const gone = window.shift()
      if (gone != null) { sum -= gone; count-- }
    }
    out.push(count ? sum / count : null)
  }
  return out
}

export function byWeekday(runs) {
  const days = Array.from({ length: 7 }, (_, i) => ({ dow: i, runs: 0, km: 0, sec: 0 }))
  for (const run of runs) {
    if (run.dow == null || run.dow < 0) continue
    const day = days[run.dow]
    day.runs += 1
    day.km += run.distanceKm
    day.sec += run.durationSec
  }
  return days.map((d) => ({ ...d, pace: d.km > 0 ? d.sec / 60 / d.km : null }))
}

export const TIME_BLOCKS = [
  { key: 'early', label: 'Before 9am', from: 0, to: 9 },
  { key: 'midday', label: '9am – 3pm', from: 9, to: 15 },
  { key: 'evening', label: '3pm – 7pm', from: 15, to: 19 },
  { key: 'night', label: 'After 7pm', from: 19, to: 24 },
]

export function byTimeOfDay(runs) {
  return TIME_BLOCKS.map((block) => {
    const hits = runs.filter((r) => r.hour != null && r.hour >= block.from && r.hour < block.to)
    const km = hits.reduce((s, r) => s + r.distanceKm, 0)
    const sec = hits.reduce((s, r) => s + r.durationSec, 0)
    return { ...block, runs: hits.length, km, pace: km > 0 ? sec / 60 / km : null }
  })
}

// Consecutive-day streaks and how often the shoes actually go on.
export function consistency(runs) {
  const dates = [...new Set(runs.map((r) => r.date).filter(Boolean))].sort()
  if (!dates.length) return null
  let longest = 1
  let current = 1
  for (let i = 1; i < dates.length; i++) {
    const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / DAY_MS
    current = gap === 1 ? current + 1 : 1
    if (current > longest) longest = current
  }
  const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / DAY_MS + 1
  return {
    days: dates.length,
    span,
    longestStreak: longest,
    perWeek: (dates.length / span) * 7,
    first: dates[0],
    last: dates[dates.length - 1],
  }
}

// Rebins the build step's fine-grained minutes-per-km histogram onto whatever
// band width reads well in the unit on screen, trimming the empty tails.
export function rebinPace(histogram, { from, to, width, convert = (v) => v }) {
  const out = []
  for (let edge = from; edge < to - 1e-9; edge += width) {
    out.push({ from: edge, to: edge + width, seconds: 0 })
  }
  histogram.seconds.forEach((seconds, i) => {
    if (!seconds) return
    const centre = convert(histogram.from + (i + 0.5) * histogram.width)
    const idx = Math.floor((centre - from) / width)
    if (idx >= 0 && idx < out.length) out[idx].seconds += seconds
  })
  const first = out.findIndex((b) => b.seconds > 0)
  const last = out.length - 1 - [...out].reverse().findIndex((b) => b.seconds > 0)
  return first < 0 ? [] : out.slice(Math.max(0, first - 1), Math.min(out.length, last + 2))
}

// How long a layoff has to be before the runs on either side of it stop being
// the same stretch of training. Three weeks off is a different person coming
// back; three days off is a rest.
export const BLOCK_GAP_DAYS = 30

// Splits the history wherever the running stopped for a month or more, so the
// current block can be looked at on its own. Chronological in, chronological
// out, newest block last.
export function trainingBlocks(chron, gapDays = BLOCK_GAP_DAYS) {
  const blocks = []
  let current = []
  for (let i = 0; i < chron.length; i++) {
    if (i > 0 && (chron[i].startMs - chron[i - 1].startMs) / DAY_MS > gapDays) {
      blocks.push(current)
      current = []
    }
    current.push(chron[i])
  }
  if (current.length) blocks.push(current)
  return blocks.map((runs) => ({
    runs,
    from: runs[0],
    to: runs[runs.length - 1],
    days: (runs[runs.length - 1].startMs - runs[0].startMs) / DAY_MS + 1,
  }))
}

// Everything about the walking, per run and in aggregate. `share` is the
// fraction of the run spent walking, which is the number that actually moved:
// the count of breaks stayed flat for weeks while they got shorter.
export function walkRows(chron) {
  return chron
    .filter((r) => r.efforts?.walk && r.durationSec > 0)
    .map((run) => ({
      run,
      count: run.efforts.walk.count,
      sec: run.efforts.walk.sec,
      km: run.efforts.walk.km,
      share: run.efforts.walk.sec / run.durationSec,
      segs: run.efforts.walk.segs ?? [],
    }))
}

export function walkSummary(rows) {
  if (!rows.length) return null
  const clean = rows.filter((r) => !r.count)
  const recent = rows.slice(-10)
  // Trailing streak of runs finished without a single break.
  let streak = 0
  for (let i = rows.length - 1; i >= 0 && !rows[i].count; i--) streak++
  return {
    runs: rows.length,
    clean: clean.length,
    sec: rows.reduce((s, r) => s + r.sec, 0),
    streak,
    recentClean: recent.filter((r) => !r.count).length,
    recentOf: recent.length,
    // The furthest you have gone without stopping to walk.
    furthestClean: clean.reduce((best, r) => (!best || r.run.distanceKm > best.run.distanceKm ? r : best), null),
    worst: rows.reduce((best, r) => (!best || r.share > best.share ? r : best), null),
    lastBreak: [...rows].reverse().find((r) => r.count) ?? null,
    minSec: WALK_MIN_SEC,
  }
}

// Runs filed by how far they went, so "what does the extra distance cost me"
// has an answer. The bands come from the distances actually run — rounded to
// the nearest half a mile, or half a kilometre — rather than fixed edges,
// because the same loop repeated forty times is its own band.
export function distanceGroups(runs, toDisplay, step = 0.5, minRuns = 2) {
  const groups = new Map()
  for (const run of runs) {
    if (!run.durationSec) continue
    const at = Math.round(toDisplay(run.distanceKm) / step) * step
    const group = groups.get(at) ?? { at, runs: [], km: 0, sec: 0 }
    group.runs.push(run)
    group.km += run.distanceKm
    group.sec += run.durationSec
    groups.set(at, group)
  }
  return [...groups.values()]
    .filter((g) => g.runs.length >= minRuns)
    .sort((a, b) => a.at - b.at)
    .map((g) => ({
      at: g.at,
      count: g.runs.length,
      pace: g.km > 0 ? g.sec / 60 / g.km : null,
      best: g.runs.reduce((a, b) => (b.avgPaceMinPerKm < a.avgPaceMinPerKm ? b : a), g.runs[0]),
      walkShare: median(g.runs.map((r) => (r.efforts?.walk?.sec ?? 0) / r.durationSec)),
      last: g.runs.reduce((a, b) => (b.startMs > a.startMs ? b : a), g.runs[0]),
    }))
}

export const isLongRun = (run) => run.distanceKm >= LONG_RUN_KM

// Adds up the per-run spectra the build step stored, so "where the time goes"
// answers for whichever runs are on screen rather than for all of them.
export function mergeSpectra(runs, geometry) {
  const bins = new Array(Math.round((geometry.to - geometry.from) / geometry.width)).fill(0)
  let any = false
  for (const run of runs) {
    const sp = run.spectrum
    if (!sp) continue
    any = true
    sp.seconds.forEach((sec, i) => {
      const idx = sp.at + i
      if (idx >= 0 && idx < bins.length) bins[idx] += sec
    })
  }
  return any ? { ...geometry, seconds: bins } : null
}
