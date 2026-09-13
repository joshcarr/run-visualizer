// Small SVG chart parts for the analysis page. Same approach as the run detail
// charts: no chart library, no canvas, just paths sized to the container.
import { useEffect, useRef, useState } from 'react'
import { extent, niceTicks } from '../lib/scale.js'

const PAD = { left: 48, right: 12, top: 12, bottom: 26 }

export function useWidth(fallback = 680) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, Math.max(240, width)]
}

// Lifts the pen wherever y is missing, so a three-month break in training
// doesn't get drawn as a trend line straight across it.
function path(points, project) {
  let d = ''
  let pen = false
  for (const p of points) {
    if (p.y == null || !Number.isFinite(p.y)) {
      pen = false
      continue
    }
    const [x, y] = project(p)
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    pen = true
  }
  return d
}

// Keeps only as many axis labels as will fit without colliding.
function thin(ticks, plotW, minGap = 46) {
  const room = Math.max(2, Math.floor(plotW / minGap))
  const stride = Math.ceil(ticks.length / room)
  return stride > 1 ? ticks.filter((_, i) => i % stride === 0) : ticks
}

// One chart for every continuous-x panel on the page: pace against date,
// pace against temperature, pace against how far into a run you are.
export function XYChart({
  dots = [],
  line = null,
  step = null,
  band = null,
  xTicks = [],
  yFormat = (v) => v,
  yTickCount = 5,
  invertY = false,
  height = 200,
  aria,
  baseline = null,
  baselineLabel = null,
}) {
  const [ref, width] = useWidth()
  const plotW = Math.max(80, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom

  const xs = [...dots, ...(line ?? []), ...(step ?? []), ...(band ?? [])].map((p) => p.x)
  const ys = [
    ...dots.map((p) => p.y),
    ...(line ?? []).map((p) => p.y),
    ...(step ?? []).map((p) => p.y),
    ...(band ?? []).flatMap((p) => [p.lo, p.hi]),
    ...(baseline != null ? [baseline] : []),
  ]
  const [x0, x1] = extent(xs)
  const [yLo, yHi] = extent(ys)
  const padY = Math.max((yHi - yLo) * 0.12, 1e-6)
  const yMin = yLo - padY
  const yMax = yHi + padY
  const xSpan = x1 - x0 || 1

  const px = (x) => PAD.left + ((x - x0) / xSpan) * plotW
  const py = (y) => {
    const f = (y - yMin) / (yMax - yMin || 1)
    return PAD.top + (invertY ? f : 1 - f) * plotH
  }
  const project = (p) => [px(p.x), py(p.y)]
  const ticks = niceTicks(yMin, yMax, yTickCount).filter((v) => v > yMin && v < yMax)

  const stepPath = step?.length
    ? step.reduce((acc, p, i) => {
        const [x, y] = project(p)
        if (!i) return `M${x.toFixed(1)},${y.toFixed(1)}`
        const prevY = py(step[i - 1].y)
        return `${acc}L${x.toFixed(1)},${prevY.toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}`
      }, '')
    : null


  const bandPath = band?.length
    ? `${path(band.map((p) => ({ x: p.x, y: p.hi })), project)}${band
        .slice()
        .reverse()
        .map((p) => `L${px(p.x).toFixed(1)},${py(p.lo).toFixed(1)}`)
        .join('')}Z`
    : null

  return (
    <div className="acht" ref={ref}>
      <svg
        className="acht__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={aria}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart__grid" x1={PAD.left} x2={PAD.left + plotW} y1={py(v)} y2={py(v)} />
            <text className="chart__tick" x={PAD.left - 8} y={py(v)} dy="0.32em" textAnchor="end">
              {yFormat(v)}
            </text>
          </g>
        ))}

        {baseline != null && (
          <>
            <line className="acht__baseline" x1={PAD.left} x2={PAD.left + plotW} y1={py(baseline)} y2={py(baseline)} />
            {baselineLabel && (
              <text className="chart__tick" x={PAD.left + plotW} y={py(baseline) - 6} textAnchor="end">
                {baselineLabel}
              </text>
            )}
          </>
        )}

        {bandPath && <path className="acht__band" d={bandPath} />}
        {stepPath && <path className="acht__step" d={stepPath} />}
        {line?.length > 1 && <path className="acht__line" d={path(line, project)} />}

        {dots.map((p, i) => {
          const [x, y] = project(p)
          const circle = (
            <circle
              className={`acht__dot ${p.emphasis ? 'is-best' : ''}`}
              cx={x}
              cy={y}
              r={p.r ?? 3.6}
              style={p.color ? { fill: p.color } : undefined}
            >
              <title>{p.title}</title>
            </circle>
          )
          return p.href ? (
            <a key={p.key ?? i} href={p.href}>
              {circle}
            </a>
          ) : (
            <g key={p.key ?? i}>{circle}</g>
          )
        })}

        <line className="chart__axis" x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} />
        {thin(xTicks, plotW).map((t) => (
          <text
            key={t.v}
            className="chart__tick"
            x={Math.min(PAD.left + plotW, Math.max(PAD.left, px(t.v)))}
            y={PAD.top + plotH + 16}
            textAnchor={t.anchor ?? 'middle'}
          >
            {t.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

// Categorical bars, optionally with a trend line riding over the top.
export function BarChart({
  bars,
  line = null,
  yFormat = (v) => v,
  height = 190,
  aria,
  dense = false,
  xTicks = null,
}) {
  const [ref, width] = useWidth()
  const plotW = Math.max(80, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const values = bars.map((b) => b.value)
  const [, maxRaw] = extent([...values, ...(line ?? [])])
  const yMax = maxRaw > 0 ? maxRaw * 1.12 : 1
  const py = (v) => PAD.top + plotH - (v / yMax) * plotH
  const slot = plotW / bars.length
  const barW = dense ? slot : Math.max(2, Math.min(28, slot * 0.72))
  const ticks = niceTicks(0, yMax, 4).filter((v) => v > 0 && v < yMax)

  const linePath = line
    ? line
        .map((v, i) =>
          v == null ? '' : `${i && line[i - 1] != null ? 'L' : 'M'}${(PAD.left + slot * (i + 0.5)).toFixed(1)},${py(v).toFixed(1)}`,
        )
        .join('')
    : null

  return (
    <div className="acht" ref={ref}>
      <svg
        className="acht__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={aria}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="chart__grid" x1={PAD.left} x2={PAD.left + plotW} y1={py(v)} y2={py(v)} />
            <text className="chart__tick" x={PAD.left - 8} y={py(v)} dy="0.32em" textAnchor="end">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const h = b.value > 0 ? Math.max(1.5, plotH - (py(b.value) - PAD.top)) : 0
          return (
            <rect
              key={b.key ?? i}
              className={`acht__bar ${b.muted ? 'is-muted' : ''} ${b.emphasis ? 'is-best' : ''}`}
              x={PAD.left + slot * (i + 0.5) - barW / 2 + (dense ? 0.25 : 0)}
              y={PAD.top + plotH - h}
              width={Math.max(1, barW - (dense ? 0.5 : 0))}
              height={h}
              rx={dense ? 0 : Math.min(3, barW / 2)}
            >
              <title>{b.title}</title>
            </rect>
          )
        })}
        {linePath && <path className="acht__line" d={linePath} />}
        <line className="chart__axis" x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} />
        {thin(
          xTicks ?? bars.map((b, i) => (b.label ? { i, label: b.label } : null)).filter(Boolean),
          plotW,
          38,
        ).map((t) => (
          <text
            key={`${t.i}-${t.label}`}
            className="chart__tick"
            x={PAD.left + slot * (t.i + 0.5)}
            y={PAD.top + plotH + 16}
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
