'use client'

import { useEffect, useState, useCallback } from 'react'
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
  CheckCircle2, XCircle, Ban, MessageCircle, Loader2, Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatAgo } from '@/lib/format'
import type { ApplicantStatus } from '@/types/database'

type ApplicantRow = {
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

const STATUS_BADGE: Record<ApplicantStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Pending',      variant: 'secondary' },
  approved:  { label: 'Accepted',     variant: 'default' },
  rejected:  { label: 'Declined',     variant: 'outline' },
  blocked:   { label: 'Blocked',      variant: 'destructive' },
  withdrawn: { label: 'Withdrawn',    variant: 'outline' },
}

type Filter = 'pending' | 'all'

export default function InboxPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [items, setItems] = useState<ApplicantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('pending')
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // 1. Get the user's listing IDs
    const { data: myListings } = await supabase
      .from('listings')
      .select('id, title')
      .eq('creator_id', user.id)

    if (!myListings || myListings.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    const listingIds = myListings.map((l: any) => l.id)
    const titleById: Record<string, string> = {}
    myListings.forEach((l: any) => { titleById[l.id] = l.title })

    // 2. Get applications to those listings
    let query = supabase
      .from('listing_applicants')
      .select('id, profile_id, listing_id, status, pitch, applied_at')
      .in('listing_id', listingIds)
      .order('applied_at', { ascending: false })

    if (filter === 'pending') query = query.eq('status', 'pending')

    const { data: apps } = await query

    if (!apps || apps.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    // 3. Fetch applicant profiles
    const profileIds = [...new Set(apps.map((a: any) => a.profile_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', profileIds)

    const profileById: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => { profileById[p.id] = p })

    setItems(
      apps.map((a: any) => ({
        id: a.id,
        profile_id: a.profile_id,
        listing_id: a.listing_id,
        status: a.status as ApplicantStatus,
        pitch: a.pitch,
        applied_at: a.applied_at,
        listing_title: titleById[a.listing_id] ?? 'Unknown listing',
        applicant_name: profileById[a.profile_id]?.display_name ?? null,
        applicant_avatar: profileById[a.profile_id]?.avatar_url ?? null,
      }))
    )
    setLoading(false)
  }, [user, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    load()
  }, [load, user, router])

  // Real-time: refresh when a new application comes in
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'listing_applicants',
      }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, load]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (
    item: ApplicantRow,
    decision: 'approved' | 'rejected' | 'blocked',
  ) => {
    setActing(item.id)
    try {
      const { error } = await (supabase as any).rpc('review_applicant', {
        p_applicant_id: item.id,
        p_decision: decision,
      })
      if (error) throw error
      const labels = { approved: 'Accepted', rejected: 'Declined', blocked: 'Blocked' }
      toast.success(`${labels[decision]}`)
      await load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Something went wrong')
    } finally {
      setActing(null)
    }
  }

  const reply = async (item: ApplicantRow) => {
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

  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Inbox</h1>
          {pendingCount > 0 && filter === 'all' && (
            <Badge className="rounded-full px-2 py-0.5 text-xs">{pendingCount}</Badge>
          )}
        </div>
        <Select value={filter} onValueChange={v => setFilter(v as Filter)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending" className="text-xs">Pending</SelectItem>
            <SelectItem value="all" className="text-xs">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 space-y-2">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {filter === 'pending' ? 'No pending applications.' : 'No applications yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={item.id}>
              {i > 0 && <Separator className="my-1" />}
              <InboxItem
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
      )}
    </div>
  )
}

function InboxItem({
  item,
  acting,
  onAccept,
  onReject,
  onBlock,
  onReply,
}: {
  item: ApplicantRow
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
      {/* Top row: avatar + name + listing + time */}
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0 mt-0.5">
          <AvatarImage src={item.applicant_avatar ?? undefined} />
          <AvatarFallback>
            {(item.applicant_name?.[0] ?? '?').toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">
              {item.applicant_name ?? 'Someone'}
            </span>
            {!isPending && (
              <Badge variant={variant} className="text-xs px-1.5 py-0">
                {label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              · {formatAgo(item.applied_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Applied to <span className="font-medium text-foreground">{item.listing_title}</span>
          </p>
        </div>
      </div>

      {/* Pitch */}
      {item.pitch && (
        <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
          {item.pitch}
        </p>
      )}

      {/* Actions */}
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
