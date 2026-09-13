import { useMemo } from 'react'
import RouteThumb from './RouteThumb.jsx'
import UnitToggle from './UnitToggle.jsx'
import { useRunIndex } from '../lib/useRunData.js'
import { formatDistance, formatDuration, formatPace, UNITS } from '../lib/units.js'
import { monthKey, runDay, runTime } from '../lib/datetime.js'

function Totals({ totals, unit }) {
  const u = UNITS[unit]
  return (
    <div className="totals">
      <div className="totals__hero">
        <span className="totals__value">{formatDistance(totals.distanceKm, unit, 1)}</span>
        <span className="totals__unit">{u.distance} total</span>
      </div>
      <dl className="totals__rest">
        <div>
          <dt>Runs</dt>
          <dd>{totals.runs}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatDuration(totals.durationSec)}</dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd>
            {Math.round(unit === 'mi' ? totals.ascentM * 3.280839895 : totals.ascentM).toLocaleString()}
            <span className="unit"> {u.elevation}</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function RunRow({ run, unit }) {
  const u = UNITS[unit]
  return (
    <li className="run-row">
      <a className="run-row__link" href={`#/run/${run.id}`}>
        <RouteThumb points={run.thumb} />
        <div className="run-row__body">
          <p className="run-row__when">
            {runDay(run.startMs, run.tz)} <span className="dot">·</span> {runTime(run.startMs, run.tz)}
          </p>
          <h3 className="run-row__title">{run.title}</h3>
          <div className="run-row__stats">
            <span className="run-row__distance">
              {formatDistance(run.distanceKm, unit)}
              <span className="unit"> {u.distance}</span>
            </span>
            <span>
              {formatPace(run.avgPaceMinPerKm, unit)}
              <span className="unit"> {u.pace}</span>
            </span>
            <span>{formatDuration(run.durationSec)}</span>
          </div>
        </div>
        <span className="run-row__chevron" aria-hidden="true">›</span>
      </a>
    </li>
  )
}

export default function RunList({ unit, onUnitChange }) {
  const { data, error } = useRunIndex()

  const groups = useMemo(() => {
    if (!data) return []
    const out = []
    for (const run of data.runs) {
      const key = monthKey(run.startMs, run.tz)
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, runs: [] })
      out[out.length - 1].runs.push(run)
    }
    return out
  }, [data])

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Activity</h1>
          <p className="page__sub">Runs from Nike Run Club</p>
        </div>
        <UnitToggle unit={unit} onChange={onUnitChange} />
      </header>

      {error && <p className="notice">Couldn’t load your runs: {error.message}</p>}
      {!data && !error && <p className="notice">Loading runs…</p>}

      {data && (
        <>
          <Totals totals={data.totals} unit={unit} />
          {groups.map((group) => (
            <section className="month" key={group.key}>
              <h2 className="month__title">{group.key}</h2>
              <ul className="run-list">
                {group.runs.map((run) => (
                  <RunRow key={run.id} run={run} unit={unit} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
