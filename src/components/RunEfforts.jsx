// This run's own best stretches. Picking one highlights it on the map and in
// the pace chart, which is the point: a 7:12 mile means more once you can see
// which mile it was.
import { DISTANCE_EFFORTS, DURATION_EFFORTS, CORE_FRACTION } from '../lib/efforts.js'
import { paceFor } from '../lib/analysis.js'
import { formatDistance, formatDuration, formatPace, UNITS } from '../lib/units.js'

export function effortRows(run, unit) {
  if (!run.efforts) return []
  const rows = []
  for (const effort of DISTANCE_EFFORTS) {
    const hit = run.efforts.distances?.[effort.key]
    if (!hit || !effort.systems.includes(unit)) continue
    rows.push({
      key: effort.key,
      group: 'distance',
      label: effort.label,
      value: formatDuration(hit.sec),
      paceMinPerKm: paceFor(hit.sec, effort.km),
      startKm: hit.startKm,
      endKm: hit.startKm + effort.km,
    })
  }
  for (const effort of DURATION_EFFORTS) {
    const hit = run.efforts.durations?.[effort.key]
    if (!hit) continue
    rows.push({
      key: effort.key,
      group: 'duration',
      label: effort.label,
      value: null,
      km: hit.km,
      paceMinPerKm: paceFor(effort.sec, hit.km),
      startKm: hit.startKm,
      endKm: hit.startKm + hit.km,
    })
  }
  const core = run.efforts.core
  if (core) {
    rows.push({
      key: 'core',
      group: 'core',
      label: `Best ${Math.round(CORE_FRACTION * 100)}%`,
      value: formatDuration(core.sec),
      paceMinPerKm: paceFor(core.sec, core.km),
      startKm: core.startKm,
      endKm: core.startKm + core.km,
    })
  }
  return rows
}

function Group({ title, rows, unit, active, onSelect, showValue }) {
  const u = UNITS[unit]
  if (!rows.length) return null
  return (
    <div className="efforts__group">
      <h4>{title}</h4>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className={row.key === active ? 'is-active' : ''}
              aria-pressed={row.key === active}
              onClick={() => onSelect(row.key === active ? null : row.key)}
              title={`${row.label} at ${formatPace(row.paceMinPerKm, unit)}${u.pace}, from ${formatDistance(
                row.startKm,
                unit,
                2,
              )} to ${formatDistance(row.endKm, unit, 2)} ${u.distance} into the run`}
            >
              <span className="efforts__label">{row.label}</span>
              <span className="efforts__value">
                {showValue ? row.value : formatDistance(row.km, unit, 2)}
                {!showValue && <span className="unit"> {u.distance}</span>}
              </span>
              <span className="efforts__pace">
                {formatPace(row.paceMinPerKm, unit)}
                <span className="unit">{u.pace}</span>
              </span>
              <span className="efforts__at">
                {formatDistance(row.startKm, unit, 1)}–{formatDistance(row.endKm, unit, 1)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function RunEfforts({ rows, unit, active, onSelect }) {
  if (!rows.length) return null
  return (
    <section className="efforts">
      <div className="chart__heads">
        <h3>Best efforts</h3>
        <p className="chart__hint">Pick one to light it up on the map</p>
      </div>
      <div className="efforts__cols">
        <Group
          title="Fastest distance"
          rows={rows.filter((r) => r.group === 'distance' || r.group === 'core')}
          unit={unit}
          active={active}
          onSelect={onSelect}
          showValue
        />
        <Group
          title="Furthest in"
          rows={rows.filter((r) => r.group === 'duration')}
          unit={unit}
          active={active}
          onSelect={onSelect}
          showValue={false}
        />
      </div>
    </section>
  )
}
