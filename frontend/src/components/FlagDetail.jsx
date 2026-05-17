import { useState } from 'react'
import { buildReportUrl } from '../utils/reportUrl'

const BUCKET = import.meta.env.VITE_S3_BUCKET
const REGION = import.meta.env.VITE_AWS_REGION

const VERDICT_STYLE = {
  OBSCURED: { background: '#78350f', color: '#fbbf24', label: 'Obscured' },
  MISSING:  { background: '#7f1d1d', color: '#fca5a5', label: 'Missing' },
  UNCLEAR:  { background: '#1e3a5f', color: '#93c5fd', label: 'Unclear' },
}

function s3Url(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}

export default function FlagDetail({ flag, onClose }) {
  const captures = flag.captures || [flag]
  const [activeIdx, setActiveIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const active = captures[activeIdx]
  const reportUrl = buildReportUrl(flag)
  const style = VERDICT_STYLE[flag.verdict] || { background: '#1e3a5f', color: '#93c5fd', label: flag.verdict }

  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      background: '#1e293b',
      borderTop: '1px solid #334155',
      borderRadius: '16px 16px 0 0',
      padding: 16,
      zIndex: 1000,
      maxHeight: '60vh',
      overflowY: 'auto',
    }}>
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#475569' }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: style.background, color: style.color }}>
              {style.label}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
              {flag.sign_type || 'Sign'}
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: 12 }}>
            {parseFloat(flag.lat).toFixed(5)}, {parseFloat(flag.lng).toFixed(5)}
          </div>
        </div>
        <button onClick={onClose} style={{ background: '#334155', border: 'none', color: '#94a3b8', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>
          ×
        </button>
      </div>

      {/* Image gallery */}
      <div
        style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 8, background: '#0f172a', cursor: 'zoom-in' }}
        onClick={() => setLightbox(true)}
      >
        <img
          src={s3Url(active.s3_key)}
          alt={`Capture ${activeIdx + 1}`}
          style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <img
            src={s3Url(active.s3_key)}
            alt={`Capture ${activeIdx + 1}`}
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }}
          />
          {active.reason && (
            <div style={{ marginTop: 16, color: '#cbd5e1', fontSize: 14, lineHeight: 1.5, maxWidth: 420, textAlign: 'center' }}>
              {active.reason}
            </div>
          )}
          <div style={{ marginTop: 12, color: '#475569', fontSize: 12 }}>Tap anywhere to close</div>
        </div>
      )}

      {/* Thumbnail strip — only shown when multiple captures */}
      {captures.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
          {captures.map((c, i) => {
            const cs = VERDICT_STYLE[c.verdict] || VERDICT_STYLE.UNCLEAR
            return (
              <div
                key={i}
                onClick={() => setActiveIdx(i)}
                style={{
                  flexShrink: 0,
                  width: 60, height: 44,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: `2px solid ${i === activeIdx ? cs.color : 'transparent'}`,
                  cursor: 'pointer',
                  background: '#0f172a',
                  position: 'relative',
                }}
              >
                <img src={s3Url(c.s3_key)} alt={`Frame ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
              </div>
            )
          })}
        </div>
      )}

      {/* Active capture verdict */}
      {active.reason && (
        <div style={{ background: '#0f172a', borderRadius: 8, padding: '10px 12px', marginBottom: 14, color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
          <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Claude's assessment {captures.length > 1 ? `(frame ${activeIdx + 1} of ${captures.length})` : ''}
          </span>
          <div style={{ marginTop: 4 }}>{active.reason}</div>
        </div>
      )}

      {/* Report button */}
      <a
        href={reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', background: '#2563eb', color: '#fff', textAlign: 'center', padding: '12px 0', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 15 }}
      >
        Report to City →
      </a>
    </div>
  )
}
