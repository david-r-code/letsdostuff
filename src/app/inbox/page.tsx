'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle2, XCircle, Ban, MessageCircle, Loader2, Inbox, Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ApplicantStatus } from '@/types/database'

// ── Types ────────────────────────────────────────────────────────────────────

type ReceivedRow = {
  id: string
  profile_id: string
  listing_id: string
  status: ApplicantStatus
  pitch: string | null
  applied_at: string
  listing_title: string
  applicant_name: string | null
  applicant_avatar: string | null
}

type SentRow = {
  id: string
  listing_id: string
  status: ApplicantStatus
  pitch: string | null
  applied_at: string
  listing_title: string
}

// ── Badges ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ApplicantStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Pending',   variant: 'secondary' },
  approved:  { label: 'Accepted',  variant: 'default' },
  rejected:  { label: 'Declined',  variant: 'outline' },
  blocked:   { label: 'Blocked',   variant: 'destructive' },
  withdrawn: { label: 'Withdrawn', variant: 'outline' },
}

type ReceivedFilter = 'pending' | 'all'
type Tab = 'received' | 'sent'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('received')

  // Received state
  const [received, setReceived] = useState<ReceivedRow[]>([])
  const [receivedLoading, setReceivedLoading] = useState(true)
  const [filter, setFilter] = useState<ReceivedFilter>('pending')
  const [acting, setActing] = useState<string | null>(null)

  // Sent state
  const [sent, setSent] = useState<SentRow[]>([])
  const [sentLoading, setSentLoading] = useState(true)

  // ── Load received ───────────────────────────────────────────────────────────

  const loadReceived = useCallback(async () => {
    if (!user) return
    setReceivedLoading(true)

    const { data: myListings } = await supabase
      .from('listings').select('id, title').eq('creator_id', user.id)

    if (!myListings || myListings.length === 0) {
      setReceived([]); setReceivedLoading(false); return
    }

    const listingIds = myListings.map((l: any) => l.id)
    const titleById: Record<string, string> = {}
    myListings.forEach((l: any) => { titleById[l.id] = l.title })

    let query = supabase
      .from('listing_applicants')
      .select('id, profile_id, listing_id, status, pitch, applied_at')
      .in('listing_id', listingIds)
      .order('applied_at', { ascending: false })

    if (filter === 'pending') query = query.eq('status', 'pending')

    const { data: apps } = await query
    if (!apps || apps.length === 0) {
      setReceived([]); setReceivedLoading(false); return
    }

    const profileIds = [...new Set(apps.map((a: any) => a.profile_id))]
    const { data: profiles } = await supabase
      .from('profiles').select('id, display_name, avatar_url').in('id', profileIds)

    const profileById: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => { profileById[p.id] = p })

    setReceived(apps.map((a: any) => ({
      id: a.id,
      profile_id: a.profile_id,
      listing_id: a.listing_id,
      status: a.status as ApplicantStatus,
      pitch: a.pitch,
      applied_at: a.applied_at,
      listing_title: titleById[a.listing_id] ?? 'Unknown listing',
      applicant_name: profileById[a.profile_id]?.display_name ?? null,
      applicant_avatar: profileById[a.profile_id]?.avatar_url ?? null,
    })))
    setReceivedLoading(false)
  }, [user, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load sent ──────────────────────────────────────────────────────────────

  const loadSent = useCallback(async () => {
    if (!user) return
    setSentLoading(true)

    const { data: apps } = await supabase
      .from('listing_applicants')
      .select('id, listing_id, status, pitch, applied_at')
      .eq('profile_id', user.id)
      .order('applied_at', { ascending: false })

    if (!apps || apps.length === 0) {
      setSent([]); setSentLoading(false); return
    }

    const listingIds = [...new Set(apps.map((a: any) => a.listing_id))]
    const { data: listings } = await supabase
      .from('listings').select('id, title').in('id', listingIds)

    const titleById: Record<string, string> = {}
    ;(listings ?? []).forEach((l: any) => { titleById[l.id] = l.title })

    setSent(apps.map((a: any) => ({
      id: a.id,
      listing_id: a.listing_id,
      status: a.status as ApplicantStatus,
      pitch: a.pitch,
      applied_at: a.applied_at,
      listing_title: titleById[a.listing_id] ?? 'Unknown listing',
    })))
    setSentLoading(false)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    loadReceived()
    loadSent()
  }, [loadReceived, loadSent, user, router])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listing_applicants' },
        () => { loadReceived(); loadSent() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, loadReceived, loadSent]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────

  const act = async (item: ReceivedRow, decision: 'approved' | 'rejected' | 'blocked') => {
    setActing(item.id)
    try {
      const { error } = await (supabase as any).rpc('review_applicant', {
        p_applicant_id: item.id, p_decision: decision,
      })
      if (error) throw error
      toast.success({ approved: 'Accepted', rejected: 'Declined', blocked: 'Blocked' }[decision])
      await loadReceived()
    } catch (e: any) {
      toast.error(e?.message ?? 'Something went wrong')
    } finally {
      setActing(null) }
  }

  const reply = async (item: ReceivedRow) => {
    setActing(item.id)
    try {
      const { data: convId, error } = await (supabase as any).rpc(
        'get_or_create_applicant_conversation',
        { p_listing_id: item.listing_id, p_admin_id: item.profile_id }
      )
      if (error) throw error
      router.push(`/chat/${convId}`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not open conversation')
      setActing(null)
    }
  }

  const withdraw = async (item: SentRow) => {
    setActing(item.id)
    try {
      const { error } = await supabase
        .from('listing_applicants')
        .update({ status: 'withdrawn' })
        .eq('id', item.id)
        .eq('profile_id', user!.id)
      if (error) throw error
      toast.success('Application withdrawn')
      await loadSent()
    } catch (e: any) {
      toast.error(e?.message ?? 'Something went wrong')
    } finally {
      setActing(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const pendingCount = received.filter(i => i.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setTab('received')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === 'received'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Inbox className="h-3.5 w-3.5" />
            Received
            {pendingCount > 0 && (
              <span className="ml-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('sent')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === 'sent'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Send className="h-3.5 w-3.5" />
            Sent
          </button>
        </div>

        {tab === 'received' && (
          <Select value={filter} onValueChange={v => setFilter(v as ReceivedFilter)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending" className="text-xs">Pending</SelectItem>
              <SelectItem value="all" className="text-xs">All</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Received ── */}
      {tab === 'received' && (
        receivedLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : received.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {filter === 'pending' ? 'No pending applications.' : 'No applications yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {received.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <Separator className="my-1" />}
                <ReceivedItem
                  item={item}
                  acting={acting === item.id}
                  onAccept={() => act(item, 'approved')}
                  onReject={() => act(item, 'rejected')}
                  onBlock={() => act(item, 'blocked')}
                  onReply={() => reply(item)}
                />
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Sent ── */}
      {tab === 'sent' && (
        sentLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sent.length === 0 ? (
          <div className="text-center py-20 space-y-2">
            <Send className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">You haven't expressed interest in anything yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sent.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <Separator className="my-1" />}
                <SentItem
                  item={item}
                  acting={acting === item.id}
                  onWithdraw={() => withdraw(item)}
                />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ── Received item ─────────────────────────────────────────────────────────────

function ReceivedItem({
  item, acting, onAccept, onReject, onBlock, onReply,
}: {
  item: ReceivedRow
  acting: boolean
  onAccept: () => void
  onReject: () => void
  onBlock: () => void
  onReply: () => void
}) {
  const isPending = item.status === 'pending'
  const { label, variant } = STATUS_BADGE[item.status]

  return (
    <div className={`py-4 px-1 space-y-3 rounded-lg ${acting ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-start gap-3">
        <Link href={`/profile/${item.profile_id}`} className="shrink-0 mt-0.5">
          <Avatar className="h-9 w-9">
            <AvatarImage src={item.applicant_avatar ?? undefined} />
            <AvatarFallback>{(item.applicant_name?.[0] ?? '?').toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/profile/${item.profile_id}`} className="font-medium text-sm hover:underline">
              {item.applicant_name ?? 'Someone'}
            </Link>
            {!isPending && (
              <Badge variant={variant} className="text-xs px-1.5 py-0">{label}</Badge>
            )}
            <span className="text-xs text-muted-foreground">· {formatAgo(item.applied_at)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Applied to <span className="font-medium text-foreground">{item.listing_title}</span>
          </p>
        </div>
      </div>

      {item.pitch && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
          {item.pitch}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {acting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center" />}
        {isPending && (
          <>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={onAccept} disabled={acting}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Accept
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onReject} disabled={acting}>
              <XCircle className="h-3.5 w-3.5" /> Decline
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={onBlock} disabled={acting}>
              <Ban className="h-3.5 w-3.5" /> Block
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onReply} disabled={acting}>
          <MessageCircle className="h-3.5 w-3.5" /> Reply
        </Button>
      </div>
    </div>
  )
}

// ── Sent item ────────────────────────────────────────────────────────────────

function SentItem({ item, acting, onWithdraw }: {
  item: SentRow
  acting: boolean
  onWithdraw: () => void
}) {
  const { label, variant } = STATUS_BADGE[item.status]
  const isPending = item.status === 'pending'

  return (
    <div className={`py-4 px-1 space-y-3 rounded-lg ${acting ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/listings/${item.listing_id}`} className="font-medium text-sm hover:underline">
              {item.listing_title}
            </Link>
            <Badge variant={variant} className="text-xs px-1.5 py-0">{label}</Badge>
            <span className="text-xs text-muted-foreground">· {formatAgo(item.applied_at)}</span>
          </div>
        </div>
        {isPending && (
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs shrink-0"
            onClick={onWithdraw} disabled={acting}
          >
            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Withdraw'}
          </Button>
        )}
      </div>

      {item.pitch && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
          {item.pitch}
        </p>
      )}
    </div>
  )
}
