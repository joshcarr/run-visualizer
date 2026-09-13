export default function UnitToggle({ unit, onChange }) {
  return (
    <div className="unit-toggle" role="group" aria-label="Distance units">
      {['mi', 'km'].map((value) => (
        <button
          key={value}
          type="button"
          className={unit === value ? 'is-active' : ''}
          aria-pressed={unit === value}
          onClick={() => onChange(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
