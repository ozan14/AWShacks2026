import { useEffect, useRef, useCallback } from 'react'
import { loadSignIndex, getSignsNear } from '../utils/signIndex'

const PROXIMITY_RADIUS_METERS = 100
const CHECK_INTERVAL_MS = 3000       // check every 3 seconds
const CAPTURE_COOLDOWN_MS = 60000    // don't capture same sign twice within 60s

export default function useSignProximity({ location, onSignNearby }) {
  const indexLoaded = useRef(false)
  const recentCaptures = useRef({})  // sign id -> timestamp of last capture

  // Load the sign index once on mount
  useEffect(() => {
    loadSignIndex().then(() => {
      indexLoaded.current = true
      console.log('Sign index ready')
    }).catch(err => {
      console.error('Failed to load sign index:', err)
    })
  }, [])

  const checkProximity = useCallback(() => {
    if (!indexLoaded.current || !location) return

    const nearbySigns = getSignsNear(location.lat, location.lng, PROXIMITY_RADIUS_METERS)
    if (nearbySigns.length === 0) return

    const now = Date.now()

    for (const sign of nearbySigns) {
      const lastCapture = recentCaptures.current[sign.id]

      // Skip if we captured this sign recently
      if (lastCapture && now - lastCapture < CAPTURE_COOLDOWN_MS) continue

      // Mark as captured and trigger callback
      recentCaptures.current[sign.id] = now
      console.log(`Sign nearby: ${sign.sign_type} at ${sign.lat}, ${sign.lng}`)
      onSignNearby(sign)

      // Only trigger one sign per check to avoid overwhelming the camera
      break
    }
  }, [location, onSignNearby])

  // Run proximity check on an interval
  useEffect(() => {
    const interval = setInterval(checkProximity, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [checkProximity])
}