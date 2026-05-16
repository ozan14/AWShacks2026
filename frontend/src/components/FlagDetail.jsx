import { buildReportUrl } from '../utils/reportUrl'

const BUCKET = import.meta.env.VITE_S3_BUCKET
const REGION = import.meta.env.VITE_AWS_REGION

const VERDICT_STYLE = {
  OBSCURED: { background: '#78350f', color: '#fbbf24', label: 'Obscured' },
  MISSING:  { background: '#7f1d1d', color: '#fca5a5', label: 'Missing' },
}

export default function FlagDetail({ flag, onClose }) {
  const imageUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${flag.s3_key}`
  const reportUrl = buildReportUrl(flag)
  const style = VERDICT_STYLE[flag.verdict] || { background: '#1e3a5f', color: '#93c5fd', label: flag.verdict }

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1e293b',
      borderTop: '1px solid #334155',
      borderRadius: '16px 16px 0 0',
      padding: 16,
      zIndex: 1000,
      maxHeight: '55vh',
      overflowY: 'auto',
    }}>
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#475569' }} />
      </div>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              background: style.background,
              color: style.color,
            }}>
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
        <button
          onClick={onClose}
          style={{
            background: '#334155',
            border: 'none',
            color: '#94a3b8',
            width: 28,
            height: 28,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Photo */}
      <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 12, background: '#0f172a' }}>
        <img
          src={imageUrl}
          alt="Captured frame"
          style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>

      {/* AI reason */}
      {flag.reason && (
        <div style={{
          background: '#0f172a',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 14,
          color: '#cbd5e1',
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Claude's assessment
          </span>
          <div style={{ marginTop: 4 }}>{flag.reason}</div>
        </div>
      )}

      {/* Report button */}
      <a
        href={reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          background: '#2563eb',
          color: '#fff',
          textAlign: 'center',
          padding: '12px 0',
          borderRadius: 10,
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Report to City →
      </a>
    </div>
  )
}
