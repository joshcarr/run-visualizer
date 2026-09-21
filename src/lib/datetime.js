const DAY_MS = 86400000

function parts(ms, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const out = {}
  for (const p of fmt.formatToParts(ms)) out[p.type] = p.value
  return out
}

// Calendar days between two instants as they fall in the run's own timezone,
// so "yesterday" means yesterday where the run happened.
function daysAgo(ms, tz, now) {
  const key = (t) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(t)
  const a = Date.parse(`${key(ms)}T00:00:00Z`)
  const b = Date.parse(`${key(now)}T00:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

export function runDay(ms, tz, now = Date.now()) {
  const p = parts(ms, tz)
  const ago = daysAgo(ms, tz, now)
  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  if (ago < 7) return p.weekday
  const sameYear = p.year === parts(now, tz).year
  return sameYear ? `${p.weekday}, ${p.month} ${p.day}` : `${p.month} ${p.day}, ${p.year}`
}

export function runTime(ms, tz) {
  const p = parts(ms, tz)
  return `${p.hour}:${p.minute} ${p.dayPeriod ?? ''}`.trim()
}

export function runFullDate(ms, tz) {
  const p = parts(ms, tz)
  return `${p.weekday}, ${p.month} ${p.day}, ${p.year}`
}

// "Feb 2026" — for chips and captions where the full month name is too long.
export function monthShort(ms, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', year: 'numeric' }).format(ms)
}

export function monthKey(ms, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long', year: 'numeric' }).format(ms)
}
