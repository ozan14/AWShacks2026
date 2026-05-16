import { useState } from 'react'
import DriveMode from './components/DriveMode'
import ReviewMap from './components/ReviewMap'

export default function App() {
  const [screen, setScreen] = useState('drive')

  return (
    <>
      {screen === 'drive' && (
        <DriveMode onSwitchToReview={() => setScreen('review')} />
      )}
      {screen === 'review' && (
        <ReviewMap
          onBack={() => setScreen('drive')}
          onNewDrive={() => {
            localStorage.removeItem('signwatch_session_id')
            setScreen('drive')
          }}
        />
      )}
    </>
  )
}