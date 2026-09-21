// Hal Higdon's Novice 1 half marathon programme, and the arithmetic that lines
// your actual runs up against it.
//
// The plan is a twelve-week ladder: three or four runs a week, the Sunday one
// growing a mile at a time from four to ten, then a race at the top. Nothing
// here assumes you signed up for the race — the ladder is the useful part, and
// the last row is an option rather than a commitment.

const DAY_MS = 86400000

// The Monday that week 1 started. The runs since then line up with the plan
// day for day; if a week gets skipped and the alignment drifts, move this.
export const PLAN_START = '2026-08-24'

export const PLAN_NAME = 'Hal Higdon, Novice 1'
export const PLAN_SOURCE = 'https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/'

const rest = { label: 'Rest' }
const run = (mi) => ({ mi })
// The plan lets you swap these for cross-training, so they only add to the
// week's mileage if you actually run them.
const orCross = (mi) => ({ mi, orCross: true })
const cross = (min) => ({ crossMin: min })
const easy = { label: 'Rest or easy run' }
const race = (mi, label) => ({ mi, race: true, label })

// Monday first, to match the table the plan is printed in.
export const PLAN_WEEKS = [
  [rest, run(3), orCross(2), run(3), rest, cross(30), run(4)],
  [rest, run(3), orCross(2), run(3), rest, cross(30), run(4)],
  [rest, run(3.5), orCross(2), run(3.5), rest, cross(40), run(5)],
  [rest, run(3.5), orCross(2), run(3.5), rest, cross(40), run(5)],
  [rest, run(4), orCross(2), run(4), rest, cross(40), run(6)],
  [rest, run(4), orCross(2), run(4), easy, rest, race(3.1, '5-K Race')],
  [rest, run(4.5), orCross(3), run(4.5), rest, cross(50), run(7)],
  [rest, run(4.5), orCross(3), run(4.5), rest, cross(50), run(8)],
  [rest, run(5), orCross(3), run(5), easy, rest, race(6.2, '10-K Race')],
  [rest, run(5), orCross(3), run(5), rest, cross(60), run(9)],
  [rest, run(5), orCross(3), run(5), rest, cross(60), run(10)],
  [rest, run(4), orCross(3), run(2), rest, rest, race(13.1, 'Half Marathon')],
]

export const MI_KM = 1.609344

// How a day reads in the unit on screen. The plan is printed in miles; a
// reader in kilometres gets the same session converted rather than a second
// set of round numbers that don't match the source.
export function dayLabel(day, unit, format) {
  if (day.label) return day.label
  if (day.crossMin) return `${day.crossMin} min cross`
  if (day.mi == null) return 'Rest'
  const d = format(day.mi * MI_KM)
  return day.orCross ? `${d} run or cross` : `${d} run`
}

const dayMs = (date) => Date.parse(`${date}T00:00:00Z`)
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10)

// Today where the reader is, as a plain date, so "this week" means the week
// they are actually in.
export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// Which plan week a date falls in, 0-based; negative before the plan started.
export const weekIndexFor = (date, start = PLAN_START) =>
  Math.floor((dayMs(date) - dayMs(start)) / (7 * DAY_MS))

// The plan against what actually happened, one row per week. `state` is 'done'
// for weeks in the past, 'now' for the week the reader is in, 'ahead' for the
// rest.
export function planRows(runs, { start = PLAN_START, today = todayISO() } = {}) {
  const current = weekIndexFor(today, start)
  const byWeek = new Map()
  for (const run of runs) {
    if (!run.date) continue
    const i = weekIndexFor(run.date, start)
    if (i < 0 || i >= PLAN_WEEKS.length) continue
    const dow = (new Date(`${run.date}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
    const week = byWeek.get(i) ?? { runs: [], byDay: Array.from({ length: 7 }, () => []) }
    week.runs.push(run)
    week.byDay[dow].push(run)
    byWeek.set(i, week)
  }

  return PLAN_WEEKS.map((days, i) => {
    const actual = byWeek.get(i) ?? { runs: [], byDay: Array.from({ length: 7 }, () => []) }
    const mondayMs = dayMs(start) + i * 7 * DAY_MS
    const planMi = days.reduce((s, d) => s + (d.mi ?? 0), 0)
    // Sunday is the week's headline session all the way up the ladder: the long
    // run, or the race that stands in for it.
    const headline = days[6]
    const actualMi = actual.runs.reduce((s, r) => s + r.distanceKm / MI_KM, 0)
    const longest = actual.runs.reduce((best, r) => (!best || r.distanceKm > best.distanceKm ? r : best), null)
    return {
      n: i + 1,
      days,
      monday: mondayMs,
      sunday: mondayMs + 6 * DAY_MS,
      from: isoDay(mondayMs),
      to: isoDay(mondayMs + 6 * DAY_MS),
      planMi,
      headline,
      headlineMi: headline.mi ?? 0,
      // Days the plan asks you to run, counting the swappable one.
      planRuns: days.filter((d) => d.mi != null).length,
      actual: actual.runs,
      byDay: actual.byDay,
      actualMi,
      longest,
      longestMi: longest ? longest.distanceKm / MI_KM : 0,
      state: i < current ? 'done' : i === current ? 'now' : 'ahead',
    }
  })
}

// Where the ladder has got to: the last week with any running in it, what it
// asked for next, and how the weeks you have done compare with the plan.
export function planProgress(rows) {
  const ran = rows.filter((r) => r.actual.length)
  if (!ran.length) return null
  const last = ran[ran.length - 1]
  const done = rows.slice(0, last.n)
  const next = rows[last.n] ?? null
  // The longest run the plan builds up to, race day aside.
  const buildUp = rows.filter((r) => !r.days.some((d) => d.race))
  const peak = buildUp.reduce((a, b) => (b.headlineMi > a.headlineMi ? b : a), buildUp[0])
  return {
    weeks: rows.length,
    last,
    next,
    peak,
    finish: rows[rows.length - 1],
    planMi: done.reduce((s, r) => s + r.planMi, 0),
    actualMi: done.reduce((s, r) => s + r.actualMi, 0),
    planRuns: done.reduce((s, r) => s + r.planRuns, 0),
    actualRuns: done.reduce((s, r) => s + r.actual.length, 0),
    // How often the week's long run came in at or above what was asked.
    longsHit: done.filter((r) => r.longestMi >= r.headlineMi - 0.05).length,
    longsDue: done.length,
  }
}
