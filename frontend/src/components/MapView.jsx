import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// A small map (OpenStreetMap) that works on a phone: drag to move, pinch to zoom.
//
// markers: [{ id, lat, lng, label, tone: 'brand' | 'warn' | 'danger' | 'muted', title }]
// circles: [{ lat, lng, radius, label }]            areas such as "allowed distance from the gate"
// line:    [[lat, lng], ...]                        a guard's recent path
// onPick:  ({ lat, lng }) => void                   when set, tapping the map picks a point (used to set a location)
// pick:    { lat, lng }                             the point that was picked
//
// Markers are drawn with HTML (not image files) so nothing breaks when the app is built.

const TONES = { brand: '#0f4c4a', warn: '#b45309', danger: '#be3434', muted: '#6b7b79' }

const pin = (label, tone) =>
  L.divIcon({
    className: 'nivora-pin',
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:${TONES[tone] || TONES.brand};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"><b style="transform:rotate(45deg);color:#fff;font:700 13px/1 system-ui,sans-serif">${label}</b></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32]
  })

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const MapView = ({ markers = [], circles = [], line, pick, onPick, height = 320, className = '', center, zoom = 16 }) => {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const fitted = useRef(false)

  // Create the map once.
  useEffect(() => {
    if (!box.current || map.current) return undefined
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, tap: true }).setView(center ? [center.lat, center.lng] : [20.5937, 78.9629], center ? zoom : 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', (e) => onPickRef.current?.({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) }))
    map.current = m
    // The box can be hidden or resized while the map is created (tabs, dialogs), so recalculate its size shortly after.
    const t = setTimeout(() => m.invalidateSize(), 250)
    return () => {
      clearTimeout(t)
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draw what was passed in.
  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    const points = []
    circles.forEach((c) => {
      if (c.lat == null || c.lng == null) return
      L.circle([c.lat, c.lng], { radius: c.radius || 100, color: '#0f4c4a', weight: 1.5, fillColor: '#0f4c4a', fillOpacity: 0.08 }).addTo(g)
      points.push([c.lat, c.lng])
    })
    if (line && line.length > 1) {
      L.polyline(line, { color: '#0f4c4a', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(g)
      line.forEach((p) => points.push(p))
    }
    markers.forEach((mk) => {
      if (mk.lat == null || mk.lng == null) return
      const label = esc((mk.label || '').toString().slice(0, 2).toUpperCase())
      const marker = L.marker([mk.lat, mk.lng], { icon: pin(label, mk.tone), title: mk.title || '' }).addTo(g)
      if (mk.title) marker.bindPopup(`<b>${esc(mk.title)}</b>${mk.detail ? `<br>${esc(mk.detail)}` : ''}`)
      points.push([mk.lat, mk.lng])
    })
    if (pick && pick.lat != null && pick.lng != null) {
      L.marker([pick.lat, pick.lng], { icon: pin('★', 'danger') }).addTo(g)
      points.push([pick.lat, pick.lng])
    }
    // Fit everything in view the first time; after that leave the zoom to the person (they may be looking closely at something).
    if (points.length && !fitted.current) {
      fitted.current = true
      if (points.length === 1) m.setView(points[0], zoom)
      else m.fitBounds(points, { padding: [36, 36], maxZoom: 18 })
    }
  }, [markers, circles, line, pick, zoom])

  // Move to a new picked point when it changes from outside (for example "use my location").
  useEffect(() => {
    if (map.current && pick && pick.lat != null && pick.lng != null) map.current.setView([pick.lat, pick.lng], Math.max(map.current.getZoom(), 16))
  }, [pick?.lat, pick?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className={`z-0 w-full overflow-hidden rounded-xl border border-edge ${className}`} style={{ height }} role="region" aria-label="Map" />
}

export default MapView
