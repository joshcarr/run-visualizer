import { useEffect, useState } from 'react'

const BASE = `${import.meta.env.BASE_URL}data`
const cache = new Map()

function useJson(url) {
  const [state, setState] = useState(() =>
    cache.has(url) ? { data: cache.get(url), error: null } : { data: null, error: null },
  )

  useEffect(() => {
    if (!url) return undefined
    if (cache.has(url)) {
      setState({ data: cache.get(url), error: null })
      return undefined
    }
    let live = true
    setState({ data: null, error: null })
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((data) => {
        cache.set(url, data)
        if (live) setState({ data, error: null })
      })
      .catch((error) => live && setState({ data: null, error }))
    return () => {
      live = false
    }
  }, [url])

  return state
}

export const useRunIndex = () => useJson(`${BASE}/index.json`)
export const useRun = (id) => useJson(id ? `${BASE}/runs/${id}.json` : null)
