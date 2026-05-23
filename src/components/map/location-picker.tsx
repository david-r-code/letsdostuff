'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Input } from '@/components/ui/input'
import { MapPin } from 'lucide-react'

export interface PickedLocation {
  lat: number
  lng: number
  label: string
}

interface LocationPickerProps {
  value: PickedLocation | null
  onChange: (loc: PickedLocation) => void
  placeholder?: string
  height?: string
}

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Search for a location…',
  height = '280px',
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const [search, setSearch] = useState(value?.label ?? '')
  const [suggestions, setSuggestions] = useState<Array<{ place_name: string; center: [number, number] }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const initial = value ?? { lng: -118.4695, lat: 34.0195 }
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [initial.lng, initial.lat],
      zoom: value ? 13 : 10,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Click to place marker
    map.on('click', async (e) => {
      const { lng, lat } = e.lngLat
      placeMarker(map, lng, lat)
      const label = await reverseGeocode(lng, lat)
      setSearch(label)
      onChange({ lat, lng, label })
    })

    if (value) {
      placeMarker(map, value.lng, value.lat)
    }

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function placeMarker(map: mapboxgl.Map, lng: number, lat: number) {
    markerRef.current?.remove()
    markerRef.current = new mapboxgl.Marker({ color: '#3b82f6' })
      .setLngLat([lng, lat])
      .addTo(map)
    map.panTo([lng, lat], { duration: 400 })
  }

  // Geocode search
  const handleSearch = async (q: string) => {
    setSearch(q)
    if (q.length < 3) { setSuggestions([]); return }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || token.startsWith('your_')) return
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=5&access_token=${token}`
      )
      const data = await res.json()
      setSuggestions(data.features ?? [])
      setShowSuggestions(true)
    } catch { /* ignore */ }
  }

  const handleSelect = (suggestion: { place_name: string; center: [number, number] }) => {
    const [lng, lat] = suggestion.center
    const label = suggestion.place_name
    setSearch(label)
    setSuggestions([])
    setShowSuggestions(false)
    if (mapRef.current) placeMarker(mapRef.current, lng, lat)
    onChange({ lat, lng, label })
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={placeholder}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate"
                onClick={() => handleSelect(s)}
              >
                {s.place_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border"
        style={{ height }}
      />
      <p className="text-xs text-muted-foreground">
        Search for an address or click the map to place a pin
      </p>
    </div>
  )
}

async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || token.startsWith('your_')) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,place&limit=1&access_token=${token}`
    )
    const data = await res.json()
    return data.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}
