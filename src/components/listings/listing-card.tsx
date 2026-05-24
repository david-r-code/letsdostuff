import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Users, Clock } from 'lucide-react'
import { formatDistanceToNow, formatDistance } from '@/lib/format'
import type { DiscoveredListing } from '@/types/database'

// Re-export for convenience
export type { DiscoveredListing as ListingCardData }

interface ListingCardProps {
  listing: DiscoveredListing
  selected?: boolean
  onClick?: () => void
}

export function ListingCard({ listing, selected, onClick }: ListingCardProps) {
  const spotsLeft = listing.max_members
    ? listing.max_members - listing.member_count
    : null

  return (
    <Link href={`/listings/${listing.id}`} onClick={onClick}>
      <Card
        className={`cursor-pointer transition-all hover:shadow-md ${
          selected ? 'ring-2 ring-primary shadow-md' : ''
        }`}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug">{listing.title}</h3>
            {listing.status !== 'open' && (
              <Badge variant="secondary" className="shrink-0 capitalize">
                {listing.status}
              </Badge>
            )}
          </div>

          {listing.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {listing.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {listing.interest_tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag.replace(/_/g, ' ')}
              </Badge>
            ))}
            {listing.interest_tags.length > 4 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                +{listing.interest_tags.length - 4}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {formatDistance(listing.distance_km)}
              {listing.location_label && ` · ${listing.location_label}`}
            </span>

            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {listing.member_count}
              {listing.max_members && ` / ${listing.max_members}`}
              {spotsLeft !== null && spotsLeft <= 3 && spotsLeft > 0 && (
                <span className="text-orange-500 font-medium ml-1">
                  {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
                </span>
              )}
            </span>

            {listing.expires_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(listing.expires_at)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
