export const KM_PER_MI = 1.609344
export const FT_PER_M = 3.280839895

export const UNITS = {
  mi: { distance: 'mi', pace: '/mi', elevation: 'ft', perDistance: 1 / KM_PER_MI },
  km: { distance: 'km', pace: '/km', elevation: 'm', perDistance: 1 },
}

export const toDistance = (km, unit) => (unit === 'mi' ? km / KM_PER_MI : km)
export const toElevation = (m, unit) => (unit === 'mi' ? m * FT_PER_M : m)
// stored pace is minutes per km
export const toPace = (minPerKm, unit) => (unit === 'mi' ? minPerKm * KM_PER_MI : minPerKm)

export function formatDistance(km, unit, digits = 2) {
  return toDistance(km, unit).toFixed(digits)
}

export function formatPace(minPerKm, unit) {
  if (minPerKm == null || !Number.isFinite(minPerKm)) return '--'
  const total = toPace(minPerKm, unit) * 60
  const minutes = Math.floor(total / 60)
  const seconds = Math.round(total - minutes * 60)
  const carry = seconds === 60
  return `${minutes + (carry ? 1 : 0)}:${String(carry ? 0 : seconds).padStart(2, '0')}`
}

// For values already expressed in minutes per display unit (e.g. split paces).
export function formatMinutes(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '--'
  const m = Math.floor(minutes)
  const sec = Math.round((minutes - m) * 60)
  const carry = sec === 60
  return `${m + (carry ? 1 : 0)}:${String(carry ? 0 : sec).padStart(2, '0')}`
}

export function formatDuration(seconds) {
  if (seconds == null) return '--'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatElevation(meters, unit) {
  return Math.round(toElevation(meters, unit)).toLocaleString()
}

export function formatTemp(celsius, unit) {
  if (celsius == null) return null
  return unit === 'mi'
    ? `${Math.round(celsius * 1.8 + 32)}°F`
    : `${Math.round(celsius)}°C`
}
