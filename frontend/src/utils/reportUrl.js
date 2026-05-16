const BASE = 'https://apps.seattle.gov/CustomerService/serviceRequestForm/'

export function buildReportUrl({ sign_type, lat, lng, verdict, reason, description }) {
  const params = new URLSearchParams({
    serviceType: 'ROAD_SIGN',
    signType: sign_type || '',
    latitude: parseFloat(lat).toFixed(6),
    longitude: parseFloat(lng).toFixed(6),
    issue: verdict || '',
    notes: reason || description || '',
  })
  return `${BASE}?${params}`
}
