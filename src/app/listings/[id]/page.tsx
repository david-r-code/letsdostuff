'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  MapPin, Users, Clock, Lock, Eye, Handshake,
  Settings, CheckCircle2, XCircle, Loader2, ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow, formatAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  Listing, ListingCriterion, ListingMember, ListingApplicant, Profile,
  CriterionEnforcement, CriterionType,
  GenderCriterionData, SkillCriterionData, GeoCriterionData, MinAgeCriterionData, CustomCriterionData,
} from '@/types/database'

type FullListing = Listing & {
  criteria: ListingCriterion[]
  members: Array<ListingMember & { profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> }>
  creator: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  member_count: number
}

type MyApplication = ListingApplicant | null

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [listing, setListing] = useState<FullListing | null>(null)
  const [myApplication, setMyApplication] = useState<MyApplication>(null)
  const [isMember, setIsMember] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [applyOpen, setApplyOpen] = useState(false)
  const [pitch, setPitch] = useState('')
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    loadListing()
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadListing() {
    setLoading(true)

    // 1. Fetch the listing itself — simple, no joins
    const { data: listingData, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()

    if (listingError || !listingData) {
      console.error('Listing fetch error:', listingError)
      setLoading(false)
      return
    }

    // 2. Fetch related data in parallel — failures don't cascade
    const [
      { data: creator },
      { data: criteria },
      { data: members },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', (listingData as any).creator_id)
        .single(),
      supabase
        .from('listing_criteria')
        .select('*')
        .eq('listing_id', id)
        .order('sort_order'),
      supabase
        .from('listing_members')
        .select('*, profile:profiles(id, display_name, avatar_url)')
        .eq('listing_id', id),
    ])

    const raw: FullListing = {
      ...(listingData as any),
      creator: creator ?? null,
      criteria: (criteria ?? []) as ListingCriterion[],
      members: (members ?? []) as any[],
      member_count: members?.length ?? 0,
    }
    setListing(raw)

    if (user) {
      const member = (members ?? []).find(
        (m: any) => m.profile_id === user.id || m.profile?.id === user.id
      )
      if (member) {
        setIsMember(true)
        setIsAdmin((member as any).role === 'admin')
      }

      const { data: app } = await supabase
        .from('listing_applicants')
        .select('*')
        .eq('listing_id', id)
        .eq('profile_id', user.id)
        .maybeSingle()
      setMyApplication(app as MyApplication)
    }

    setLoading(false)
  }

  const handleApply = async () => {
    if (!user) { router.push('/auth/login'); return }
    setApplying(true)
    try {
      await (supabase as any).rpc('apply_to_listing', {
        p_listing_id: id,
        p_pitch: pitch || null,
      })
      toast.success('Application sent!')
      setApplyOpen(false)
      await loadListing()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  const handleWithdraw = async () => {
    if (!myApplication) return
    await supabase
      .from('listing_applicants')
      .update({ status: 'withdrawn' } as never)
      .eq('id', myApplication.id)
    toast.success('Application withdrawn')
    await loadListing()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Listing not found.</p>
        <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
          Back to discovery
        </Link>
      </div>
    )
  }

  const spotsLeft = listing.max_members ? listing.max_members - listing.member_count : null
  const isCreator = user?.id === listing.creator_id

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Back */}
      <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to discovery
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-bold leading-tight">{listing.title}</h1>
            {listing.status !== 'open' && (
              <Badge variant="secondary" className="capitalize">{listing.status}</Badge>
            )}
          </div>
          {(isAdmin || isCreator) && (
            <div className="flex gap-2">
              <Link
                href={`/listings/${id}/edit`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
              >
                Edit
              </Link>
              <Link
                href={`/listings/${id}/manage`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
              >
                <Settings className="h-4 w-4" /> Manage
              </Link>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          {listing.location_label && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {listing.location_label}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {listing.member_count} member{listing.member_count !== 1 ? 's' : ''}
            {listing.max_members && ` / ${listing.max_members}`}
            {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 && (
              <span className="text-orange-500 font-medium ml-1">· {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
            )}
          </span>
          {listing.expires_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {formatDistanceToNow(listing.expires_at)}
            </span>
          )}
        </div>

        {/* Tags */}
        {listing.interest_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.interest_tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Description */}
      {listing.description && (
        <div className="space-y-1">
          <h2 className="font-semibold">About this group</h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{listing.description}</p>
        </div>
      )}

      {/* Criteria */}
      {listing.criteria?.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Who we&apos;re looking for</h2>
          <div className="space-y-2">
            {listing.criteria
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(c => (
                <CriterionRow key={c.id} criterion={c} />
              ))}
          </div>
        </div>
      )}

      {/* Organiser */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={(listing.creator as any)?.avatar_url} />
              <AvatarFallback>
                {(listing.creator as any)?.display_name?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">Organised by {(listing.creator as any)?.display_name ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">Created {formatAgo(listing.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members preview */}
      {listing.members?.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {listing.member_count} member{listing.member_count !== 1 ? 's' : ''}
          </h2>
          <div className="flex flex-wrap gap-2">
            {listing.members.slice(0, 12).map(m => {
              const p = (m as any).profile
              return (
                <div key={m.id} className="flex flex-col items-center gap-1">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={p?.avatar_url} />
                    <AvatarFallback>{p?.display_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                  </Avatar>
                  {(m as any).role === 'admin' && (
                    <span className="text-xs text-primary font-medium">Admin</span>
                  )}
                </div>
              )
            })}
            {listing.member_count > 12 && (
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                +{listing.member_count - 12}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      {user && !isCreator && !isMember && (
        <div className="sticky bottom-4">
          {!myApplication || myApplication.status === 'withdrawn' ? (
            <Button className="w-full" size="lg" onClick={() => setApplyOpen(true)}>
              Express interest
            </Button>
          ) : myApplication.status === 'pending' ? (
            <div className="bg-background border rounded-lg p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Your application is pending review</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleWithdraw}>Withdraw</Button>
            </div>
          ) : myApplication.status === 'approved' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              You&apos;ve been approved! Check your messages.
            </div>
          ) : myApplication.status === 'rejected' ? (
            <div className="bg-muted rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4" />
              Your application wasn&apos;t accepted for this group.
            </div>
          ) : null}
        </div>
      )}

      {!user && (
        <div className="sticky bottom-4">
          <Link href="/auth/signup" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
            Sign up to join
          </Link>
        </div>
      )}

      {/* Apply dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Express interest</DialogTitle>
            <DialogDescription>
              Introduce yourself to the group organiser. A personal note goes a long way.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>Your message <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                value={pitch}
                onChange={e => setPitch(e.target.value)}
                placeholder="e.g. Hey! I've been surfing for 3 years and I'm based 20 min from Malibu."
                rows={4}
              />
            </div>
            <Button className="w-full" onClick={handleApply} disabled={applying}>
              {applying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Send application'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CriterionRow({ criterion }: { criterion: ListingCriterion }) {
  const enforcementIcons: Record<CriterionEnforcement, React.ReactNode> = {
    auto: <Lock className="h-3.5 w-3.5 text-primary" />,
    display: <Eye className="h-3.5 w-3.5 text-muted-foreground" />,
    honor: <Handshake className="h-3.5 w-3.5 text-muted-foreground" />,
  }

  const summary = criterionSummary(criterion)

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{enforcementIcons[criterion.enforcement]}</span>
      <div>
        <span className="font-medium">{criterion.label}</span>
        {summary && <span className="text-muted-foreground ml-2">{summary}</span>}
      </div>
    </div>
  )
}

function criterionSummary(c: ListingCriterion): string {
  const d = c.data
  switch (c.criteria_type as CriterionType) {
    case 'gender': {
      const gd = d as GenderCriterionData
      return gd.value === 'any' ? '' : gd.value
    }
    case 'skill': {
      const sd = d as SkillCriterionData
      return sd.min_level === 'any' ? sd.name : `${sd.name} — ${sd.min_level}+`
    }
    case 'geo': {
      const gd = d as GeoCriterionData
      return `within ${gd.distance_value} ${gd.distance_unit} ${gd.travel_mode} from ${gd.location_label}`
    }
    case 'min_age': {
      const ad = d as MinAgeCriterionData
      return `${ad.min_age}+`
    }
    case 'custom': {
      const cd = d as CustomCriterionData
      return cd.text
    }
    default: return ''
  }
}
