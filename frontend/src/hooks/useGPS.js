import { useState, useEffect } from 'react'

export default function useGPS() {
  const [location, setLocation] = useState(null)  // { lat, lng, accuracy }
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,  // meters
        })
        setError(null)
      },
      (err) => {
        setError(err.message)
      },
      {
        enableHighAccuracy: true,   // uses GPS chip, not just wifi
        maximumAge: 2000,           // accept cached position up to 2s old
        timeout: 10000,             // fail after 10s with no position
      }
    )

    // Cleanup: stop watching when component unmounts
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return { location, error }
}