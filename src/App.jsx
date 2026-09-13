import { useCallback, useEffect, useState } from 'react'
import RunList from './components/RunList.jsx'
import RunDetail from './components/RunDetail.jsx'
import Analysis from './components/Analysis.jsx'

function currentRoute() {
  const hash = window.location.hash
  // #/run/<id> optionally carries the best effort to highlight, as #/run/<id>/e/<key>
  const run = hash.match(/^#\/run\/([\w-]+)(?:\/e\/(\w+))?/)
  if (run) return { view: 'detail', id: run[1], effort: run[2] ?? null }
  if (/^#\/analysis/.test(hash)) return { view: 'analysis' }
  return { view: 'list' }
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

  if (route.view === 'detail') {
    return <RunDetail id={route.id} effortKey={route.effort} unit={unit} onUnitChange={setUnit} />
  }
  if (route.view === 'analysis') return <Analysis unit={unit} onUnitChange={setUnit} />
  return <RunList unit={unit} onUnitChange={setUnit} />
}
