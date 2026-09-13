import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  formatDuration,
  formatPace,
  toDistance,
  toElevation,
  toPace,
  UNITS,
} from '../lib/units.js'
import { extent, niceTicks } from '../lib/scale.js'

const PAD = { left: 46, right: 14, top: 14, bottom: 22 }
const PACE_H = 132
const ELE_H = 84
const GAP = 40

// Builds an SVG path, lifting the pen wherever the run was paused.
function linePath(xs, ys, breaks) {
  const breakSet = new Set(breaks)
  let d = ''
  let pen = false
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null) {
      pen = false
      continue
    }
    const cmd = !pen || breakSet.has(i) ? 'M' : 'L'
    d += `${cmd}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`
    pen = true
  }
  return d
}

function nearestIndex(distances, target) {
  let lo = 0
  let hi = distances.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (distances[mid] < target) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(distances[lo - 1] - target) < Math.abs(distances[lo] - target)) return lo - 1
  return lo
}

export default function PaceElevationChart({ run, unit, cursor, onCursorChange, highlight = null }) {
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(720)
  const u = UNITS[unit]

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const height = PAD.top + PACE_H + GAP + ELE_H + PAD.bottom
  const plotW = Math.max(80, width - PAD.left - PAD.right)
  const paceTop = PAD.top
  const eleTop = PAD.top + PACE_H + GAP

  const geom = useMemo(() => {
    const { d, pace, ele, t, breaks } = run.track
    const totalD = toDistance(d[d.length - 1], unit)
    const xs = d.map((v) => PAD.left + (toDistance(v, unit) / (totalD || 1)) * plotW)

    const paceVals = pace.map((p) => (p == null ? null : toPace(p, unit)))
    const sorted = paceVals.filter((p) => p != null).sort((a, b) => a - b)
    const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
    // Trim the tails and clamp: the slow ramp in and out of a run would
    // otherwise flatten the whole curve against the top of the panel.
    const pLo = sorted.length ? pct(0.04) : 0
    const pHi = sorted.length ? pct(0.96) : 1
    const padP = Math.max(0.08, (pHi - pLo) * 0.18)
    const paceMin = pLo - padP
    const paceMax = pHi + padP
    // faster pace (a smaller number) sits higher on the chart
    const paceY = (p) =>
      paceTop + ((Math.min(paceMax, Math.max(paceMin, p)) - paceMin) / (paceMax - paceMin)) * PACE_H

    const eleVals = ele.map((v) => (v == null ? null : toElevation(v, unit)))
    const [eLoRaw, eHiRaw] = extent(eleVals)
    const padE = Math.max(1, (eHiRaw - eLoRaw) * 0.12)
    const eleMin = eLoRaw - padE
    const eleMax = eHiRaw + padE
    const eleY = (v) => eleTop + ELE_H - ((v - eleMin) / (eleMax - eleMin || 1)) * ELE_H

    const paceYs = paceVals.map((p) => (p == null ? null : paceY(p)))
    const eleYs = eleVals.map((v) => (v == null ? null : eleY(v)))

    const areaPath = (() => {
      let path = ''
      let open = false
      const breakSet = new Set(breaks)
      for (let i = 0; i < xs.length; i++) {
        if (eleYs[i] == null) continue
        if (!open || breakSet.has(i)) {
          if (open) path += `L${xs[i - 1].toFixed(1)},${(eleTop + ELE_H).toFixed(1)}Z`
          path += `M${xs[i].toFixed(1)},${(eleTop + ELE_H).toFixed(1)}L${xs[i].toFixed(1)},${eleYs[i].toFixed(1)}`
          open = true
        } else {
          path += `L${xs[i].toFixed(1)},${eleYs[i].toFixed(1)}`
        }
      }
      if (open) path += `L${xs[xs.length - 1].toFixed(1)},${(eleTop + ELE_H).toFixed(1)}Z`
      return path
    })()

    const lastMarker = (unit === 'mi' ? run.milesMarkers : run.kmMarkers).slice(-1)[0]
    const lastMarkerX = lastMarker
      ? PAD.left + (toDistance(lastMarker.d, unit) / (totalD || 1)) * plotW
      : -Infinity

    return {
      xs,
      totalD,
      xOf: (km) => PAD.left + (toDistance(km, unit) / (totalD || 1)) * plotW,
      showTotalLabel: PAD.left + plotW - lastMarkerX > 46,
      distances: d.map((v) => toDistance(v, unit)),
      paceVals,
      eleVals,
      times: t,
      pacePath: linePath(xs, paceYs, breaks),
      elePath: linePath(xs, eleYs, breaks),
      areaPath,
      paceYs,
      eleYs,
      paceTicks: niceTicks(paceMin, paceMax, 3).filter((v) => v > paceMin && v < paceMax),
      paceY,
      eleTicks: niceTicks(eleMin, eleMax, 2).filter((v) => v > eleMin && v < eleMax),
      eleY,
    }
  }, [run, unit, plotW, paceTop, eleTop])

  const markers = unit === 'mi' ? run.milesMarkers : run.kmMarkers

  const handlePointer = useCallback(
    (event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * width
      const d = ((x - PAD.left) / plotW) * geom.totalD
      onCursorChange(nearestIndex(geom.distances, Math.max(0, Math.min(geom.totalD, d))))
    },
    [geom, onCursorChange, plotW, width],
  )

  const handleKey = useCallback(
    (event) => {
      const last = geom.xs.length - 1
      const step = event.shiftKey ? 20 : 1
      const at = cursor ?? 0
      if (event.key === 'ArrowRight') onCursorChange(Math.min(last, at + step))
      else if (event.key === 'ArrowLeft') onCursorChange(Math.max(0, at - step))
      else if (event.key === 'Home') onCursorChange(0)
      else if (event.key === 'End') onCursorChange(last)
      else return
      event.preventDefault()
    },
    [cursor, geom.xs.length, onCursorChange],
  )

  const i = cursor == null ? null : Math.max(0, Math.min(geom.xs.length - 1, cursor))
  const cursorX = i == null ? null : geom.xs[i]
  const tipRight = cursorX != null && cursorX > PAD.left + plotW * 0.62

  return (
    <div className="chart" ref={wrapRef}>
      <div className="chart__heads">
        <h3>
          Pace <span className="unit">{u.pace}</span>
        </h3>
        <p className="chart__hint">Scrub to move the marker on the map</p>
      </div>
      <svg
        className="chart__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Pace and elevation over distance for ${run.title}. Use arrow keys to scrub.`}
        tabIndex={0}
        onKeyDown={handleKey}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => onCursorChange(null)}
        onBlur={() => onCursorChange(null)}
      >
        {highlight && (
          <rect
            className="chart__highlight"
            x={geom.xOf(highlight.startKm)}
            width={Math.max(2, geom.xOf(highlight.endKm) - geom.xOf(highlight.startKm))}
            y={paceTop}
            height={PACE_H}
          />
        )}
        {geom.paceTicks.map((v) => (
          <g key={`pt${v}`}>
            <line className="chart__grid" x1={PAD.left} x2={PAD.left + plotW} y1={geom.paceY(v)} y2={geom.paceY(v)} />
            <text className="chart__tick" x={PAD.left - 8} y={geom.paceY(v)} dy="0.32em" textAnchor="end">
              {formatPace(unit === 'mi' ? v / 1.609344 : v, unit)}
            </text>
          </g>
        ))}
        {geom.eleTicks.map((v) => (
          <g key={`et${v}`}>
            <line className="chart__grid" x1={PAD.left} x2={PAD.left + plotW} y1={geom.eleY(v)} y2={geom.eleY(v)} />
            <text className="chart__tick" x={PAD.left - 8} y={geom.eleY(v)} dy="0.32em" textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}

        <path className="chart__area" d={geom.areaPath} />
        <path className="chart__line chart__line--ele" d={geom.elePath} />
        <path className="chart__line chart__line--pace" d={geom.pacePath} />

        <text className="chart__axis-label" x={PAD.left} y={eleTop - 12}>
          Elevation <tspan className="unit">{u.elevation}</tspan>
        </text>

        <line
          className="chart__axis"
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={paceTop + PACE_H}
          y2={paceTop + PACE_H}
        />
        <line
          className="chart__axis"
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={eleTop + ELE_H}
          y2={eleTop + ELE_H}
        />
        {markers.map((m) => {
          const x = PAD.left + (toDistance(m.d, unit) / (geom.totalD || 1)) * plotW
          return (
            <g key={m.n}>
              <line className="chart__mile" x1={x} x2={x} y1={paceTop} y2={paceTop + PACE_H} />
              <line className="chart__mile" x1={x} x2={x} y1={eleTop} y2={eleTop + ELE_H} />
              <text className="chart__tick" x={x} y={eleTop + ELE_H + 15} textAnchor="middle">
                {m.n}
              </text>
            </g>
          )
        })}
        {geom.showTotalLabel && (
          <text className="chart__tick" x={PAD.left + plotW} y={eleTop + ELE_H + 15} textAnchor="end">
            {geom.totalD.toFixed(2)} {u.distance}
          </text>
        )}

        {i != null && (
          <g className="chart__cursor">
            <line x1={cursorX} x2={cursorX} y1={paceTop} y2={paceTop + PACE_H} />
            <line x1={cursorX} x2={cursorX} y1={eleTop} y2={eleTop + ELE_H} />
            {geom.paceYs[i] != null && <circle cx={cursorX} cy={geom.paceYs[i]} r="4.5" className="dot dot--pace" />}
            {geom.eleYs[i] != null && <circle cx={cursorX} cy={geom.eleYs[i]} r="4.5" className="dot dot--ele" />}
          </g>
        )}
      </svg>

      <div className={`chart__readout ${i == null ? 'is-idle' : ''} ${tipRight ? 'is-right' : ''}`}>
        {i == null ? (
          <span className="chart__readout-idle">Hover or use arrow keys to read the run point by point.</span>
        ) : (
          <>
            <span>
              <b>{geom.distances[i].toFixed(2)}</b> {u.distance}
            </span>
            <span>
              <b>{formatPace(run.track.pace[i], unit)}</b> {u.pace}
            </span>
            <span>
              <b>{Math.round(geom.eleVals[i] ?? 0)}</b> {u.elevation}
            </span>
            <span>
              <b>{formatDuration(geom.times[i])}</b> elapsed
            </span>
          </>
        )}
      </div>
    </div>
  )
}
