// The headline number blocks used across the analysis page. A tile with an
// href is a link into the run it came from.
export default function Tile({ label, value, unit, sub, href }) {
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className="tile__value">
        {value}
        {unit && <span className="unit"> {unit}</span>}
      </span>
      <span className="tile__sub">{sub}</span>
    </>
  )
  return href ? (
    <a className="tile" href={href}>
      {body}
    </a>
  ) : (
    <div className="tile">{body}</div>
  )
}
