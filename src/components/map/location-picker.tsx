'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, LocateFixed } from 'lucide-react'

export interface PickedLocation {
  lat: number
  lng: number
  label: string
}

interface LocationPickerProps {
  value: PickedLocation | null
  onChange: (loc: PickedLocation) => void
  placeholder?: string
  height?: string // kept for API compatibility, unused
}

type Suggestion = { place_name: string; center: [number, number] }

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Search by zip, city, or address…',
}: LocationPickerProps) {
  const [search, setSearch] = useState(value?.label ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [locating, setLocating] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = (q: string) => {
    setSearch(q)
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 3) { setSuggestions([]); return }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || token.startsWith('your_')) return
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=5&types=postcode,place,locality,neighborhood,address&access_token=${token}`
        )
        const data = await res.json()
        setSuggestions(data.features ?? [])
        setShowSuggestions(true)
      } catch { /* ignore */ }
    }, 300)
  }

  const handleSelect = (s: Suggestion) => {
    const [lng, lat] = s.center
    setSearch(s.place_name)
    setSuggestions([])
    setShowSuggestions(false)
    onChange({ lat, lng, label: s.place_name })
  }

  const handleLocateMe = () => {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,postcode,place&limit=1&access_token=${token}`
          )
          const data = await res.json()
          const label = data.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          setSearch(label)
          onChange({ lat, lng, label })
        } catch {
          const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          setSearch(label)
          onChange({ lat, lng, label })
        } finally {
          setLocating(false)
        }
      },
      () => setLocating(false)
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={placeholder}
            value={search}
            onChange={e => handleSearch(e.target.value)}
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
        <Button type="button" variant="outline" size="icon" onClick={handleLocateMe} disabled={locating} title="Use my location">
          <LocateFixed className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} />
        </Button>
      </div>
      {value && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {value.label}
        </p>
      )}
    </div>
  )
}
