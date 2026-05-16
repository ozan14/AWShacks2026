const CHARS = '0123456789bcdefghjkmnpqrstuvwxyz'

export function encode(lat, lng, precision = 7) {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180
  let hash = '', bits = 0, ch = 0, isLng = true

  while (hash.length < precision) {
    if (isLng) {
      const mid = (minLng + maxLng) / 2
      if (lng >= mid) { ch = (ch << 1) | 1; minLng = mid }
      else             { ch <<= 1;           maxLng = mid }
    } else {
      const mid = (minLat + maxLat) / 2
      if (lat >= mid) { ch = (ch << 1) | 1; minLat = mid }
      else            { ch <<= 1;           maxLat = mid }
    }
    isLng = !isLng
    if (++bits === 5) { hash += CHARS[ch]; bits = 0; ch = 0 }
  }
  return hash
}

function decode(hash) {
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180, isLng = true

  for (const c of hash) {
    let val = CHARS.indexOf(c)
    for (let i = 4; i >= 0; i--) {
      const bit = (val >> i) & 1
      if (isLng) {
        const mid = (minLng + maxLng) / 2
        if (bit) minLng = mid; else maxLng = mid
      } else {
        const mid = (minLat + maxLat) / 2
        if (bit) minLat = mid; else maxLat = mid
      }
      isLng = !isLng
    }
  }
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    dlat: maxLat - minLat,
    dlng: maxLng - minLng,
  }
}

export function getSearchCells(lat, lng, precision = 7) {
  const center = encode(lat, lng, precision)
  const { dlat, dlng } = decode(center)
  const offsets = [
    [ 1,  0], [-1,  0], [ 0,  1], [ 0, -1],
    [ 1,  1], [ 1, -1], [-1,  1], [-1, -1],
  ]
  const cells = new Set([center])
  for (const [dy, dx] of offsets) {
    cells.add(encode(lat + dy * dlat, lng + dx * dlng, precision))
  }
  return [...cells]
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
