import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import FlagDetail from './FlagDetail'
import { getSessionId } from '../utils/uploadFrame'

const API_URL = import.meta.env.VITE_API_URL

const SEATTLE_CENTER = [47.6062, -122.3321]

function createIcon(verdict) {
  const color = verdict === 'MISSING' ? '#ef4444' : '#f59e0b'
  return L.divIcon({
    html: `<div style="width:16px;height:16px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.6)"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function FitBounds({ flags }) {
  const map = useMap()
  useEffect(() => {
    if (flags.length === 0) return
    const bounds = flags.map(f => [parseFloat(f.lat), parseFloat(f.lng)])
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
  }, [flags, map])
  return null
}

export default function ReviewMap({ onBack, onNewDrive }) {
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const loadFlags = () => {
    const sessionId = getSessionId()
    fetch(`${API_URL}/flags?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        setFlags(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadFlags()
    const interval = setInterval(loadFlags, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a' }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: 20,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 16 }}>
          Drive Review
        </span>
        {!loading && (
          <span style={{
            color: flags.length === 0 ? '#64748b' : '#f59e0b',
            fontSize: 13,
          }}>
            {flags.length === 0
              ? 'No flags this session'
              : `${flags.length} sign${flags.length === 1 ? '' : 's'} flagged`}
          </span>
        )}
        <button
          onClick={onNewDrive}
          style={{
            marginLeft: 'auto',
            background: '#334155',
            border: 'none',
            color: '#94a3b8',
            padding: '6px 12px',
            borderRadius: 16,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          New Drive
        </button>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '8px 16px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
      }}>
        {[['#f59e0b', 'Obscured'], ['#ef4444', 'Missing']].map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
            Loading flags...
          </div>
        ) : (
          <MapContainer
            center={SEATTLE_CENTER}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            <FitBounds flags={flags} />
            {flags.map(flag => (
              <Marker
                key={`${flag.session_id}-${flag.timestamp}`}
                position={[parseFloat(flag.lat), parseFloat(flag.lng)]}
                icon={createIcon(flag.verdict)}
                eventHandlers={{ click: () => setSelected(flag) }}
              />
            ))}
          </MapContainer>
        )}
      </div>

      {/* Flag detail drawer */}
      {selected && (
        <FlagDetail
          flag={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
