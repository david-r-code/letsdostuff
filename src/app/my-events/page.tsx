'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MapPin, Users, Clock, Settings, Loader2, Plus } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Listing, ApplicantStatus, MemberRole } from '@/types/database'

type MembershipRow = {
  id: string
  role: MemberRole
  joined_at: string
  listing: Listing
}

type ApplicationRow = {
  id: string
  status: ApplicantStatus
  applied_at: string
  listing: Listing
}

const STATUS_LABEL: Record<ApplicantStatus, string> = {
  pending:   'Pending review',
  approved:  'Approved',
  rejected:  'Not accepted',
  withdrawn: 'Withdrawn',
}

const STATUS_VARIANT: Record<ApplicantStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:   'secondary',
  approved:  'default',
  rejected:  'destructive',
  withdrawn: 'outline',
}

export default function MyEventsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    load()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const [{ data: mem }, { data: apps }] = await Promise.all([
      supabase
        .from('listing_members')
        .select('id, role, joined_at, listing:listings(*)')
        .eq('profile_id', user!.id)
        .order('joined_at', { ascending: false }),
      supabase
        .from('listing_applicants')
        .select('id, status, applied_at, listing:listings(*)')
        .eq('profile_id', user!.id)
        .neq('status', 'withdrawn')
        .order('applied_at', { ascending: false }),
    ])

    // Filter out applications for listings where user is already a member
    // (approved applicants show up in both tables)
    const memberListingIds = new Set((mem ?? []).map((m: any) => m.listing?.id))
    const filteredApps = (apps ?? []).filter(
      (a: any) => !memberListingIds.has(a.listing?.id) || a.status !== 'approved'
    )

    setMemberships((mem ?? []) as unknown as MembershipRow[])
    setApplications(filteredApps as unknown as ApplicationRow[])
    setLoading(false)
  }

  const organizing = memberships.filter(m => m.role === 'admin')
  const joined     = memberships.filter(m => m.role === 'member')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const empty = organizing.length === 0 && joined.length === 0 && applications.length === 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Events</h1>
        <Link href="/listings/new" className={cn(buttonVariants({ size: 'sm' }))}>
          <Plus className="h-4 w-4 mr-1" /> Create
        </Link>
      </div>

      {empty && (
        <div className="text-center py-20 space-y-3">
          <p className="text-muted-foreground">Nothing here yet.</p>
          <p className="text-sm text-muted-foreground">
            <Link href="/" className="text-primary hover:underline">Browse the feed</Link>
            {' '}to find things to join, or{' '}
            <Link href="/listings/new" className="text-primary hover:underline">create your own</Link>.
          </p>
        </div>
      )}

      {/* ── Organizing ── */}
      {organizing.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Organizing ({organizing.length})
          </h2>
          {organizing.map(m => (
            <EventCard key={m.id} listing={m.listing} joinedAt={m.joined_at}>
              <Link
                href={`/listings/${m.listing.id}/manage`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              >
                <Settings className="h-3.5 w-3.5" /> Manage
              </Link>
            </EventCard>
          ))}
        </section>
      )}

      {organizing.length > 0 && (joined.length > 0 || applications.length > 0) && <Separator />}

      {/* ── Joined ── */}
      {joined.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Joined ({joined.length})
          </h2>
          {joined.map(m => (
            <EventCard key={m.id} listing={m.listing} joinedAt={m.joined_at} />
          ))}
        </section>
      )}

      {joined.length > 0 && applications.length > 0 && <Separator />}

      {/* ── Applied / Interested ── */}
      {applications.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Interested in ({applications.length})
          </h2>
          {applications.map(a => (
            <EventCard key={a.id} listing={a.listing} joinedAt={a.applied_at}>
              <Badge variant={STATUS_VARIANT[a.status]} className="text-xs">
                {STATUS_LABEL[a.status]}
              </Badge>
            </EventCard>
          ))}
        </section>
      )}
    </div>
  )
}

function EventCard({
  listing,
  joinedAt,
  children,
}: {
  listing: Listing
  joinedAt: string
  children?: React.ReactNode
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/listings/${listing.id}`}
            className="font-semibold leading-snug hover:underline flex-1"
          >
            {listing.title}
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {listing.status !== 'open' && (
              <Badge variant="secondary" className="capitalize text-xs">{listing.status}</Badge>
            )}
            {children}
          </div>
        </div>

        {listing.description && (
          <p className="text-sm text-muted-foreground line-clamp-1">{listing.description}</p>
        )}

        {listing.interest_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.interest_tags.slice(0, 4).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag.replace(/_/g, ' ')}
              </Badge>
            ))}
            {listing.interest_tags.length > 4 && (
              <span className="text-xs text-muted-foreground">+{listing.interest_tags.length - 4}</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {listing.location_label && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {listing.location_label}
            </span>
          )}
          {listing.expires_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDistanceToNow(listing.expires_at)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
