'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MapPin, Users, Clock, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
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
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [pitch, setPitch] = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [signingUp, setSigningUp] = useState(false)
  const [signedUp, setSignedUp] = useState(false)

  const spotsLeft = listing.max_members
    ? listing.max_members - listing.member_count
    : null

  const handleExpressInterest = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { router.push('/auth/login'); return }
    setDialogOpen(true)
  }

  const handleApply = async () => {
    setApplying(true)
    try {
      const { error } = await (supabase as any).rpc('apply_to_listing', {
        p_listing_id: listing.id,
        p_pitch: pitch || null,
      })
      if (error) throw error
      toast.success('Interest expressed!')
      setApplied(true)
      setDialogOpen(false)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  const handleSignUp = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { router.push('/auth/login'); return }
    setSigningUp(true)
    try {
      const { error } = await (supabase as any).rpc('sign_up_to_listing', { p_listing_id: listing.id })
      if (error) throw error
      toast.success('Signed up!')
      setSignedUp(true)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to sign up')
    } finally {
      setSigningUp(false)
    }
  }

  return (
    <>
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

            {/* CTA row — response_mode aware, hidden for own listings and broadcasts */}
            {user && listing.status === 'open' && listing.creator_id !== user.id && listing.response_mode !== 'no_responses' && (
              <div className="pt-1 flex justify-end" onClick={e => e.preventDefault()}>
                {listing.response_mode === 'sign_up' ? (
                  signedUp ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Signed up
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSignUp} disabled={signingUp}>
                      {signingUp ? 'Signing up…' : 'Sign up'}
                    </Button>
                  )
                ) : (
                  applied ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Interest expressed
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExpressInterest}>
                      Express interest
                    </Button>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Express interest</DialogTitle>
            <DialogDescription>
              Send a note to the organiser of <span className="font-medium">{listing.title}</span>.
              A personal message goes a long way.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>
                Your message{' '}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Textarea
                value={pitch}
                onChange={e => setPitch(e.target.value)}
                placeholder="e.g. Hey! I've been surfing for 3 years and I'm based 20 min from Malibu."
                rows={4}
              />
            </div>
            <Button className="w-full" onClick={handleApply} disabled={applying}>
              {applying
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                : 'Send'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
