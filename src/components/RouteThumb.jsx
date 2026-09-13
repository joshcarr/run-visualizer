// The little route outline in the activity list. Pure SVG on pre-normalised
// points from the build step, so a list of 78 runs costs no map tiles.
export default function RouteThumb({ points, className = '' }) {
  if (!points || points.length < 2) return <div className={`thumb thumb--empty ${className}`} />

  const paths = []
  let current = []
  for (const [x, y, isBreak] of points) {
    if (isBreak && current.length) {
      paths.push(current)
      current = []
    }
    current.push(`${x},${y}`)
  }
  if (current.length) paths.push(current)

  return (
    <svg className={`thumb ${className}`} viewBox="-6 -6 112 112" aria-hidden="true">
      {paths.map((pts, i) => (
        <polyline key={i} points={pts.join(' ')} />
      ))}
    </svg>
  )
}
