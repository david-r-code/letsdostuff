'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  MapPin, Users, Clock, Settings,
  CheckCircle2, XCircle, Loader2, ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow, formatAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Listing, ListingMember, ListingApplicant, Profile } from '@/types/database'

type FullListing = Listing & {
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
  const [signingUp, setSigningUp] = useState(false)

  useEffect(() => {
    loadListing()
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadListing() {
    setLoading(true)

    const { data: listingData, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()

    if (listingError || !listingData) {
      setLoading(false)
      return
    }

    const [{ data: creator }, { data: members }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', (listingData as any).creator_id)
        .single(),
      supabase
        .from('listing_members')
        .select('*, profile:profiles(id, display_name, avatar_url)')
        .eq('listing_id', id),
    ])

    const raw: FullListing = {
      ...(listingData as any),
      creator: creator ?? null,
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
      const { error } = await (supabase as any).rpc('apply_to_listing', {
        p_listing_id: id,
        p_pitch: pitch || null,
      })
      if (error) throw error
      toast.success('Application sent!')
      setApplyOpen(false)
      await loadListing()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  const handleSignUp = async () => {
    if (!user) { router.push('/auth/login'); return }
    setSigningUp(true)
    try {
      const { error } = await (supabase as any).rpc('sign_up_to_listing', { p_listing_id: id })
      if (error) throw error
      toast.success('You\'re in!')
      await loadListing()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to sign up')
    } finally {
      setSigningUp(false)
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
        <p className="text-muted-foreground">Post not found.</p>
        <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
          Back to discovery
        </Link>
      </div>
    )
  }

  const spotsLeft = listing.max_members ? listing.max_members - listing.member_count : null
  const isCreator = user?.id === listing.creator_id
  const responseMode = listing.response_mode ?? 'apply'

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
          {responseMode !== 'no_responses' && (
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {listing.member_count} member{listing.member_count !== 1 ? 's' : ''}
              {listing.max_members && ` / ${listing.max_members}`}
              {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 && (
                <span className="text-orange-500 font-medium ml-1">· {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
              )}
            </span>
          )}
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
          <h2 className="font-semibold">About</h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{listing.description}</p>
        </div>
      )}

      {/* Criteria */}
      {listing.criteria?.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Who we&apos;re looking for</h2>
          <ul className="space-y-1">
            {listing.criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                {c}
              </li>
            ))}
          </ul>
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
              <p className="text-sm font-medium">Posted by {(listing.creator as any)?.display_name ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">Created {formatAgo(listing.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members preview — only for sign_up / apply */}
      {responseMode !== 'no_responses' && listing.members?.length > 0 && (
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

      {/* ── CTA ── */}
      {user && !isCreator && !isMember && listing.status === 'open' && (
        <div className="sticky bottom-4">
          {/* Sign up mode */}
          {responseMode === 'sign_up' && (
            <Button className="w-full" size="lg" onClick={handleSignUp} disabled={signingUp}>
              {signingUp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing up…</> : 'Sign up'}
            </Button>
          )}

          {/* Apply mode */}
          {responseMode === 'apply' && (
            <>
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
            </>
          )}

          {/* no_responses — no CTA (DM button will go here later) */}
        </div>
      )}

      {isMember && !isCreator && responseMode !== 'no_responses' && (
        <div className="sticky bottom-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            You&apos;re a member of this group.
          </div>
        </div>
      )}

      {!user && listing.status === 'open' && responseMode !== 'no_responses' && (
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
              Introduce yourself to the organiser. A personal note goes a long way.
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
