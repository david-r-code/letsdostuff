'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { ListingCard } from '@/components/listings/listing-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, MapPin, SlidersHorizontal, Loader2 } from 'lucide-react'
import type { MapListing } from '@/components/map/discovery-map'
import type { DiscoveredListing } from '@/types/database'
import { milesToKm } from '@/lib/format'

// Mapbox only renders client-side
const DiscoveryMap = dynamic(
  () => import('@/components/map/discovery-map').then((m) => m.DiscoveryMap),
  { ssr: false }
)

const DEFAULT_CENTER: [number, number] = [-118.4695, 34.0195] // Santa Monica
const RADIUS_OPTIONS = [5, 10, 25, 50, 100]

function radiusToZoom(miles: number): number {
  if (miles <= 5) return 12
  if (miles <= 10) return 11
  if (miles <= 25) return 10
  if (miles <= 50) return 9
  return 8
}

type Suggestion = { place_name: string; center: [number, number] }

export default function DiscoveryPage() {
  const { user, profileComplete } = useAuth()
  const supabase = createClient()

  const [listings, setListings] = useState<DiscoveredListing[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [centerLabel, setCenterLabel] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(25)
  const [searchQuery, setSearchQuery] = useState('')
  const [userTags, setUserTags] = useState<string[]>([])

  // Location search state
  const [locationInput, setLocationInput] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [centerReady, setCenterReady] = useState(false)

  // Show map only once we have the real center from the profile
  const showMap = !!user && profileComplete && centerReady

  // Load user's location + tags on login
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('location_lat, location_lng, location_label, travel_radius_km, interest_tags')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const profile = data as {
          location_lat: number | null
          location_lng: number | null
          location_label: string | null
          travel_radius_km: number | null
          interest_tags: string[]
        } | null
        if (profile?.location_lat && profile?.location_lng) {
          setCenter([profile.location_lng, profile.location_lat])
          setCenterReady(true)
        }
        if (profile?.location_label) {
          setCenterLabel(profile.location_label)
          setLocationInput(profile.location_label)
        }
        if (profile?.interest_tags?.length) {
          setUserTags(profile.interest_tags)
        }
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Geocode location input
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
    setCenterLabel(s.place_name)
    setLocationInput(s.place_name)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const loadListings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any).rpc('discover_listings', {
      p_lat: center[1],
      p_lng: center[0],
      p_radius_km: Math.round(milesToKm(radiusMiles)),
      p_tags: userTags,
      p_limit: 50,
      p_offset: 0,
    })

    if (!error && data) {
      setListings(data as DiscoveredListing[])
    }
    setLoading(false)
  }, [center, radiusMiles, userTags]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadListings()
  }, [loadListings])

  const filteredListings = searchQuery.trim()
    ? listings.filter(
        (l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.interest_tags.some((t) => t.includes(searchQuery.toLowerCase()))
      )
    : listings

  const mapListings: MapListing[] = filteredListings.map((l) => ({
    id: l.id,
    title: l.title,
    location_lat: l.location_lat,
    location_lng: l.location_lng,
    distance_km: l.distance_km,
    member_count: Number(l.member_count),
    interest_tags: l.interest_tags,
  }))

  const handleSelectListing = (id: string) => {
    setSelectedId(id)
    document.getElementById(`listing-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }

  // Splash screen for signed-out users
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-6 text-center px-4">
        <div className="space-y-2">
          <h1 className="text-5xl font-extrabold tracking-tight">letsdostuff</h1>
          <p className="text-muted-foreground text-lg">Find people to do things with, right where you are.</p>
        </div>
        <div className="flex gap-3">
          <a href="/auth/signup" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
            Get started
          </a>
          <a href="/auth/login" className="inline-flex items-center justify-center rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Log in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ── LEFT: listing feed ── */}
      <div className={`${showMap ? 'w-[420px] flex-shrink-0' : 'w-full'} flex flex-col border-r`}>
        {/* Search + filters */}
        <div className="p-4 border-b space-y-3">
          {/* Activity keyword search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search activities…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Radius + location row */}
          <div className="flex items-center gap-2">
            <Select
              value={radiusMiles.toString()}
              onValueChange={(v) => setRadiusMiles(Number(v))}
            >
              <SelectTrigger className="h-8 w-32 text-xs shrink-0">
                <SelectValue>{radiusMiles} miles</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r.toString()} className="text-xs">
                    {r} miles
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground shrink-0">of</span>

            {/* Location search */}
            <div className="relative flex-1">
              <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7 h-8 text-xs"
                placeholder="your location…"
                value={locationInput}
                onChange={(e) => handleLocationInput(e.target.value)}
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

            <Badge variant="outline" className="gap-1 cursor-pointer shrink-0">
              <SlidersHorizontal className="h-3 w-3" />
              Filters
            </Badge>
          </div>

          <div className="text-xs text-muted-foreground">
            {filteredListings.length} found
          </div>
        </div>

        {/* Listing cards */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Finding stuff near you…
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <p className="text-muted-foreground">Nothing found nearby.</p>
              <p className="text-sm text-muted-foreground">
                Be the first —{' '}
                <a href="/listings/new" className="text-primary hover:underline">
                  create a listing
                </a>
              </p>
            </div>
          ) : (
            filteredListings.map((listing) => (
              <div key={listing.id} id={`listing-${listing.id}`}>
                <ListingCard
                  listing={listing}
                  selected={listing.id === selectedId}
                  onClick={() => setSelectedId(listing.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: map ── */}
      {showMap && (
        <div className="flex-1 relative">
          <DiscoveryMap
            listings={mapListings}
            selectedId={selectedId}
            center={center}
            zoom={radiusToZoom(radiusMiles)}
            onSelectListing={handleSelectListing}
          />

          {/* Near me button */}
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 shadow-lg gap-2"
            onClick={() => {
              navigator.geolocation.getCurrentPosition(async (pos) => {
                const { longitude, latitude } = pos.coords
                setCenter([longitude, latitude])
                // reverse geocode for label
                try {
                  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
                  const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=place,locality&limit=1&access_token=${token}`
                  )
                  const data = await res.json()
                  const label = data.features?.[0]?.place_name ?? 'current location'
                  setCenterLabel(label)
                  setLocationInput(label)
                } catch {
                  setLocationInput('current location')
                }
                setCenterReady(true)
              })
            }}
          >
            <MapPin className="h-4 w-4" />
            Near me
          </Button>
        </div>
      )}
    </div>
  )
}
