// The ladders of "best effort" targets. Shared: the build step computes them
// per run, the analysis page ranks them across runs.

// Fastest time to cover a fixed distance. Which rungs show depends on the unit
// toggle — a runner thinking in miles doesn't want a 2 km PB in the list — but
// 400 m and 5K belong to everyone.
export const DISTANCE_EFFORTS = [
  { key: '400m', km: 0.4, label: '400 m', systems: ['mi', 'km'] },
  { key: '800m', km: 0.8, label: '800 m', systems: ['km'] },
  { key: 'halfMi', km: 0.804672, label: '½ mi', systems: ['mi'] },
  { key: '1km', km: 1, label: '1 km', systems: ['km'] },
  { key: '1mi', km: 1.609344, label: '1 mi', systems: ['mi'] },
  { key: '2km', km: 2, label: '2 km', systems: ['km'] },
  { key: '2mi', km: 3.218688, label: '2 mi', systems: ['mi'] },
  { key: '5km', km: 5, label: '5K', systems: ['mi', 'km'] },
  { key: '8km', km: 8, label: '8 km', systems: ['km'] },
  { key: '5mi', km: 8.04672, label: '5 mi', systems: ['mi'] },
  { key: '10km', km: 10, label: '10K', systems: ['mi', 'km'] },
  { key: 'half', km: 21.0975, label: 'Half', systems: ['mi', 'km'] },
]

// The other way round: the most ground covered in a fixed stretch of time.
// Short windows are the "how fast can I actually move" question.
export const DURATION_EFFORTS = [
  { key: '30s', sec: 30, label: '30 sec' },
  { key: '1min', sec: 60, label: '1 min' },
  { key: '2min', sec: 120, label: '2 min' },
  { key: '5min', sec: 300, label: '5 min' },
  { key: '10min', sec: 600, label: '10 min' },
  { key: '20min', sec: 1200, label: '20 min' },
]

// How much of a run the "core" covers: the fastest contiguous stretch that
// long, which is the run with the warm-up and the cool-down cut away.
export const CORE_FRACTION = 0.8

// Resolution of the per-run pace shape stored in the index.
export const PROFILE_BUCKETS = 20

// At 1 mi in miles (or 1 km in kilometres) the time and the pace are the same
// number, and printing it twice just looks like a mistake.
export const paceIsRedundant = (key, unit) =>
  (key === '1mi' && unit === 'mi') || (key === '1km' && unit === 'km')
