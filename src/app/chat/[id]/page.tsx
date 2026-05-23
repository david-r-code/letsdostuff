'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { RealtimeChat } from '@/components/chat/realtime-chat'
import type { Profile, Conversation } from '@/types/database'

type ConversationWithDetails = Conversation & {
  listing: { id: string; title: string } | null
  participants: Array<{ profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> }>
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [conversation, setConversation] = useState<ConversationWithDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('conversations')
      .select(`
        *,
        listing:listings(id, title),
        participants:conversation_participants(
          profile:profiles(id, display_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) { router.push('/'); return }
        setConversation(data as unknown as ConversationWithDetails)
        setLoading(false)
      })
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!conversation) return null

  const otherParticipants = conversation.participants
    ?.filter(p => (p.profile as any)?.id !== user.id)
    .map(p => p.profile) ?? []

  const chatName = conversation.type === 'group'
    ? `${conversation.listing?.title ?? 'Group'} — members`
    : (otherParticipants[0] as any)?.display_name ?? 'Chat'

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Link
          href={conversation.listing ? `/listings/${conversation.listing.id}` : '/'}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          {conversation.type === '1on1' && otherParticipants[0] && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={(otherParticipants[0] as any)?.avatar_url} />
              <AvatarFallback>{(otherParticipants[0] as any)?.display_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
            </Avatar>
          )}
          <div>
            <p className="font-medium text-sm">{chatName}</p>
            {conversation.listing && (
              <p className="text-xs text-muted-foreground">{conversation.listing.title}</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <RealtimeChat
          conversationId={id}
          currentUserId={user.id}
          height="100%"
        />
      </div>
    </div>
  )
}
