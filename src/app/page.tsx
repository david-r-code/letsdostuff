'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { ListingCard } from '@/components/listings/listing-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, MapPin, LocateFixed, Loader2 } from 'lucide-react'
import type { DiscoveredListing } from '@/types/database'
import { milesToKm } from '@/lib/format'

const DEFAULT_CENTER: [number, number] = [-118.4695, 34.0195]
const RADIUS_OPTIONS = [5, 10, 25, 50, 100]

type Suggestion = { place_name: string; center: [number, number] }

export default function DiscoveryPage() {
  const { user, profileComplete } = useAuth()
  const supabase = createClient()

  const [listings, setListings] = useState<DiscoveredListing[]>([])
  const [loading, setLoading] = useState(true)
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [centerReady, setCenterReady] = useState(false)
  const [radiusMiles, setRadiusMiles] = useState(25)
  const [autoExpandedMiles, setAutoExpandedMiles] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [userTags, setUserTags] = useState<string[]>([])
  const [locating, setLocating] = useState(false)

  // Location search
  const [locationInput, setLocationInput] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load user's saved location + interest tags on sign-in
  useEffect(() => {
    if (!user) return
    const resolveCenter = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('location_lat, location_lng, location_label, interest_tags')
        .eq('id', user.id)
        .single()

      const profile = data as {
        location_lat: number | null
        location_lng: number | null
        location_label: string | null
        interest_tags: string[]
      } | null

      if (profile?.location_label) setLocationInput(profile.location_label)
      if (profile?.interest_tags?.length) setUserTags(profile.interest_tags)

      if (profile?.location_lat && profile?.location_lng) {
        setCenter([profile.location_lng, profile.location_lat])
      } else if (profile?.location_label) {
        // Old account without saved coordinates — geocode the label once
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(profile.location_label)}.json?limit=1&types=postcode,place,locality,neighborhood,address&access_token=${token}`
          )
          const geo = await res.json()
          const feature = geo.features?.[0]
          if (feature) {
            const [lng, lat] = feature.center as [number, number]
            setCenter([lng, lat])
            supabase.from('profiles').update({ location_lat: lat, location_lng: lng } as never).eq('id', user.id)
          }
        } catch { /* fall through */ }
      }
      setCenterReady(true)
    }
    resolveCenter()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Location text search with debounce
  const handleLocationInput = (q: string) => {
    setLocationInput(q)
    if (locationDebounce.current) clearTimeout(locationDebounce.current)
    if (q.length < 3) { setSuggestions([]); return }
    locationDebounce.current = setTimeout(async () => {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token || token.startsWith('your_')) return
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

  const handleSelectSuggestion = (s: Suggestion) => {
    const [lng, lat] = s.center
    setCenter([lng, lat])
    setCenterReady(true)
    setLocationInput(s.place_name)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const handleLocateMe = () => {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        setCenter([lng, lat])
        setCenterReady(true)
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality&limit=1&access_token=${token}`
          )
          const data = await res.json()
          setLocationInput(data.features?.[0]?.place_name ?? 'current location')
        } catch { setLocationInput('current location') }
        setLocating(false)
      },
      () => setLocating(false)
    )
  }

  const loadListings = useCallback(async () => {
    if (!centerReady) return
    setLoading(true)
    setAutoExpandedMiles(null)

    const fetchAtRadius = async (km: number): Promise<DiscoveredListing[]> => {
      const { data, error } = await (supabase as any).rpc('discover_listings', {
        p_lat: center[1],
        p_lng: center[0],
        p_radius_km: km,
        p_tags: userTags,
        p_limit: 50,
        p_offset: 0,
      })
      if (!error && data) return data as DiscoveredListing[]
      return []
    }

    let results = await fetchAtRadius(Math.round(milesToKm(radiusMiles)))
    if (results.length === 0) {
      for (const miles of [50, 100, 250, 500].filter(m => m > radiusMiles)) {
        results = await fetchAtRadius(Math.round(milesToKm(miles)))
        if (results.length > 0) { setAutoExpandedMiles(miles); break }
      }
    }

    setListings(results)
    setLoading(false)
  }, [center, radiusMiles, userTags, centerReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadListings() }, [loadListings])

  const filteredListings = searchQuery.trim()
    ? listings.filter(l =>
        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.interest_tags.some(t => t.includes(searchQuery.toLowerCase()))
      )
    : listings

  // ── Splash for signed-out users ───────────────────────────────
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-6 text-center px-6">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">letsdostuff</h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-sm mx-auto">
            Find people to do things with, right where you are.
          </p>
        </div>
        <div className="flex gap-3">
          <a href="/auth/signup" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
            Get started
          </a>
          <a href="/auth/login" className="inline-flex items-center justify-center rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
      {/* Filter bar */}
      <div className="space-y-2">
        {/* Keyword search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search posts…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Radius + location */}
        <div className="flex items-center gap-2">
          <Select value={radiusMiles.toString()} onValueChange={v => setRadiusMiles(Number(v))}>
            <SelectTrigger className="h-8 w-28 text-xs shrink-0">
              <SelectValue>{radiusMiles} mi</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map(r => (
                <SelectItem key={r} value={r.toString()} className="text-xs">{r} miles</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground shrink-0">of</span>

          <div className="relative flex-1">
            <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 h-8 text-xs"
              placeholder="your location…"
              value={locationInput}
              onChange={e => handleLocationInput(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors truncate"
                    onClick={() => handleSelectSuggestion(s)}
                  >
                    {s.place_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleLocateMe} disabled={locating} title="Use my location">
            <LocateFixed className={`h-3.5 w-3.5 ${locating ? 'animate-pulse' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Result count / expand notice */}
      {!loading && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filteredListings.length} post{filteredListings.length !== 1 ? 's' : ''}
            {autoExpandedMiles && (
              <span> — nothing within {radiusMiles} mi, showing up to <span className="font-medium text-foreground">{autoExpandedMiles} mi</span></span>
            )}
          </span>
          {locationInput && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{locationInput}</span>}
        </div>
      )}

      {/* Listings */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Finding stuff near you…
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-muted-foreground">Nothing found nearby.</p>
          <p className="text-sm">
            Be the first —{' '}
            <a href="/listings/new" className="text-primary hover:underline">create a post</a>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredListings.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  )
}
