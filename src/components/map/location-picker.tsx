'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reposition dropdown on scroll/resize so it stays anchored to the input
  useEffect(() => {
    if (!showSuggestions) return
    const update = () => {
      if (!inputWrapRef.current) return
      const r = inputWrapRef.current.getBoundingClientRect()
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [showSuggestions])

  const openDropdown = () => {
    if (!inputWrapRef.current || suggestions.length === 0) return
    const r = inputWrapRef.current.getBoundingClientRect()
    setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width })
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
    setShowSuggestions(true)
  }

  const scheduleClose = () => {
    hideTimeout.current = setTimeout(() => setShowSuggestions(false), 150)
  }

  const handleSearch = (q: string) => {
    setSearch(q)
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 3) { setSuggestions([]); setShowSuggestions(false); return }
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || token.startsWith('your_')) return
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=5&types=postcode,place,locality,neighborhood,address&access_token=${token}`
        )
        const data = await res.json()
        const features: Suggestion[] = data.features ?? []
        setSuggestions(features)
        if (features.length > 0) openDropdown()
      } catch { /* ignore */ }
    }, 300)
  }

  const handleSelect = (s: Suggestion) => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
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
        <div ref={inputWrapRef} className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder={placeholder}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            onFocus={openDropdown}
            onBlur={scheduleClose}
          />
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

      {/* Render dropdown via portal so it escapes any parent overflow:hidden */}
      {showSuggestions && dropdownPos && suggestions.length > 0 &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
            }}
            className="bg-background border rounded-lg shadow-lg overflow-hidden"
            onMouseDown={e => e.preventDefault()} // prevent input blur before click fires
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate"
                onClick={() => handleSelect(s)}
              >
                {s.place_name}
              </button>
            ))}
          </div>,
          document.body
        )
      }
    </div>
  )
}
