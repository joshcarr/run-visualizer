// Green (fastest) through yellow to red (slowest). The ramp is a performance
// scale, so it always ships with the legend in RouteMap that names the pace at
// each end.
const STOPS = [
  [22, 163, 74],
  [101, 163, 13],
  [234, 179, 8],
  [234, 88, 12],
  [220, 38, 38],
]

export const FAST_COLOR = 'rgb(22, 163, 74)'
export const SLOW_COLOR = 'rgb(220, 38, 38)'

export function rampColor(t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5))
  const scaled = clamped * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(scaled))
  const f = scaled - i
  const [r, g, b] = STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f))
  return `rgb(${r}, ${g}, ${b})`
}

// pace is minutes per km; range is [fastest, slowest]
export function paceColor(pace, range) {
  if (pace == null || !range) return rampColor(0.5)
  const [fast, slow] = range
  if (slow <= fast) return rampColor(0.5)
  return rampColor((pace - fast) / (slow - fast))
}

export const rampCss = (steps = 12) =>
  `linear-gradient(to right, ${Array.from({ length: steps }, (_, i) => rampColor(i / (steps - 1))).join(', ')})`
