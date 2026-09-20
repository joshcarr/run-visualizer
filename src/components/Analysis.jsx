import { useMemo, useState } from 'react'
import EffortBoard from './EffortBoard.jsx'
import { BarChart, XYChart } from './AnalysisCharts.jsx'
import Tile from './Tile.jsx'
import { LongSection, PlanSection, WalkSection } from './TrainingBlock.jsx'
import UnitToggle from './UnitToggle.jsx'
import { useRunIndex } from '../lib/useRunData.js'
import {
  availableEfforts,
  availableSprints,
  byTimeOfDay,
  byWeekday,
  consistency,
  coreRows,
  coreSummary,
  median,
  mergeSpectra,
  rebinPace,
  rolling,
  shapeProfile,
  trainingBlocks,
  weeklyVolume,
} from '../lib/analysis.js'
import { planRows } from '../lib/plan.js'
import { DISTANCE_EFFORTS } from '../lib/efforts.js'
import {
  formatDistance,
  formatDuration,
  formatMinutes,
  formatPace,
  toDistance,
  toPace,
  UNITS,
} from '../lib/units.js'
import { monthLabel, monthTicks, niceTicks } from '../lib/scale.js'
import { monthKey, monthShort, runDay } from '../lib/datetime.js'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const SECTIONS = [
  ['plan', 'The ladder'],
  ['long', 'Going long'],
  ['walks', 'Walk breaks'],
  ['efforts', 'Best efforts'],
  ['sprints', 'Sprints'],
  ['core', 'Warm-up tax'],
  ['shape', 'Run shape'],
  ['progress', 'Progression'],
  ['volume', 'Volume'],
  ['spectrum', 'Pace spectrum'],
  ['patterns', 'Patterns'],
]

// Seconds as "3h 12m" / "42m", for axes where the numbers are hours of running.
function formatSpan(seconds) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  return `${h}h ${String(minutes % 60).padStart(2, '0')}m`
}

// A ratio against a run's own average, as a signed percentage.
function formatShare(v) {
  const pct = Math.round((v - 1) * 100)
  if (pct === 0) return '0%'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`
}

// Seconds per unit, signed, for "12s/mi faster" style deltas.
const paceDelta = (minutes, unit) => `${Math.round(Math.abs(minutes) * 60)}s${UNITS[unit].pace}`

// The hash is the router here, so the section links scroll rather than link.
function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Section({ id, title, blurb, children }) {
  return (
    <section className="asec" id={id}>
      <h2 className="asec__title">{title}</h2>
      {blurb && <p className="asec__blurb">{blurb}</p>}
      {children}
    </section>
  )
}

// The four numbers worth seeing before any of the charts.
function Records({ runs, unit }) {
  const pick = (key) => {
    const effort = DISTANCE_EFFORTS.find((e) => e.key === key)
    let best = null
    for (const run of runs) {
      const hit = run.efforts?.distances?.[key]
      if (hit && (!best || hit.sec < best.sec)) best = { ...hit, run }
    }
    return best && { ...best, effort }
  }
  const sprint = (() => {
    let best = null
    for (const run of runs) {
      const hit = run.efforts?.durations?.['1min']
      if (hit && (!best || hit.km > best.km)) best = { ...hit, run }
    }
    return best
  })()
  const longest = runs.reduce((a, b) => (b.distanceKm > a.distanceKm ? b : a), runs[0])
  const unitBest = pick(unit === 'mi' ? '1mi' : '1km')
  const fiveK = pick('5km')

  const tiles = []
  if (unitBest) {
    tiles.push({
      label: `Fastest ${unitBest.effort.label}`,
      value: formatDuration(unitBest.sec),
      sub: runDay(unitBest.run.startMs, unitBest.run.tz),
      href: `#/run/${unitBest.run.id}/e/${unitBest.effort.key}`,
    })
  }
  if (fiveK) {
    tiles.push({
      label: 'Fastest 5K',
      value: formatDuration(fiveK.sec),
      sub: runDay(fiveK.run.startMs, fiveK.run.tz),
      href: `#/run/${fiveK.run.id}/e/5km`,
    })
  }
  if (sprint) {
    tiles.push({
      label: 'Top speed (1 min)',
      // a minute's worth of distance, expressed the usual way round
      value: formatPace(1 / sprint.km, unit),
      unit: UNITS[unit].pace,
      sub: runDay(sprint.run.startMs, sprint.run.tz),
      href: `#/run/${sprint.run.id}/e/1min`,
    })
  }
  if (longest) {
    tiles.push({
      label: 'Longest run',
      value: formatDistance(longest.distanceKm, unit, 2),
      unit: UNITS[unit].distance,
      sub: runDay(longest.startMs, longest.tz),
      href: `#/run/${longest.id}`,
    })
  }
  return <div className="tiles">{tiles.map((t) => <Tile key={t.label} {...t} />)}</div>
}

// The run with the walk-out and the walk-back cut off.
function CoreSection({ runs, unit }) {
  const rows = useMemo(() => coreRows(runs), [runs])
  const summary = useMemo(() => coreSummary(rows), [rows])
  if (!rows.length || !summary.fastest) return null

  const u = UNITS[unit]
  const ranked = [...rows].sort((a, b) => a.corePace - b.corePace).slice(0, 8)
  const worstGain = toPace(summary.biggest.gain, unit)
  const medianGain = toPace(summary.medianGain, unit)
  const scale = Math.max(...ranked.map((r) => r.fullPace))
  const floor = Math.min(...ranked.map((r) => r.corePace)) * 0.965

  return (
    <>
      <div className="tiles tiles--three">
        <Tile
          label={`Fastest ${Math.round(summary.fraction * 100)}%`}
          value={formatPace(summary.fastest.corePace, unit)}
          unit={u.pace}
          sub={`${runDay(summary.fastest.run.startMs, summary.fastest.run.tz)} · whole run ${formatPace(
            summary.fastest.fullPace,
            unit,
          )}`}
          href={`#/run/${summary.fastest.run.id}`}
        />
        <Tile
          label="Typical gain"
          value={paceDelta(medianGain, unit)}
          sub="median across every run"
        />
        <Tile
          label="Biggest gain"
          value={paceDelta(worstGain, unit)}
          sub={`${runDay(summary.biggest.run.startMs, summary.biggest.run.tz)} · ${formatDistance(
            summary.biggest.warmupKm + summary.biggest.cooldownKm,
            unit,
            2,
          )} ${u.distance} trimmed off the ends`}
          href={`#/run/${summary.biggest.run.id}`}
        />
      </div>

      <ol className="core-list">
        {ranked.map((row) => {
          const width = (p) => `${Math.max(4, ((scale - p) / (scale - floor)) * 100)}%`
          return (
            <li key={row.run.id}>
              <a href={`#/run/${row.run.id}`}>
                <span className="core-list__when">{runDay(row.run.startMs, row.run.tz)}</span>
                <span className="core-list__bars">
                  <span className="core-list__bar core-list__bar--full" style={{ width: width(row.fullPace) }} />
                  <span className="core-list__bar core-list__bar--core" style={{ width: width(row.corePace) }} />
                </span>
                <span className="core-list__nums">
                  <b>{formatPace(row.corePace, unit)}</b>
                  <span className="core-list__full">{formatPace(row.fullPace, unit)}</span>
                  <span className={`core-list__gain ${row.gain > 0.0008 ? 'is-up' : ''}`}>
                    {row.gain > 0.0008 ? `−${paceDelta(toPace(row.gain, unit), unit)}` : '—'}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>
      <p className="board__caption">
        Dark bar: the fastest {Math.round(summary.fraction * 100)}% of the run. Light bar behind it: the
        whole run, warm-up and cool-down included.
      </p>
    </>
  )
}

function ShapeSection({ runs }) {
  const shape = useMemo(() => shapeProfile(runs), [runs])
  if (!shape) return null
  const band = shape.points.map((p, i) => ({
    x: (i + 0.5) / shape.buckets,
    lo: p.lo,
    hi: p.hi,
  }))
  const line = shape.points.map((p, i) => ({ x: (i + 0.5) / shape.buckets, y: p.mid }))
  const slowest = shape.points.reduce((a, b, i) => (b.mid > shape.points[a].mid ? i : a), 0)
  const fastest = shape.points.reduce((a, b, i) => (b.mid < shape.points[a].mid ? i : a), 0)
  const pct = (i) => `${Math.round((i / shape.buckets) * 100)}–${Math.round(((i + 1) / shape.buckets) * 100)}%`

  return (
    <>
      <XYChart
        band={band}
        line={line}
        height={200}
        baseline={1}
        baselineLabel="that run's average"
        yFormat={formatShare}
        xTicks={[
          { v: 0, label: 'Start', anchor: 'start' },
          { v: 0.25, label: '25%' },
          { v: 0.5, label: 'Halfway' },
          { v: 0.75, label: '75%' },
          { v: 1, label: 'Finish', anchor: 'end' },
        ]}
        aria="Median pace across each twentieth of a run, relative to that run's own average"
      />
      <p className="board__caption">
        Every run stretched onto the same axis and divided by its own average pace, then read off at the
        median of all {shape.runs}. Above the dashed line is slower than that day's own average, below it
        faster; the
        shaded band holds the middle half of runs. Quickest at {pct(fastest)} — {Math.round(
          (1 - shape.points[fastest].mid) * 100,
        )}% under that run's own average — and there is a consistent slow patch at {pct(slowest)}, where
        the median run drops {Math.round((shape.points[slowest].mid - 1) * 100)}% off its average.
      </p>
    </>
  )
}

const GAP_DAYS = 30

const isGap = (chron, i) => i > 0 && (chron[i].startMs - chron[i - 1].startMs) / 86400000 > GAP_DAYS

// A rolling average shouldn't reach back across a three-month layoff, so it
// restarts on the far side of one.
function blockedRolling(chron, values, size) {
  const out = new Array(values.length)
  let block = []
  let start = 0
  const flush = () => rolling(block, size).forEach((v, i) => { out[start + i] = v })
  chron.forEach((_, i) => {
    if (isGap(chron, i)) {
      flush()
      block = []
      start = i
    }
    block.push(values[i])
  })
  flush()
  return out
}

function ProgressSection({ chron, unit }) {
  const paces = chron.map((r) => toPace(r.avgPaceMinPerKm, unit))
  const trend = blockedRolling(chron, paces, 5)
  const maxKm = Math.max(...chron.map((r) => r.distanceKm))
  const dots = chron.map((run, i) => ({
    key: run.id,
    x: run.startMs,
    y: paces[i],
    r: 2.8 + 3.2 * (run.distanceKm / maxKm),
    href: `#/run/${run.id}`,
    title: `${runDay(run.startMs, run.tz)} — ${formatDistance(run.distanceKm, unit, 2)} ${
      UNITS[unit].distance
    } at ${formatPace(run.avgPaceMinPerKm, unit)}${UNITS[unit].pace}`,
  }))
  // A null between blocks lifts the pen rather than ruling a line across the
  // months with no running in them.
  const line = chron.flatMap((run, i) =>
    isGap(chron, i)
      ? [{ x: (run.startMs + chron[i - 1].startMs) / 2, y: null }, { x: run.startMs, y: trend[i] }]
      : [{ x: run.startMs, y: trend[i] }],
  )
  const first = median(paces.slice(0, 10))
  const last = median(paces.slice(-10))
  const span = [chron[0].startMs, chron[chron.length - 1].startMs]

  return (
    <>
      <XYChart
        dots={dots}
        line={line}
        invertY
        height={210}
        yFormat={formatMinutes}
        xTicks={monthTicks(span[0], span[1]).map((v) => ({ v, label: monthLabel(v) }))}
        aria="Average pace of every run over time, with a five-run rolling average"
      />
      <p className="board__caption">
        One dot per run, sized by distance; the line is a five-run rolling average. First ten runs
        averaged {formatMinutes(first)}
        {UNITS[unit].pace}, most recent ten {formatMinutes(last)}
        {UNITS[unit].pace} — {last < first ? `${paceDelta(first - last, unit)} quicker` : `${paceDelta(last - first, unit)} slower`}.
      </p>
    </>
  )
}

function VolumeSection({ chron, unit }) {
  const weeks = useMemo(() => weeklyVolume(chron), [chron])
  if (weeks.length < 2) return null
  const values = weeks.map((w) => toDistance(w.km, unit))
  const trend = rolling(values, 4)
  const best = Math.max(...values)
  const stride = Math.ceil(weeks.length / 7)
  const bars = weeks.map((w, i) => ({
    key: w.key,
    value: values[i],
    emphasis: values[i] === best,
    title: `Week of ${w.key}: ${values[i].toFixed(1)} ${UNITS[unit].distance} over ${w.runs} run${
      w.runs === 1 ? '' : 's'
    }`,
  }))
  const xTicks = weeks
    .map((w, i) => (i % stride === 0 ? { i, label: monthLabel(Date.parse(w.key)) } : null))
    .filter(Boolean)

  const active = weeks.filter((w) => w.runs > 0)
  const avg = active.reduce((s, w) => s + w.km, 0) / active.length

  return (
    <>
      <BarChart
        bars={bars}
        line={trend}
        height={190}
        xTicks={xTicks}
        yFormat={(v) => v.toFixed(0)}
        aria={`Distance per week in ${UNITS[unit].distance}, with a four-week rolling average`}
      />
      <p className="board__caption">
        Each bar is one week's total in {UNITS[unit].distance}, the line a four-week average. In a week with
        any running at all you cover {formatDistance(avg, unit, 1)} {UNITS[unit].distance}, and{' '}
        {weeks.length - active.length} of these {weeks.length} weeks were blank.
      </p>
    </>
  )
}

function SpectrumSection({ histogram, unit }) {
  const u = UNITS[unit]
  const bins = useMemo(
    () =>
      rebinPace(histogram, {
        from: unit === 'mi' ? 6 : 3.5,
        to: unit === 'mi' ? 18 : 11,
        width: 0.25,
        convert: (minPerKm) => toPace(minPerKm, unit),
      }),
    [histogram, unit],
  )
  if (!bins.length) return null

  const total = bins.reduce((s, b) => s + b.seconds, 0)
  const peak = bins.reduce((a, b) => (b.seconds > a.seconds ? b : a), bins[0])
  const stride = Math.ceil(bins.length / 8)
  // Bars carry hours, so the axis lands on round numbers instead of "2h 47m".
  const bars = bins.map((b) => ({
    key: b.from,
    value: b.seconds / 3600,
    emphasis: b === peak,
    title: `${formatMinutes(b.from)}–${formatMinutes(b.to)}${u.pace}: ${formatSpan(b.seconds)}`,
  }))
  const xTicks = bins
    .map((b, i) => (i % stride === 0 ? { i, label: formatMinutes(b.from) } : null))
    .filter(Boolean)

  return (
    <>
      <BarChart
        bars={bars}
        dense
        height={180}
        xTicks={xTicks}
        yFormat={(v) => `${v % 1 ? v.toFixed(1) : v}h`}
        aria={`Time spent at each pace, in minutes per ${u.distance}`}
      />
      <p className="board__caption">
        Every ten seconds of running you have recorded, filed by the pace you were holding at the time —{' '}
        {formatSpan(total)} in all. The tallest bar is {formatMinutes(peak.from)}–{formatMinutes(peak.to)}
        {u.pace}.
      </p>
    </>
  )
}

function PatternsSection({ runs, unit }) {
  const u = UNITS[unit]
  const days = useMemo(() => byWeekday(runs), [runs])
  const blocks = useMemo(() => byTimeOfDay(runs), [runs])
  const streaks = useMemo(() => consistency(runs), [runs])
  // byWeekday is Sunday-first; the chart reads better starting on Monday.
  const ordered = [...days.slice(1), days[0]]
  const withRuns = ordered.filter((d) => d.runs > 0)
  const quickestDay = withRuns.reduce((a, b) => (b.pace < a.pace ? b : a), withRuns[0])
  const busiestDay = ordered.reduce((a, b) => (b.runs > a.runs ? b : a), ordered[0])

  const temps = runs.filter((r) => r.tempC != null)
  const tempX = (c) => (unit === 'mi' ? c * 1.8 + 32 : c)
  const tempRange = temps.length ? [Math.min(...temps.map((r) => tempX(r.tempC))), Math.max(...temps.map((r) => tempX(r.tempC)))] : null

  return (
    <>
      <h3 className="asub">Which day</h3>
      <BarChart
        bars={ordered.map((d, i) => ({
          key: d.dow,
          value: d.runs,
          label: WEEKDAYS[i],
          emphasis: d === busiestDay,
          title: `${d.runs} run${d.runs === 1 ? '' : 's'}${d.pace ? ` · ${formatPace(d.pace, unit)}${u.pace} average` : ''}`,
        }))}
        height={150}
        yFormat={(v) => (Number.isInteger(v) ? v : '')}
        aria="Number of runs by day of the week"
      />
      <p className="board__caption">
        {busiestDay.runs} runs on a {WEEKDAYS_LONG[(busiestDay.dow + 6) % 7]}, more than any other day. Your
        quickest day on average is {WEEKDAYS_LONG[(quickestDay.dow + 6) % 7]} at{' '}
        {formatPace(quickestDay.pace, unit)}
        {u.pace}.
      </p>

      <h3 className="asub">What time</h3>
      <div className="grid-stats">
        {blocks.map((block) => (
          <div key={block.key} className="grid-stats__cell">
            <span className="grid-stats__label">{block.label}</span>
            <span className="grid-stats__value">{block.runs}</span>
            <span className="grid-stats__sub">
              {block.pace ? `${formatPace(block.pace, unit)}${u.pace}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {temps.length > 4 && (
        <>
          <h3 className="asub">How warm</h3>
          <XYChart
            dots={temps.map((run) => ({
              key: run.id,
              x: tempX(run.tempC),
              y: toPace(run.avgPaceMinPerKm, unit),
              href: `#/run/${run.id}`,
              title: `${runDay(run.startMs, run.tz)} — ${Math.round(tempX(run.tempC))}° at ${formatPace(
                run.avgPaceMinPerKm,
                unit,
              )}${u.pace}`,
            }))}
            invertY
            height={190}
            yFormat={formatMinutes}
            xTicks={niceTicks(tempRange[0], tempRange[1], 5).map((v) => ({
              v,
              label: `${Math.round(v)}°`,
            }))}
            aria="Average pace against temperature"
          />
          <p className="board__caption">
            Average pace against the temperature Nike recorded at the start, {unit === 'mi' ? '°F' : '°C'}.
          </p>
        </>
      )}

      {streaks && (
        <>
          <h3 className="asub">How often</h3>
          <div className="grid-stats">
            <div className="grid-stats__cell">
              <span className="grid-stats__label">Days run</span>
              <span className="grid-stats__value">{streaks.days}</span>
              <span className="grid-stats__sub">of {streaks.span}</span>
            </div>
            <div className="grid-stats__cell">
              <span className="grid-stats__label">Longest streak</span>
              <span className="grid-stats__value">{streaks.longestStreak}</span>
              <span className="grid-stats__sub">days in a row</span>
            </div>
            <div className="grid-stats__cell">
              <span className="grid-stats__label">Per week</span>
              <span className="grid-stats__value">{streaks.perWeek.toFixed(1)}</span>
              <span className="grid-stats__sub">runs</span>
            </div>
            <div className="grid-stats__cell">
              <span className="grid-stats__label">Typical gap</span>
              <span className="grid-stats__value">{(streaks.span / streaks.days).toFixed(1)}</span>
              <span className="grid-stats__sub">days between</span>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// The scope picker. Three months off and the running on either side of the gap
// isn't the same training, so the page opens on the current block and the whole
// history is one click away.
function ScopePicker({ blocks, value, onChange }) {
  if (blocks.length < 2) return null
  const latest = blocks[blocks.length - 1]
  return (
    <div className="chips" role="group" aria-label="Which runs to analyse">
      <button
        type="button"
        className={value === 'block' ? 'is-active' : ''}
        onClick={() => onChange('block')}
      >
        Since {monthShort(latest.from.startMs, latest.from.tz)} · {latest.runs.length} runs
      </button>
      <button type="button" className={value === 'all' ? 'is-active' : ''} onClick={() => onChange('all')}>
        Everything · {blocks.reduce((n, b) => n + b.runs.length, 0)} runs
      </button>
    </div>
  )
}

export default function Analysis({ unit, onUnitChange }) {
  const { data, error } = useRunIndex()
  const [scope, setScope] = useState('block')
  const all = data?.runs ?? []
  const allChron = useMemo(() => [...all].sort((a, b) => a.startMs - b.startMs), [all])
  const blocks = useMemo(() => trainingBlocks(allChron), [allChron])

  const chron = useMemo(() => {
    if (scope === 'all' || blocks.length < 2) return allChron
    return blocks[blocks.length - 1].runs
  }, [scope, blocks, allChron])
  const runs = chron
  const gap = blocks.length > 1 && scope === 'block' ? blocks[blocks.length - 2] : null

  const distances = useMemo(() => availableEfforts(runs, unit), [runs, unit])
  const sprints = useMemo(() => availableSprints(runs), [runs])
  const planned = useMemo(() => planRows(runs), [runs])
  const onPlan = planned.some((row) => row.actual.length)
  const spectrum = useMemo(
    () => (data?.paceHistogram ? mergeSpectra(runs, data.paceHistogram) : null),
    [runs, data],
  )

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <a className="back" href="#/">
            ‹ All runs
          </a>
          <h1>Analysis</h1>
        </div>
        <UnitToggle unit={unit} onChange={onUnitChange} />
      </header>

      {error && <p className="notice">Couldn’t load your runs: {error.message}</p>}
      {!data && !error && <p className="notice">Loading runs…</p>}

      {data && chron.length > 0 && (
        <>
          <ScopePicker blocks={blocks} value={scope} onChange={setScope} />

          <p className="page__sub asec__lede">
            {runs.length} runs, {monthKey(chron[0].startMs, chron[0].tz)} to{' '}
            {monthKey(chron[chron.length - 1].startMs, chron[chron.length - 1].tz)}
            {gap
              ? `, the block that started after ${Math.round(
                  (chron[0].startMs - gap.to.startMs) / 86400000,
                )} days off.`
              : '.'}{' '}
            Every “fastest” below is a contiguous stretch inside a single run, found by sliding a window
            across the whole thing, so the slow walk at either end never counts against it.
          </p>

          <nav className="jump" aria-label="Sections">
            {SECTIONS.filter(([id]) => id !== 'plan' || onPlan).map(([id, label]) => (
              <button key={id} type="button" onClick={() => jumpTo(id)}>
                {label}
              </button>
            ))}
          </nav>

          <Records runs={runs} unit={unit} />

          {onPlan && (
            <Section
              id="plan"
              title="The ladder"
              blurb="The twelve weeks of Hal Higdon’s Novice 1 half marathon plan, against what you actually ran. The race at the top is optional; the climb is the part that’s happening."
            >
              <PlanSection runs={runs} unit={unit} />
            </Section>
          )}

          <Section
            id="long"
            title="Going long"
            blurb="The Sunday run getting longer, what the extra distance costs in pace, and how each long run held together."
          >
            <LongSection chron={chron} unit={unit} planned={onPlan ? planned : null} />
          </Section>

          <Section
            id="walks"
            title="Walk breaks"
            blurb="Where the running stopped. Coming back, a 5K was a run with a dozen walks in it; the question is what happened to them."
          >
            <WalkSection chron={chron} unit={unit} />
          </Section>

          <Section
            id="efforts"
            title="Best efforts"
            blurb="The quickest you have ever covered each distance without stopping the clock — anywhere inside any run."
          >
            <EffortBoard
              runs={runs}
              unit={unit}
              efforts={distances}
              mode="distance"
              defaultKey={unit === 'mi' ? '1mi' : '1km'}
              caption="Each dot is the best that run could manage at this distance."
            />
          </Section>

          <Section
            id="sprints"
            title="Sprints"
            blurb="The other way round: the most ground covered in a fixed window of time, which is where the flat-out efforts show up."
          >
            <EffortBoard
              runs={runs}
              unit={unit}
              efforts={sprints}
              mode="duration"
              defaultKey="1min"
              caption="Each dot is the fastest window of this length in that run."
            />
          </Section>

          <Section
            id="core"
            title="The warm-up tax"
            blurb="What the run looks like with the stroll at the start and the stroll after the goal beeps cut away."
          >
            <CoreSection runs={runs} unit={unit} />
          </Section>

          <Section id="shape" title="The shape of a run">
            <ShapeSection runs={runs} />
          </Section>

          <Section id="progress" title="Progression">
            <ProgressSection chron={chron} unit={unit} />
          </Section>

          <Section id="volume" title="Volume">
            <VolumeSection chron={chron} unit={unit} />
          </Section>

          {spectrum && (
            <Section id="spectrum" title="Where the time goes">
              <SpectrumSection histogram={spectrum} unit={unit} />
            </Section>
          )}

          <Section id="patterns" title="Patterns">
            <PatternsSection runs={runs} unit={unit} />
          </Section>
        </>
      )}
    </div>
  )
}
