import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { paceColor, rampCss } from '../lib/paceColor.js'
import { formatMinutes, formatPace, UNITS } from '../lib/units.js'

const BINS = 18
const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'

// Consecutive points with a similar pace share one polyline, so a 500-point
// track draws as a few dozen paths instead of 500.
function buildSegments(track, range) {
  const { lat, lon, pace, breaks } = track
  const breakSet = new Set(breaks)
  const [fast, slow] = range ?? [0, 1]
  const span = slow > fast ? slow - fast : 1
  const bin = (i) => {
    const p = pace[i]
    if (p == null) return Math.floor(BINS / 2)
    return Math.max(0, Math.min(BINS - 1, Math.floor(((p - fast) / span) * BINS)))
  }

  const segments = []
  let current = null
  for (let i = 0; i < lat.length; i++) {
    const b = bin(i)
    const isBreak = breakSet.has(i)
    if (!current || isBreak || b !== current.bin) {
      if (current && !isBreak) current.points.push([lat[i], lon[i]])
      current = { bin: b, points: [] }
      if (!isBreak && i > 0) current.points.push([lat[i - 1], lon[i - 1]])
      current.points.push([lat[i], lon[i]])
      segments.push(current)
    } else {
      current.points.push([lat[i], lon[i]])
    }
  }
  return segments
    .filter((s) => s.points.length > 1)
    .map((s) => ({
      points: s.points,
      color: paceColor(fast + ((s.bin + 0.5) / BINS) * span, range),
    }))
}

export default function RouteMap({ run, unit, cursor, onCursorChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileRef = useRef(null)
  const routeRef = useRef(null)
  const markerRef = useRef(null)
  const cursorRef = useRef(null)

  const segments = useMemo(() => buildSegments(run.track, run.paceRange), [run])
  const markers = unit === 'mi' ? run.milesMarkers : run.kmMarkers
  const u = UNITS[unit]

  useEffect(() => {
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      tap: false,
    })
    mapRef.current = map

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTiles = () => {
      if (tileRef.current) tileRef.current.remove()
      tileRef.current = L.tileLayer(media.matches ? TILES.dark : TILES.light, {
        maxZoom: 19,
        attribution: ATTRIBUTION,
      }).addTo(map)
      tileRef.current.bringToBack()
    }
    applyTiles()
    media.addEventListener('change', applyTiles)

    return () => {
      media.removeEventListener('change', applyTiles)
      map.remove()
      mapRef.current = null
      tileRef.current = null
      routeRef.current = null
      markerRef.current = null
      cursorRef.current = null
    }
  }, [])

  // Route, mile markers and start/finish pins.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    const layer = L.layerGroup().addTo(map)
    routeRef.current = layer

    for (const seg of segments) {
      L.polyline(seg.points, {
        color: seg.color,
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layer)
    }

    const { lat, lon } = run.track
    // On a loop the start and finish land on the same spot, so nudge them apart.
    const endpoint = (i, kind, label, anchor) =>
      L.marker([lat[i], lon[i]], {
        icon: L.divIcon({
          className: '',
          html: `<span class="pin pin--${kind}">${label}</span>`,
          iconSize: [18, 18],
          iconAnchor: anchor,
        }),
        title: kind === 'start' ? 'Start' : 'Finish',
        keyboard: false,
        interactive: false,
      }).addTo(layer)
    endpoint(0, 'start', 'S', [18, 9])
    endpoint(lat.length - 1, 'finish', 'F', [0, 9])

    for (const m of markers) {
      L.marker([m.lat, m.lon], {
        icon: L.divIcon({
          className: '',
          html: `<span class="pin pin--mile">${m.n}</span>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        title: `${m.n} ${u.distance} — ${formatMinutes(m.splitPace)}${u.pace} split`,
      }).addTo(layer)
    }

    const cursorMarker = L.circleMarker([lat[0], lon[0]], {
      radius: 7,
      weight: 3,
      color: '#ffffff',
      fillColor: '#111111',
      fillOpacity: 1,
      interactive: false,
    }).addTo(layer)
    cursorRef.current = cursorMarker
    markerRef.current = cursorMarker

    map.fitBounds(L.latLngBounds(lat.map((v, i) => [v, lon[i]])), { padding: [28, 28] })

    return () => {
      layer.remove()
    }
  }, [run, segments, markers, unit, u.distance, u.pace])

  // Follow the chart scrubber.
  useEffect(() => {
    const marker = cursorRef.current
    if (!marker) return
    const { lat, lon } = run.track
    const i = Math.max(0, Math.min(lat.length - 1, cursor ?? 0))
    marker.setLatLng([lat[i], lon[i]])
    marker.setStyle({ opacity: cursor == null ? 0.55 : 1, fillOpacity: 1 })
  }, [cursor, run])

  const [fast, slow] = run.paceRange ?? [null, null]

  return (
    <figure className="map">
      <div
        className="map__canvas"
        ref={containerRef}
        onMouseLeave={() => onCursorChange?.(null)}
      />
      <figcaption className="map__legend">
        <span className="map__legend-label">Pace</span>
        <span className="map__legend-end">{formatPace(fast, unit)}</span>
        <span className="map__legend-ramp" style={{ background: rampCss() }} aria-hidden="true" />
        <span className="map__legend-end">{formatPace(slow, unit)}</span>
        <span className="map__legend-label">{u.pace}</span>
      </figcaption>
    </figure>
  )
}
