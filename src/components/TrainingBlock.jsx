// The three sections about the current block of training: the plan being
// followed, the long runs climbing, and the walk breaks disappearing.
import { useMemo } from 'react'
import Tile from './Tile.jsx'
import { BarChart } from './AnalysisCharts.jsx'
import {
  distanceGroups,
  isLongRun,
  shapeProfile,
  walkRows,
  walkSummary,
  weeklyVolume,
} from '../lib/analysis.js'
import { dayLabel, MI_KM, planProgress, planRows, PLAN_NAME, todayISO } from '../lib/plan.js'
import { WALK_PACE_MIN_PER_KM } from '../lib/efforts.js'
import {
  formatDistance,
  formatDuration,
  formatPace,
  toDistance,
  toPace,
  UNITS,
} from '../lib/units.js'
import { runDay } from '../lib/datetime.js'
import { spacedTicks } from '../lib/scale.js'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_MS = 86400000

// "Sun 27 Sep" — short enough for a table row, unambiguous across a 12-week
// block that crosses a month boundary every fortnight.
const shortDate = (ms, withWeekday = false) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
  }).format(ms)

const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

// Miles as the plan prints them, in whichever unit is on screen.
const planDistance = (mi, unit) => `${formatDistance(mi * MI_KM, unit, 1)} ${UNITS[unit].distance}`

// How far into the recent past the "what does the distance cost" comparison
// reaches. Far enough for a few of each distance, near enough that it is the
// running you are doing now.
const RECENT_WEEKS = 12

// "40–45%" — which slice of a run's distance a shape profile picks out.
function slice(shape, better) {
  const i = shape.points.reduce((best, p, idx) => (better(p, shape.points[best]) ? idx : best), 0)
  const at = (n) => Math.round((n / shape.buckets) * 100)
  return `${at(i)}–${at(i + 1)}%`
}

export function PlanSection({ runs, unit }) {
  const rows = useMemo(() => planRows(runs), [runs])
  const progress = useMemo(() => planProgress(rows), [rows])
  if (!progress) return null

  const { last, next, peak, finish } = progress
  const scale = Math.max(...rows.map((r) => Math.max(r.headlineMi, r.longestMi)))
  const today = todayISO()
  const thisWeek = rows.find((r) => r.state === 'now') ?? last

  return (
    <>
      <div className="tiles">
        <Tile
          label="Where you are"
          value={`Week ${last.n}`}
          sub={`of ${rows.length} · ${shortDate(last.monday)} – ${shortDate(last.sunday)}`}
        />
        <Tile
          label="Longest so far"
          value={formatDistance(last.longest.distanceKm, unit, 2)}
          unit={UNITS[unit].distance}
          sub={`${runDay(last.longest.startMs, last.longest.tz)} · ${formatDuration(
            last.longest.durationSec,
          )} on your feet`}
          href={`#/run/${last.longest.id}`}
        />
        {next && (
          <Tile
            label="Next Sunday asks for"
            value={formatDistance(next.headlineMi * MI_KM, unit, 1)}
            unit={UNITS[unit].distance}
            sub={`week ${next.n}, ${shortDate(next.sunday, true)}`}
          />
        )}
        <Tile
          label="The ladder tops out"
          value={formatDistance(peak.headlineMi * MI_KM, unit, 1)}
          unit={UNITS[unit].distance}
          sub={`week ${peak.n}, ${shortDate(peak.sunday, true)}`}
        />
      </div>

      <ol className="plan">
        {rows.map((row) => {
          const inner = (
            <>
              <span className="plan__when">
                <b>Week {row.n}</b>
                <span>{shortDate(row.monday)}</span>
              </span>
              <span className="plan__bars">
                <span className="plan__bar plan__bar--ask" style={{ width: pct(row.headlineMi, scale) }} />
                <span className="plan__bar plan__bar--did" style={{ width: pct(row.longestMi, scale) }} />
              </span>
              <span className="plan__nums">
                <b>{row.longest ? formatDistance(row.longest.distanceKm, unit, 2) : '—'}</b>
                <span className="plan__ask-label">
                  {row.headline.race ? row.headline.label : planDistance(row.headlineMi, unit)}
                </span>
              </span>
            </>
          )
          return (
            <li key={row.n} className={`plan__row is-${row.state}`}>
              {row.longest ? <a href={`#/run/${row.longest.id}`}>{inner}</a> : <div>{inner}</div>}
            </li>
          )
        })}
      </ol>
      <p className="board__caption">
        One row per week of {PLAN_NAME}. The light bar is the long run that week asks for, the dark bar the
        furthest you actually went; weeks below the line haven’t happened yet. Through week {progress.longsDue}{' '}
        you have run {formatDistance(progress.actualMi * MI_KM, unit, 1)} {UNITS[unit].distance} of the{' '}
        {formatDistance(progress.planMi * MI_KM, unit, 1)} the plan asked for, over {progress.actualRuns} of its{' '}
        {progress.planRuns} runs, and {progress.longsHit === progress.longsDue ? 'every' : `${progress.longsHit} of ${progress.longsDue}`}{' '}
        Sunday long run came in at or past its target. The midweek sessions are where the shortfall is — the
        Saturday cross-training never shows up here either way, since Nike only records the runs.
        {finish.headline.race && (
          <>
            {' '}
            A {finish.headline.label.toLowerCase()} sits at the top of the ladder on{' '}
            {shortDate(finish.sunday, true)}, if you decide you want one.
          </>
        )}
      </p>

      <h3 className="asub">This week</h3>
      <div className="plan__week">
        {thisWeek.days.map((day, i) => {
          const ran = thisWeek.byDay[i]
          const date = thisWeek.monday + i * DAY_MS
          const isToday = new Date(date).toISOString().slice(0, 10) === today
          return (
            <div
              key={WEEKDAYS[i]}
              className={`plan__day ${ran.length ? 'is-done' : ''} ${isToday ? 'is-today' : ''}`}
            >
              <span className="plan__dow">{WEEKDAYS[i]}</span>
              <span className="plan__asked">
                {dayLabel(day, unit, (km) => `${formatDistance(km, unit, 1)} ${UNITS[unit].distance}`)}
              </span>
              {ran.map((run) => (
                <a key={run.id} className="plan__did-run" href={`#/run/${run.id}`}>
                  {formatDistance(run.distanceKm, unit, 2)} at {formatPace(run.avgPaceMinPerKm, unit)}
                </a>
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}

// A run's pace shape as a sparkline: twenty slices of its distance, each one
// against that run's own average. Above the middle is slower than the day's
// average, below it faster.
const SPARK_SPAN = 0.22

function ProfileStrip({ profile, height = 34 }) {
  // Fixed scale, so two runs can be read against each other, and clamped, so a
  // single crawl up a hill doesn't flatten everything either side of it.
  // Slower than the run's own average draws above the middle, matching the
  // run-shape chart further down the page.
  const y = (v) => height / 2 - Math.max(-1, Math.min(1, (v - 1) / SPARK_SPAN)) * (height / 2 - 2)
  const step = 100 / (profile.length - 1)
  const d = profile.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join('')
  return (
    <svg className="strip__spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <line
        className="strip__mid"
        x1="0"
        x2="100"
        y1={height / 2}
        y2={height / 2}
        vectorEffect="non-scaling-stroke"
      />
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function LongSection({ chron, unit, planned }) {
  const u = UNITS[unit]
  const weeks = useMemo(() => weeklyVolume(chron), [chron])
  const recent = useMemo(() => {
    const cut = chron[chron.length - 1].startMs - RECENT_WEEKS * 7 * DAY_MS
    return chron.filter((r) => r.startMs >= cut)
  }, [chron])
  const groups = useMemo(
    () => distanceGroups(recent, (km) => toDistance(km, unit), 0.5),
    [recent, unit],
  )
  const longs = useMemo(() => chron.filter(isLongRun).slice(-6).reverse(), [chron])
  // The shape these long runs share, so the caption can name where the slow
  // patch falls rather than leaving it to be squinted at.
  const longShape = useMemo(() => shapeProfile(longs), [longs])
  if (weeks.length < 2) return null

  // The plan's Sunday target, laid on the same weeks as the bars, so the point
  // where the ladder took over is visible rather than asserted.
  const target = new Map(planned?.map((row) => [row.from, row.headlineMi]) ?? [])
  const line = weeks.map((w) => (target.has(w.key) ? toDistance(target.get(w.key) * MI_KM, unit) : null))
  const values = weeks.map((w) => (w.longest ? toDistance(w.longest.distanceKm, unit) : 0))
  const best = Math.max(...values)
  const stride = Math.ceil(weeks.length / 7)
  const bars = weeks.map((w, i) => ({
    key: w.key,
    value: values[i],
    emphasis: values[i] === best && best > 0,
    title: w.longest
      ? `Week of ${w.key}: longest ${values[i].toFixed(2)} ${u.distance}`
      : `Week of ${w.key}: no runs`,
  }))
  const xTicks = weeks
    .map((w, i) =>
      i % stride === 0
        ? { i, label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(Date.parse(w.key)) }
        : null,
    )
    .filter(Boolean)

  const first = weeks.find((w) => w.longest)
  const last = [...weeks].reverse().find((w) => w.longest)
  const shortest = groups[0]
  const furthest = groups[groups.length - 1]

  return (
    <>
      <h3 className="asub">The long run, week by week</h3>
      <BarChart
        bars={bars}
        line={line}
        height={190}
        xTicks={xTicks}
        yFormat={(v) => v.toFixed(0)}
        aria={`Longest run each week in ${u.distance}`}
      />
      <p className="board__caption">
        Each bar is the furthest you went in that week. It sat on the same loop for months — {formatDistance(
          first.longest.distanceKm,
          unit,
          2,
        )} {u.distance} in the week of {shortDate(Date.parse(first.key))} — and now reads{' '}
        {formatDistance(last.longest.distanceKm, unit, 2)} {u.distance}
        {line.some((v) => v != null) ? '. The line is what the plan asked for that week.' : '.'}
      </p>

      {groups.length > 1 && (
        <>
          <h3 className="asub">What the extra distance costs</h3>
          <div className="grid-stats">
            {groups.map((g) => (
              <a key={g.at} className="grid-stats__cell" href={`#/run/${g.last.id}`}>
                <span className="grid-stats__label">
                  {g.at.toFixed(1)} {u.distance}
                </span>
                <span className="grid-stats__value">{formatPace(g.pace, unit)}</span>
                <span className="grid-stats__sub">
                  {g.count} run{g.count === 1 ? '' : 's'}
                </span>
              </a>
            ))}
          </div>
          <p className="board__caption">
            Every run of the last {RECENT_WEEKS} weeks, filed by distance, with the average pace across each
            group. The {furthest.at.toFixed(1)} {u.distance} runs go at {formatPace(furthest.pace, unit)}
            {u.pace} against {formatPace(shortest.pace, unit)}
            {u.pace} for the {shortest.at.toFixed(1)}s, so{' '}
            {Math.round(Math.abs(toPace(furthest.pace, unit) - toPace(shortest.pace, unit)) * 60)}s
            {u.pace} buys {Math.round((furthest.at / shortest.at - 1) * 100)}% more ground.
          </p>
        </>
      )}

      {longs.length > 0 && (
        <>
          <h3 className="asub">Inside the long runs</h3>
          <ol className="strips">
            {longs.map((run) => (
              <li key={run.id}>
                <a href={`#/run/${run.id}`}>
                  <span className="strip__meta">
                    <b>{formatDistance(run.distanceKm, unit, 2)} {u.distance}</b>
                    <span>
                      {runDay(run.startMs, run.tz)} · {formatPace(run.avgPaceMinPerKm, unit)}
                      {u.pace}
                    </span>
                  </span>
                  {run.efforts?.profile && <ProfileStrip profile={run.efforts.profile} />}
                </a>
              </li>
            ))}
          </ol>
          <p className="board__caption">
            Each line is one long run from start to finish, drawn against its own average pace: above the
            middle is the slow patches, below it the parts where you were moving. Flat is even; a line that
            drops towards the right is a run you finished faster than you started.
            {longShape && (
              <>
                {' '}
                Across these {longShape.runs}, the slow patch lands at{' '}
                {slice(longShape, (p, a) => p.mid > a.mid)} and the quickest stretch at{' '}
                {slice(longShape, (p, a) => p.mid < a.mid)}.
              </>
            )}
          </p>
        </>
      )}
    </>
  )
}

export function WalkSection({ chron, unit }) {
  const u = UNITS[unit]
  const rows = useMemo(() => walkRows(chron), [chron])
  const summary = useMemo(() => walkSummary(rows), [rows])
  if (!summary || !summary.worst || !summary.furthestClean) return null

  const bars = rows.map((r) => ({
    key: r.run.id,
    value: r.share * 100,
    emphasis: r === summary.worst,
    muted: r.count === 0,
    title: `${runDay(r.run.startMs, r.run.tz)}: ${
      r.count ? `${r.count} break${r.count === 1 ? '' : 's'}, ${Math.round(r.sec)}s walking` : 'no walk breaks'
    }`,
  }))
  let month = ''
  const xTicks = spacedTicks(
    rows
      .map((r, i) => {
        const key = r.run.date?.slice(0, 7)
        if (!key || key === month) return null
        month = key
        return {
          i,
          label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(
            Date.parse(`${key}-01`),
          ),
        }
      })
      .filter(Boolean),
    Math.max(2, Math.ceil(rows.length / 18)),
  )

  // The same picture one run at a time: the first of this block, the middle of
  // it, and the most recent, as a bar of running with the walking cut out.
  const picks = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]].filter(
    (r, i, all) => r && all.indexOf(r) === i,
  )

  return (
    <>
      <div className="tiles tiles--three">
        <Tile
          label="Furthest without stopping"
          value={formatDistance(summary.furthestClean.run.distanceKm, unit, 2)}
          unit={u.distance}
          sub={`${runDay(summary.furthestClean.run.startMs, summary.furthestClean.run.tz)} · ${formatDuration(
            summary.furthestClean.run.durationSec,
          )} without a break`}
          href={`#/run/${summary.furthestClean.run.id}`}
        />
        <Tile
          label="Straight through"
          value={`${summary.recentClean} of ${summary.recentOf}`}
          sub="most recent runs with no walk break at all"
        />
        <Tile
          label="Most walking"
          value={`${Math.round(summary.worst.share * 100)}%`}
          sub={`${runDay(summary.worst.run.startMs, summary.worst.run.tz)} · ${summary.worst.count} breaks in ${formatDuration(
            summary.worst.run.durationSec,
          )}`}
          href={`#/run/${summary.worst.run.id}`}
        />
      </div>

      <BarChart
        bars={bars}
        height={180}
        xTicks={xTicks}
        yFormat={(v) => `${Math.round(v)}%`}
        aria="Share of each run spent walking, run by run"
      />
      <p className="board__caption">
        One bar per run, in order: the share of that run’s time spent slower than{' '}
        {formatPace(WALK_PACE_MIN_PER_KM, unit)}
        {u.pace} for at least {summary.minSec} seconds, which is walking rather than a kerb or a gate. Of{' '}
        {summary.runs} runs here, {summary.clean} have no break in them at all
        {summary.streak > 1 ? `, and the last ${summary.streak} in a row` : ''}.
      </p>

      <h3 className="asub">Then and now</h3>
      <ol className="strips">
        {picks.map((r) => {
          const active = r.run.efforts?.activeSec || r.run.durationSec
          return (
            <li key={r.run.id}>
              <a href={`#/run/${r.run.id}`}>
                <span className="strip__meta">
                  <b>{formatDistance(r.run.distanceKm, unit, 2)} {u.distance}</b>
                  <span>
                    {runDay(r.run.startMs, r.run.tz)} ·{' '}
                    {r.count ? `${r.count} break${r.count === 1 ? '' : 's'}` : 'unbroken'}
                  </span>
                </span>
                <span className="strip__bar">
                  {r.segs.map(([at, sec]) => (
                    <span
                      key={at}
                      className="strip__walk"
                      style={{ left: pct(at, active), width: pct(sec, active) }}
                    />
                  ))}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
      <p className="board__caption">
        Each bar is one run from start to finish, with the walk breaks cut out of it.
      </p>
    </>
  )
}
