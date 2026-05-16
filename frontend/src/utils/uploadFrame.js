const BUCKET = import.meta.env.VITE_S3_BUCKET
const REGION = import.meta.env.VITE_AWS_REGION

export async function uploadFrame(frameDataUrl, sign, sessionId) {
  // Convert base64 data URL to a Blob
  const base64 = frameDataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'image/jpeg' })

  // Build a unique S3 key using session + timestamp
  const timestamp = Date.now()
  const key = `frames/${sessionId}/${timestamp}.jpg`

  // Embed sign metadata as S3 object metadata
  // Lambda will read these when processing the upload
  const headers = {
    'Content-Type': 'image/jpeg',
    'x-amz-meta-sign-id': sign.id,
    'x-amz-meta-sign-type': sign.sign_type,
    'x-amz-meta-category': sign.category,
    'x-amz-meta-description': sign.description,
    'x-amz-meta-lat': String(sign.lat),
    'x-amz-meta-lng': String(sign.lng),
    'x-amz-meta-session-id': sessionId,
    'x-amz-meta-timestamp': String(timestamp),
  }

  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`

  const resp = await fetch(url, {
    method: 'PUT',
    headers,
    body: blob,
  })

  if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`)

  console.log(`Frame uploaded: ${key}`)
  return { key, timestamp }
}

// Generate a random session ID and persist it for the drive
// Resets if the user closes and reopens the app
export function getSessionId() {
  let id = localStorage.getItem('signwatch_session_id')
  if (!id) {
    id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem('signwatch_session_id', id)
  }
  return id
}