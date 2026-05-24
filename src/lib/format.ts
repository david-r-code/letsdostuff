// ── Distance ────────────────────────────────────────────────────
const KM_PER_MILE = 1.60934

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE
}

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE
}

export function formatDistance(km: number): string {
  const miles = kmToMiles(km)
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

// ── Time ─────────────────────────────────────────────────────────
export function formatDistanceToNow(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()

  if (diff < 0) return 'expired'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}m left`
  if (hours < 24) return `${hours}h left`
  return `${days}d left`
}

export function formatAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
