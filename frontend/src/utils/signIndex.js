import { encode, getSearchCells, distanceMeters } from './geohash'

const S3_URL = `https://${import.meta.env.VITE_S3_BUCKET}.s3.${import.meta.env.VITE_AWS_REGION}.amazonaws.com/signs-latest.json`
const CACHE_KEY = 'signwatch_signs_v1'
const CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

let index = null  // geohash -> [signs], built once in memory

export async function loadSignIndex() {
  if (index) return index  // already loaded this session

  const signs = await fetchSigns()
  index = buildIndex(signs)
  console.log(`Sign index built: ${signs.length} signs`)
  return index
}

async function fetchSigns() {
  // Check IndexedDB cache first
  const cached = await readCache()
  if (cached) {
    console.log('Loaded signs from cache')
    return cached
  }

  // Download from S3
  console.log('Downloading signs from S3...')
  const resp = await fetch(S3_URL)
  if (!resp.ok) throw new Error(`Failed to fetch signs: ${resp.status}`)
  const signs = await resp.json()

  // Save to cache
  await writeCache(signs)
  return signs
}

function buildIndex(signs) {
  const idx = {}
  for (const sign of signs) {
    const hash = encode(sign.lat, sign.lng)
    if (!idx[hash]) idx[hash] = []
    idx[hash].push(sign)
  }
  return idx
}


export function getSignsNear(lat, lng, radiusMeters = 100) {
  if (!index) return []
  const cells = getSearchCells(lat, lng)
  return cells
    .flatMap(cell => index[cell] || [])
    .filter(sign => distanceMeters(lat, lng, sign.lat, sign.lng) <= radiusMeters)
}

// --- IndexedDB cache helpers ---

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('signwatch', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('cache')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readCache() {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('cache', 'readonly')
      const req = tx.objectStore('cache').get(CACHE_KEY)
      req.onsuccess = () => {
        const result = req.result
        if (!result) return resolve(null)
        const age = Date.now() - result.timestamp
        if (age > CACHE_AGE_MS) return resolve(null)  // expired
        resolve(result.signs)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function writeCache(signs) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('cache', 'readwrite')
      tx.objectStore('cache').put({ signs, timestamp: Date.now() }, CACHE_KEY)
      tx.oncomplete = resolve
    })
  } catch {
    // Cache write failing is non-fatal
  }
}