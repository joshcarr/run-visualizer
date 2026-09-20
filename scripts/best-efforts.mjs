// The fastest contiguous stretch of a run.
//
// Nike records distance as a stream of small increments, each stamped with the
// window it covers, and those increments sum exactly to the headline distance.
// That makes a far better basis for "what's my fastest mile" than the GPS
// track: no smoothing, no scaling, and nothing accrues while the run is paused.
//
// Everything here works on a cumulative series {t, d}: active seconds since the
// start against kilometres covered.

const PAUSE_GAP_MS = 20000

// Nike logs an auto-pause as a "halt" moment and then carries on stamping the
// distance stream straight through it, so a five-minute wait at a crossing
// arrives as one sample spanning five minutes. Pair the halts up first.
export function pausedIntervals(activity) {
  const halts = (activity.moments ?? [])
    .filter((m) => m.key === 'halt')
    .sort((a, b) => a.timestamp - b.timestamp)
  const out = []
  let open = null
  for (const m of halts) {
    if (m.value === 'pause' || m.value === 'auto_pause') {
      if (open == null) open = m.timestamp
    } else if ((m.value === 'resume' || m.value === 'auto_resume') && open != null) {
      out.push([open, m.timestamp])
      open = null
    }
  }
  // A trailing pause with no resume is just the end of the run.
  return out
}

function activeMs(from, to, paused) {
  let ms = to - from
  if (ms <= 0) return 0
  for (const [a, b] of paused) {
    const overlap = Math.min(to, b) - Math.max(from, a)
    if (overlap > 0) ms -= overlap
  }
  return Math.max(0, ms)
}

// Builds the cumulative series from the raw increments, holding the clock still
// across pauses so a stop at a traffic light doesn't count against a split.
export function activeSeries(values, paused = []) {
  const sorted = [...values].sort((a, b) => a.start_epoch_ms - b.start_epoch_ms)
  const t = [0]
  const d = [0]
  let clock = 0
  let km = 0
  let prev = sorted.length ? sorted[0].start_epoch_ms : 0
  for (const v of sorted) {
    const to = Math.max(prev, v.end_epoch_ms)
    // Anything still longer than a pause after that is a gap in the recording;
    // no distance accrued across it, so it shouldn't count as running time.
    const span = activeMs(prev, to, paused)
    clock += span > PAUSE_GAP_MS ? 0 : span / 1000
    km += v.value
    prev = to
    t.push(clock)
    d.push(km)
  }
  return { t, d }
}

const lerp = (a, b, f) => a + (b - a) * f

// The optimum window rarely lands on a sample boundary, so each search runs
// twice: once with the end pinned to a sample and the start interpolated, once
// the other way around. Best of the two is within a sample of the true answer.
export function bestForDistance(series, targetKm) {
  const { t, d } = series
  const n = t.length
  if (n < 2 || d[n - 1] < targetKm - 1e-9) return null
  let best = null
  const keep = (startSec, endSec, startKm) => {
    const sec = endSec - startSec
    if (sec > 0 && (!best || sec < best.sec)) {
      best = { sec, startSec, endSec, startKm, endKm: startKm + targetKm }
    }
  }

  for (let j = 1, i = 0; j < n; j++) {
    if (d[j] - d[0] < targetKm) continue
    while (i + 1 < j && d[j] - d[i + 1] >= targetKm) i++
    const span = d[i + 1] - d[i]
    const f = span > 0 ? (d[j] - targetKm - d[i]) / span : 0
    keep(lerp(t[i], t[i + 1], f), t[j], d[j] - targetKm)
  }

  for (let i = n - 2, k = n - 1; i >= 0; i--) {
    if (d[n - 1] - d[i] < targetKm) continue
    while (k - 1 > i && d[k - 1] - d[i] >= targetKm) k--
    const span = d[k] - d[k - 1]
    const f = span > 0 ? (d[i] + targetKm - d[k - 1]) / span : 0
    keep(t[i], lerp(t[k - 1], t[k], f), d[i])
  }

  return best
}

// The mirror image: the most ground covered in a fixed stretch of time.
export function bestForDuration(series, targetSec) {
  const { t, d } = series
  const n = t.length
  if (n < 2 || t[n - 1] < targetSec - 1e-9) return null
  let best = null
  const keep = (startSec, startKm, endKm) => {
    const km = endKm - startKm
    if (km > 0 && (!best || km > best.km)) {
      best = { km, sec: targetSec, startSec, endSec: startSec + targetSec, startKm, endKm }
    }
  }

  for (let j = 1, i = 0; j < n; j++) {
    if (t[j] - t[0] < targetSec) continue
    while (i + 1 < j && t[j] - t[i + 1] >= targetSec) i++
    const span = t[i + 1] - t[i]
    const f = span > 0 ? (t[j] - targetSec - t[i]) / span : 0
    keep(t[j] - targetSec, lerp(d[i], d[i + 1], f), d[j])
  }

  for (let i = n - 2, k = n - 1; i >= 0; i--) {
    if (t[n - 1] - t[i] < targetSec) continue
    while (k - 1 > i && t[k - 1] - t[i] >= targetSec) k--
    const span = t[k] - t[k - 1]
    const f = span > 0 ? (t[i] + targetSec - t[k - 1]) / span : 0
    keep(t[i], d[i], lerp(d[k - 1], d[k], f))
  }

  return best
}

// Reading the series at an arbitrary point, either way round.
function readAt(xs, ys, x) {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let lo = 0
  let hi = n - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  const span = xs[hi] - xs[lo]
  return span > 0 ? lerp(ys[lo], ys[hi], (x - xs[lo]) / span) : ys[lo]
}

export const distanceAt = (series, sec) => readAt(series.t, series.d, sec)
export const timeAt = (series, km) => readAt(series.d, series.t, km)

// The shape of a run: pace across equal slices of its distance, each one
// divided by the run's own average so runs of different speeds can be stacked.
export function paceProfile(series, buckets) {
  const total = series.d[series.d.length - 1]
  const avg = total > 0 ? series.t[series.t.length - 1] / total : 0
  if (!(avg > 0)) return null
  const out = []
  for (let i = 0; i < buckets; i++) {
    const a = (total * i) / buckets
    const b = (total * (i + 1)) / buckets
    out.push((timeAt(series, b) - timeAt(series, a)) / (b - a) / avg)
  }
  return out
}

// Time spent at each pace, sampled on a fixed grid so the result is a time
// histogram rather than a sample-count one. The grid interval doubles as a
// smoother: raw 2-second increments are far too jumpy to bin.
export function paceHistogram(series, { slice = 10, from = 2, to = 15, width = 0.1 } = {}) {
  const bins = new Array(Math.round((to - from) / width)).fill(0)
  const total = series.t[series.t.length - 1]
  for (let s = 0; s + slice <= total; s += slice) {
    const km = distanceAt(series, s + slice) - distanceAt(series, s)
    if (km <= 0) continue
    const pace = slice / 60 / km
    const idx = Math.floor((pace - from) / width)
    if (idx >= 0 && idx < bins.length) bins[idx] += slice
  }
  return bins
}

// The stretches where the running stopped. Sampled on the same fixed grid as
// the pace histogram — the raw increments are far too jumpy to threshold — and
// a stretch only counts once it has been held for minSec, so a kerb, a gate or
// one confused GPS second doesn't read as a walk.
export function walkBreaks(series, { paceMinPerKm, minSec, slice = 5 }) {
  const total = series.t[series.t.length - 1]
  if (!(total > 0)) return []
  const out = []
  let start = null
  const close = (end) => {
    if (start == null) return
    if (end - start >= minSec) {
      out.push({
        startSec: start,
        sec: end - start,
        startKm: distanceAt(series, start),
        km: distanceAt(series, end) - distanceAt(series, start),
      })
    }
    start = null
  }
  for (let s = 0; s < total - 1e-9; s += slice) {
    const to = Math.min(total, s + slice)
    const km = distanceAt(series, to) - distanceAt(series, s)
    const walking = !(km > 0) || (to - s) / 60 / km > paceMinPerKm
    if (walking) {
      if (start == null) start = s
    } else {
      close(s)
    }
  }
  close(total)
  return out
}

// The histogram with its empty tails dropped, so every run can carry its own
// copy in the index without the zeroes outweighing the numbers.
export function sparseHistogram(bins) {
  const first = bins.findIndex((v) => v > 0)
  if (first < 0) return null
  let last = bins.length - 1
  while (bins[last] === 0) last--
  return { at: first, seconds: bins.slice(first, last + 1).map((v) => Math.round(v)) }
}
