// Axis helpers shared by the charts.

// Tick values at round numbers, roughly `count` of them across the range.
export function niceTicks(min, max, count) {
  const span = max - min
  if (!(span > 0)) return [min]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1000; v += step) ticks.push(v)
  return ticks
}

export function extent(values) {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return Number.isFinite(min) ? [min, max] : [0, 1]
}

// Month boundaries across a span of time, thinned to whatever fits.
export function monthTicks(fromMs, toMs, maxTicks = 7) {
  const start = new Date(fromMs)
  const ticks = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cursor.getTime() <= toMs) {
    if (cursor.getTime() >= fromMs) ticks.push(cursor.getTime())
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  const stride = Math.ceil(ticks.length / maxTicks)
  return ticks.filter((_, i) => i % stride === 0)
}

export function monthLabel(ms) {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return d.getUTCMonth() === 0 ? `${month} ’${String(d.getUTCFullYear()).slice(2)}` : month
}
