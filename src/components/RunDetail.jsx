import { useMemo, useState } from 'react'
import RouteMap from './RouteMap.jsx'
import PaceElevationChart from './PaceElevationChart.jsx'
import UnitToggle from './UnitToggle.jsx'
import { useRun } from '../lib/useRunData.js'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatMinutes,
  formatPace,
  formatTemp,
  KM_PER_MI,
  toDistance,
  toPace,
  UNITS,
} from '../lib/units.js'
import { runFullDate, runTime } from '../lib/datetime.js'
import { rampColor } from '../lib/paceColor.js'

const WEATHER = {
  'clear-day': ['☀️', 'Clear'],
  'mostly-clear-day': ['🌤️', 'Mostly clear'],
  'partly-cloudy-day': ['⛅', 'Partly cloudy'],
  'mostly-cloudy-day': ['🌥️', 'Mostly cloudy'],
  cloudy: ['☁️', 'Cloudy'],
  'light-rain': ['🌦️', 'Light rain'],
  rain: ['🌧️', 'Rain'],
}

function Stat({ label, value, unit }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <span className="unit"> {unit}</span>}
      </dd>
    </div>
  )
}

// Whole splits come from the build step; the leftover distance at the end gets
// its own row so the table adds up to the run.
function useSplits(run, unit) {
  return useMemo(() => {
    if (!run) return []
    const markers = unit === 'mi' ? run.milesMarkers : run.kmMarkers
    const unitKm = unit === 'mi' ? KM_PER_MI : 1
    const rows = markers.map((m) => ({
      key: String(m.n),
      label: String(m.n),
      distance: 1,
      pace: m.splitPace,
      elapsed: m.t,
      partial: false,
    }))
    const covered = markers.length * unitKm
    const leftover = run.distanceKm - covered
    if (leftover > unitKm * 0.02) {
      const lastT = markers.length ? markers[markers.length - 1].t : 0
      const span = run.durationSec - lastT
      rows.push({
        key: 'last',
        label: formatDistance(run.distanceKm, unit),
        distance: toDistance(leftover, unit),
        pace: span / 60 / toDistance(leftover, unit),
        elapsed: run.durationSec,
        partial: true,
      })
    }
    return rows
  }, [run, unit])
}

function Splits({ rows, unit, avgPace }) {
  const u = UNITS[unit]
  const paces = rows.map((r) => r.pace)
  const fast = Math.min(...paces)
  const slow = Math.max(...paces)
  // Bars run out from the run's average pace, so the length means something
  // rather than just re-ranking four near-identical splits.
  const maxDev = Math.max(0.08, ...rows.map((r) => Math.abs(r.pace - avgPace)))

  return (
    <section className="splits">
      <h3>Splits</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">{u.distance}</th>
            <th scope="col">Pace{u.pace}</th>
            <th scope="col" className="splits__delta-head">
              vs avg
            </th>
            <th scope="col" className="splits__bar-head">
              {formatMinutes(avgPace)}
              {u.pace} average
            </th>
            <th scope="col">Elapsed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dev = row.pace - avgPace
            const pct = (Math.min(1, Math.abs(dev) / maxDev) * 100) / 2
            const t = slow > fast ? (row.pace - fast) / (slow - fast) : 0.5
            const delta = `${dev < 0 ? '−' : '+'}${formatMinutes(Math.abs(dev))}`
            return (
              <tr key={row.key}>
                <th scope="row">
                  {row.label}
                  {row.partial && <span className="unit"> partial</span>}
                </th>
                <td className="num">{formatMinutes(row.pace)}</td>
                <td className="num splits__delta">{Math.abs(dev) < 0.008 ? '—' : delta}</td>
                <td className="splits__bar-cell">
                  <span className="splits__track">
                    <span className="splits__mid" />
                    <span
                      className="splits__bar"
                      style={{
                        background: rampColor(t),
                        width: `${pct}%`,
                        ...(dev < 0 ? { right: '50%' } : { left: '50%' }),
                      }}
                    />
                  </span>
                </td>
                <td className="num">{formatDuration(row.elapsed)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export default function RunDetail({ id, unit, onUnitChange }) {
  const { data: run, error } = useRun(id)
  const [cursor, setCursor] = useState(null)
  const splits = useSplits(run, unit)
  const u = UNITS[unit]

  if (error) {
    return (
      <div className="page">
        <a className="back" href="#/">
          ‹ All runs
        </a>
        <p className="notice">Couldn’t load that run: {error.message}</p>
      </div>
    )
  }
  if (!run) {
    return (
      <div className="page">
        <a className="back" href="#/">
          ‹ All runs
        </a>
        <p className="notice">Loading run…</p>
      </div>
    )
  }

  const weather = run.weather ? WEATHER[run.weather] : null
  const temp = formatTemp(run.tempC, unit)

  return (
    <div className="page">
      <header className="page__header page__header--detail">
        <a className="back" href="#/">
          ‹ All runs
        </a>
        <UnitToggle unit={unit} onChange={onUnitChange} />
      </header>

      <p className="detail__when">
        {runFullDate(run.startMs, run.tz)} <span className="dot">·</span> {runTime(run.startMs, run.tz)}
        {weather && (
          <>
            {' '}
            <span className="dot">·</span> <span title={weather[1]}>{weather[0]}</span> {temp}
          </>
        )}
      </p>
      <h1 className="detail__title">{run.title}</h1>

      <div className="hero">
        <span className="hero__value">{formatDistance(run.distanceKm, unit)}</span>
        <span className="hero__unit">{u.distance}</span>
      </div>

      <dl className="stats">
        <Stat label="Avg pace" value={formatPace(run.avgPaceMinPerKm, unit)} unit={u.pace} />
        <Stat label="Time" value={formatDuration(run.durationSec)} />
        <Stat label="Calories" value={run.calories.toLocaleString()} unit="cal" />
        <Stat label="Elevation gain" value={formatElevation(run.ascentM, unit)} unit={u.elevation} />
        <Stat label="Cadence" value={run.cadenceSpm} unit="spm" />
        <Stat label="Steps" value={run.steps.toLocaleString()} />
      </dl>

      <RouteMap run={run} unit={unit} cursor={cursor} onCursorChange={setCursor} />
      <PaceElevationChart run={run} unit={unit} cursor={cursor} onCursorChange={setCursor} />
      <Splits rows={splits} unit={unit} avgPace={toPace(run.avgPaceMinPerKm, unit)} />
    </div>
  )
}
