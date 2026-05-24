'use client'

import { useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export interface MapListing {
  id: string
  title: string
  location_lat: number
  location_lng: number
  distance_km: number
  member_count: number
  interest_tags: string[]
}

interface DiscoveryMapProps {
  listings: MapListing[]
  selectedId: string | null
  center: [number, number]  // [lng, lat]
  onSelectListing: (id: string) => void
}

export function DiscoveryMap({ listings, selectedId, center, onSelectListing }: DiscoveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({})

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 11,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-center map when center prop changes
  useEffect(() => {
    mapRef.current?.flyTo({ center, zoom: 11, duration: 800 })
  }, [center])

  // Update markers when listings change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remove old markers
    Object.values(markersRef.current).forEach((m) => m.remove())
    markersRef.current = {}

    listings.forEach((listing) => {
      const el = document.createElement('div')
      el.className = 'listing-marker'
      el.style.cssText = `
        background: white;
        border: 2px solid #3b82f6;
        border-radius: 20px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        color: #1d4ed8;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        transition: all 0.15s;
      `
      el.textContent = listing.title.length > 20
        ? listing.title.slice(0, 20) + '…'
        : listing.title

      el.addEventListener('click', () => onSelectListing(listing.id))

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([listing.location_lng, listing.location_lat])
        .addTo(map)

      markersRef.current[listing.id] = marker
    })
  }, [listings, onSelectListing])

  // Highlight selected marker
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement()
      if (id === selectedId) {
        el.style.background = '#3b82f6'
        el.style.color = 'white'
        el.style.borderColor = '#1d4ed8'
        el.style.zIndex = '10'
        // Pan to selected
        mapRef.current?.panTo(marker.getLngLat(), { duration: 400 })
      } else {
        el.style.background = 'white'
        el.style.color = '#1d4ed8'
        el.style.borderColor = '#3b82f6'
        el.style.zIndex = '1'
      }
    })
  }, [selectedId])

  return <div ref={containerRef} className="w-full h-full" />
}
