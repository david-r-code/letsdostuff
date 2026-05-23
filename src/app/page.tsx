'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { ListingCard } from '@/components/listings/listing-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, MapPin, SlidersHorizontal, Loader2 } from 'lucide-react'
import type { MapListing } from '@/components/map/discovery-map'
import type { DiscoveredListing } from '@/types/database'

// Mapbox only renders client-side
const DiscoveryMap = dynamic(
  () => import('@/components/map/discovery-map').then((m) => m.DiscoveryMap),
  { ssr: false }
)

const DEFAULT_CENTER: [number, number] = [-118.4695, 34.0195] // Santa Monica

export default function DiscoveryPage() {
  const { user } = useAuth()
  const supabase = createClient()

  const [listings, setListings] = useState<DiscoveredListing[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [radiusKm, setRadiusKm] = useState(25)
  const [searchQuery, setSearchQuery] = useState('')
  const [userTags, setUserTags] = useState<string[]>([])

  // Load user's location + tags for personalized ranking
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('location_lat, location_lng, travel_radius_km, interest_tags')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const profile = data as {
          location_lat: number | null
          location_lng: number | null
          travel_radius_km: number | null
          interest_tags: string[]
        } | null
        if (profile?.location_lat && profile?.location_lng) {
          setCenter([profile.location_lng, profile.location_lat])
          setRadiusKm(profile.travel_radius_km ?? 25)
        }
        if (profile?.interest_tags?.length) {
          setUserTags(profile.interest_tags)
        }
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadListings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any).rpc('discover_listings', {
      p_lat: center[1],
      p_lng: center[0],
      p_radius_km: radiusKm,
      p_tags: userTags,
      p_limit: 50,
      p_offset: 0,
    })

    if (!error && data) {
      setListings(data as DiscoveredListing[])
    }
    setLoading(false)
  }, [center, radiusKm, userTags]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Scroll card into view
    document.getElementById(`listing-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ── LEFT: listing feed ── */}
      <div className="w-[420px] flex-shrink-0 flex flex-col border-r">
        {/* Search + filters */}
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search activities…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 cursor-pointer">
              <MapPin className="h-3 w-3" />
              {radiusKm}km radius
            </Badge>
            <Badge variant="outline" className="gap-1 cursor-pointer">
              <SlidersHorizontal className="h-3 w-3" />
              Filters
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredListings.length} found
            </span>
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
      <div className="flex-1 relative">
        <DiscoveryMap
          listings={mapListings}
          selectedId={selectedId}
          center={center}
          onSelectListing={handleSelectListing}
        />

        {/* Detect my location button */}
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 shadow-lg gap-2"
          onClick={() => {
            navigator.geolocation.getCurrentPosition((pos) => {
              setCenter([pos.coords.longitude, pos.coords.latitude])
            })
          }}
        >
          <MapPin className="h-4 w-4" />
          Near me
        </Button>
      </div>
    </div>
  )
}
