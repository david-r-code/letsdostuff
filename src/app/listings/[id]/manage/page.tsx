'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle2, XCircle, MessageCircle, Users, ArrowLeft,
  Loader2, Clock, Shield, UserMinus,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Profile, ListingApplicant, ListingMember } from '@/types/database'
import { RealtimeChat } from '@/components/chat/realtime-chat'

type ApplicantWithProfile = ListingApplicant & {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'bio' | 'interest_tags' | 'gender' | 'birth_year'>
  conversation_id?: string
}

type MemberWithProfile = ListingMember & {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
}

type ListingInfo = {
  id: string
  title: string
  creator_id: string
  max_members: number | null
  group_conversation_id: string | null
}

export default function ManagePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [listing, setListing] = useState<ListingInfo | null>(null)
  const [applicants, setApplicants] = useState<ApplicantWithProfile[]>([])
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeChat, setActiveChat] = useState<{ conversationId: string; name: string } | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return

    const [listingRes, membersRes, applicantsRes] = await Promise.all([
      supabase.from('listings').select('id, title, creator_id, max_members').eq('id', id).single(),
      supabase.from('listing_members').select('*, profile:profiles(id, display_name, avatar_url)').eq('listing_id', id),
      supabase.from('listing_applicants').select('*, profile:profiles(id, display_name, avatar_url, bio, interest_tags, gender, birth_year)').eq('listing_id', id).order('applied_at', { ascending: false }),
    ])

    if (!listingRes.data) { router.push('/'); return }

    const listingData = listingRes.data as unknown as ListingInfo
    setListing(listingData)
    setMembers((membersRes.data ?? []) as unknown as MemberWithProfile[])

    const myMember = (membersRes.data ?? []).find(m => (m as any).profile_id === user.id || (m as any).profile?.id === user.id)
    if (!myMember || (myMember as any).role !== 'admin') {
      toast.error('Admin access required')
      router.push(`/listings/${id}`)
      return
    }
    setIsAdmin(true)

    // Load group conversation ID
    const { data: groupConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', id)
      .eq('type', 'group')
      .maybeSingle()

    if (groupConv) listingData.group_conversation_id = (groupConv as any).id

    // For each pending applicant, check if there's already a 1:1 conversation
    const apps = (applicantsRes.data ?? []) as unknown as ApplicantWithProfile[]
    if (apps.length > 0) {
      const convRes = await Promise.all(
        apps.map(async (a) => {
          const { data: conv } = await supabase
            .from('conversations')
            .select('id, conversation_participants!inner(profile_id)')
            .eq('listing_id', id)
            .eq('type', '1on1')
            .eq('conversation_participants.profile_id', a.profile_id)
            .maybeSingle()
          return { applicantId: a.id, conversationId: (conv as any)?.id ?? null }
        })
      )
      const convMap = Object.fromEntries(convRes.map(r => [r.applicantId, r.conversationId]))
      apps.forEach(a => { a.conversation_id = convMap[a.id] ?? undefined })
    }

    setApplicants(apps)
    setLoading(false)
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData() }, [loadData])

  // Realtime: refresh applicants list when new application comes in
  useEffect(() => {
    const channel = supabase
      .channel(`manage-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'listing_applicants',
        filter: `listing_id=eq.${id}`,
      }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReview = async (applicantId: string, decision: 'approved' | 'rejected') => {
    setReviewingId(applicantId)
    try {
      await (supabase as any).rpc('review_applicant', {
        p_applicant_id: applicantId,
        p_decision: decision,
      })
      toast.success(decision === 'approved' ? 'Applicant approved and added to group' : 'Applicant declined')
      await loadData()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to review applicant')
    } finally {
      setReviewingId(null)
    }
  }

  const openChat = async (applicant: ApplicantWithProfile) => {
    let convId = applicant.conversation_id
    if (!convId) {
      // Create 1:1 conversation
      const { data } = await (supabase as any).rpc('get_or_create_applicant_conversation', {
        p_listing_id: id,
        p_admin_id: user!.id,
      })
      convId = data
      await loadData()
    }
    if (convId) {
      setActiveChat({
        conversationId: convId,
        name: (applicant.profile as any)?.display_name ?? 'Applicant',
      })
    }
  }

  const openGroupChat = async () => {
    let convId = listing?.group_conversation_id
    if (!convId) {
      // Create group conversation
      const { data: conv } = await supabase
        .from('conversations')
        .insert({ listing_id: id, type: 'group' } as never)
        .select('id')
        .single()
      convId = (conv as any)?.id
      // Add all members as participants
      if (convId && members.length > 0) {
        await supabase.from('conversation_participants').insert(
          members.map(m => ({ conversation_id: convId, profile_id: (m as any).profile_id || (m.profile as any)?.id })) as never[]
        )
      }
      await loadData()
    }
    if (convId) setActiveChat({ conversationId: convId, name: 'Group chat' })
  }

  const removeMember = async (member: MemberWithProfile) => {
    await supabase.from('listing_members').delete().eq('id', member.id)
    toast.success('Member removed')
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const pendingApplicants = applicants.filter(a => a.status === 'pending')
  const reviewedApplicants = applicants.filter(a => a.status !== 'pending')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/listings/${id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="font-bold text-lg">{listing?.title}</h1>
          <p className="text-sm text-muted-foreground">Admin panel</p>
        </div>
        <Button variant="outline" size="sm" onClick={openGroupChat} className="gap-2">
          <MessageCircle className="h-4 w-4" /> Group chat
        </Button>
      </div>

      {/* Chat panel (shown alongside content) */}
      {activeChat && (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{activeChat.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setActiveChat(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <RealtimeChat
              conversationId={activeChat.conversationId}
              currentUserId={user!.id}
              height="360px"
            />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="applicants">
        <TabsList>
          <TabsTrigger value="applicants" className="gap-2">
            Applicants
            {pendingApplicants.length > 0 && (
              <Badge className="h-5 px-1.5 text-xs">{pendingApplicants.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            Members
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">{members.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── APPLICANTS TAB ── */}
        <TabsContent value="applicants" className="space-y-4 mt-4">
          {pendingApplicants.length === 0 && reviewedApplicants.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No applications yet. Share your listing to get people interested!
            </div>
          )}

          {pendingApplicants.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="h-4 w-4" /> Pending ({pendingApplicants.length})
              </h3>
              {pendingApplicants.map(a => (
                <ApplicantCard
                  key={a.id}
                  applicant={a}
                  reviewing={reviewingId === a.id}
                  onApprove={() => handleReview(a.id, 'approved')}
                  onDecline={() => handleReview(a.id, 'rejected')}
                  onChat={() => openChat(a)}
                  hasChat={!!a.conversation_id}
                />
              ))}
            </div>
          )}

          {reviewedApplicants.length > 0 && (
            <div className="space-y-3">
              <Separator />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Reviewed ({reviewedApplicants.length})
              </h3>
              {reviewedApplicants.map(a => (
                <ApplicantCard
                  key={a.id}
                  applicant={a}
                  reviewing={reviewingId === a.id}
                  onApprove={() => handleReview(a.id, 'approved')}
                  onDecline={() => handleReview(a.id, 'rejected')}
                  onChat={() => openChat(a)}
                  hasChat={!!a.conversation_id}
                  reviewed
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── MEMBERS TAB ── */}
        <TabsContent value="members" className="space-y-3 mt-4">
          {members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No members yet.</div>
          ) : (
            members.map(m => {
              const p = (m as any).profile
              const isCreator = listing?.creator_id === p?.id
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar>
                    <AvatarImage src={p?.avatar_url} />
                    <AvatarFallback>{p?.display_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{p?.display_name ?? 'Unknown'}</span>
                      {(m as any).role === 'admin' && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Shield className="h-3 w-3" /> Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Joined {formatAgo(m.joined_at)}</p>
                  </div>
                  {!isCreator && user?.id !== p?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeMember(m)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ApplicantCard({
  applicant, reviewing, onApprove, onDecline, onChat, hasChat, reviewed,
}: {
  applicant: ApplicantWithProfile
  reviewing: boolean
  onApprove: () => void
  onDecline: () => void
  onChat: () => void
  hasChat: boolean
  reviewed?: boolean
}) {
  const p = (applicant as any).profile
  const currentYear = new Date().getFullYear()
  const age = p?.birth_year ? currentYear - p.birth_year : null

  const statusColors = {
    pending: 'bg-yellow-50 border-yellow-200',
    approved: 'bg-green-50 border-green-200',
    rejected: 'bg-gray-50 border-gray-200',
    withdrawn: 'bg-gray-50 border-gray-200',
  }
  const color = statusColors[applicant.status as keyof typeof statusColors] ?? ''

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${color}`}>
      <div className="flex items-start gap-3">
        <Avatar>
          <AvatarImage src={p?.avatar_url} />
          <AvatarFallback>{p?.display_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{p?.display_name ?? 'Unknown'}</span>
            {p?.gender && <Badge variant="outline" className="text-xs capitalize">{p.gender}</Badge>}
            {age && <Badge variant="outline" className="text-xs">{age} yrs</Badge>}
          </div>
          {p?.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.bio}</p>}
          {p?.interest_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {p.interest_tags.slice(0, 5).map((t: string) => (
                <span key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {t.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {applicant.status === 'approved' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          {applicant.status === 'rejected' && <XCircle className="h-4 w-4 text-muted-foreground" />}
          {applicant.status === 'withdrawn' && <span className="text-xs text-muted-foreground">Withdrawn</span>}
        </div>
      </div>

      {applicant.pitch && (
        <div className="bg-background/60 rounded px-3 py-2 text-sm italic text-muted-foreground">
          &ldquo;{applicant.pitch}&rdquo;
        </div>
      )}

      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs text-muted-foreground">Applied {formatAgo(applicant.applied_at)}</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onChat}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {hasChat ? 'Open chat' : 'Message'}
          </Button>
          {applicant.status === 'pending' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive hover:text-destructive"
                onClick={onDecline}
                disabled={reviewing}
              >
                <XCircle className="h-3.5 w-3.5" /> Decline
              </Button>
              <Button
                size="sm"
                className="gap-1"
                onClick={onApprove}
                disabled={reviewing}
              >
                {reviewing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />
                }
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
