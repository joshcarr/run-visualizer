import { useCallback, useEffect, useState } from 'react'
import RunList from './components/RunList.jsx'
import RunDetail from './components/RunDetail.jsx'

function currentRoute() {
  const match = window.location.hash.match(/^#\/run\/([\w-]+)/)
  return match ? { view: 'detail', id: match[1] } : { view: 'list' }
}

function useStored(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  })
  const update = useCallback(
    (next) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        /* private browsing; the choice just won't stick */
      }
    },
    [key],
  )
  return [value, update]
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)
  const [unit, setUnit] = useStored('units', 'mi')

  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.view, route.id])

  return route.view === 'detail' ? (
    <RunDetail id={route.id} unit={unit} onUnitChange={setUnit} />
  ) : (
    <RunList unit={unit} onUnitChange={setUnit} />
  )
}
