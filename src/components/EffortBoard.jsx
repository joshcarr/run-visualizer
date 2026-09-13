// Leaderboards for the "fastest contiguous X" question, in both directions:
// fastest time over a set distance, and most ground covered in a set time.
import { useMemo, useState } from 'react'
import { XYChart } from './AnalysisCharts.jsx'
import { distanceBoard, durationBoard } from '../lib/analysis.js'
import { paceIsRedundant } from '../lib/efforts.js'
import { formatDistance, formatDuration, formatMinutes, formatPace, toPace, UNITS } from '../lib/units.js'
import { monthLabel, monthTicks } from '../lib/scale.js'
import { runDay } from '../lib/datetime.js'

const TOP = 5

function Chips({ efforts, value, onChange, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {efforts.map((effort) => (
        <button
          key={effort.key}
          type="button"
          className={effort.key === value ? 'is-active' : ''}
          aria-pressed={effort.key === value}
          onClick={() => onChange(effort.key)}
        >
          {effort.label}
        </button>
      ))}
    </div>
  )
}

export default function EffortBoard({ runs, unit, efforts, mode, defaultKey, caption }) {
  const [key, setKey] = useState(defaultKey)
  const effort = efforts.find((e) => e.key === key) ?? efforts[0]
  const u = UNITS[unit]

  const rows = useMemo(() => {
    if (!effort) return []
    return mode === 'distance' ? distanceBoard(runs, effort) : durationBoard(runs, effort)
  }, [runs, effort, mode])

  if (!effort) return null

  const best = rows[0]
  // Same rows in the order they were run, so the chart can show the record
  // stepping down over the months rather than the leaderboard again.
  const byDate = [...rows].sort((a, b) => a.run.startMs - b.run.startMs)
  const metric = (row) => (mode === 'distance' ? row.sec : toPace(row.paceMinPerKm, unit))
  const formatMetric = (v) => (mode === 'distance' ? formatDuration(v) : formatMinutes(v))

  let running = Infinity
  const step = byDate.map((row) => {
    running = Math.min(running, metric(row))
    return { x: row.run.startMs, y: running }
  })

  const dots = byDate.map((row) => ({
    key: row.run.id,
    x: row.run.startMs,
    y: metric(row),
    emphasis: row === best,
    href: `#/run/${row.run.id}/e/${effort.key}`,
    title: `${runDay(row.run.startMs, row.run.tz)} — ${formatMetric(metric(row))}`,
  }))

  const span = byDate.length
    ? [byDate[0].run.startMs, byDate[byDate.length - 1].run.startMs]
    : [Date.now(), Date.now()]

  return (
    <div className="board">
      <Chips
        efforts={efforts}
        value={effort.key}
        onChange={setKey}
        label={mode === 'distance' ? 'Distance' : 'Window length'}
      />

      <ol className="board__list">
        {rows.slice(0, TOP).map((row, i) => (
          <li key={row.run.id} className={`board__row ${i === 0 ? 'is-best' : ''}`}>
            <a href={`#/run/${row.run.id}/e/${effort.key}`}>
              <span className="board__rank">{i + 1}</span>
              <span className="board__headline">
                {mode === 'distance' ? (
                  <>
                    <b>{formatDuration(row.sec)}</b>
                    {!paceIsRedundant(effort.key, unit) && (
                      <span className="board__pace">
                        {formatPace(row.paceMinPerKm, unit)}
                        <span className="unit">{u.pace}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <b>{formatPace(row.paceMinPerKm, unit)}</b>
                    <span className="board__pace">
                      {formatDistance(row.km, unit, 2)}
                      <span className="unit"> {u.distance}</span>
                    </span>
                  </>
                )}
              </span>
              <span className="board__meta">
                <span className="board__date">{runDay(row.run.startMs, row.run.tz)}</span>
                <span className="board__where">
                  {formatDistance(row.startKm, unit, 1)}–{formatDistance(row.endKm, unit, 1)} {u.distance} into a{' '}
                  {formatDistance(row.run.distanceKm, unit, 1)} {u.distance} run
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>

      {rows.length > 2 && (
        <>
          <XYChart
            dots={dots}
            step={step}
            invertY
            height={180}
            yFormat={formatMetric}
            xTicks={monthTicks(span[0], span[1]).map((v) => ({ v, label: monthLabel(v) }))}
            aria={`Best ${effort.label} in each run over time, with the record to date`}
          />
          <p className="board__caption">
            {caption} The line is the record as it stood on the day.
          </p>
        </>
      )}
    </div>
  )
}
