import { useEffect, useCallback, useState } from 'react'
import useGPS from '../hooks/useGPS'
import useCamera from '../hooks/useCamera'
import useSignProximity from '../hooks/useSignProximity'
import { uploadFrame, getSessionId } from '../utils/uploadFrame'

export default function DriveMode({ onSwitchToReview }) {
  const { location, error: gpsError } = useGPS()
  const { videoRef, startCamera, stopCamera, captureFrame } = useCamera()
  const [captureCount, setCaptureCount] = useState(0)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  const handleSignNearby = useCallback(async (sign) => {
    const frame = captureFrame()
    if (!frame) return

    try {
      await uploadFrame(frame, sign, getSessionId())
      setCaptureCount(c => c + 1)

      const dot = document.getElementById('capture-dot')
      if (dot) {
        dot.style.background = '#22c55e'
        setTimeout(() => dot.style.background = '#3b82f6', 500)
      }
    } catch (err) {
      console.error('Upload failed:', err)
    }
  }, [captureFrame])

  useSignProximity({ location, onSignNearby: handleSignNearby })

  const gpsStatus = gpsError
    ? 'GPS unavailable'
    : location
      ? `GPS active — ${location.accuracy.toFixed(0)}m accuracy`
      : 'Waiting for GPS...'

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      background: '#000',
      overflow: 'hidden',
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '20px 16px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            id="capture-dot"
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: gpsError ? '#ef4444' : location ? '#3b82f6' : '#f59e0b',
              transition: 'background 0.3s',
            }}
          />
          <span style={{ color: '#fff', fontSize: 13 }}>
            {gpsStatus}
          </span>
        </div>

        <button
          onClick={onSwitchToReview}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Review →
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
      }}>
        {captureCount === 0
          ? 'Monitoring signs...'
          : `${captureCount} sign${captureCount === 1 ? '' : 's'} captured this drive`
        }
      </div>
    </div>
  )
}