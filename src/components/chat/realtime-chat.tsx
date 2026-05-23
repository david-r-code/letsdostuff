'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, Loader2 } from 'lucide-react'
import { formatAgo } from '@/lib/format'
import type { Message, Profile } from '@/types/database'

type MessageWithProfile = Message & {
  sender: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
}

interface RealtimeChatProps {
  conversationId: string
  currentUserId: string
  height?: string
}

export function RealtimeChat({ conversationId, currentUserId, height = '480px' }: RealtimeChatProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<MessageWithProfile[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Load history
  useEffect(() => {
    if (!conversationId) return
    supabase
      .from('messages')
      .select('*, sender:profiles(id, display_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data ?? []) as unknown as MessageWithProfile[])
        setLoading(false)
        setTimeout(scrollToBottom, 50)
      })
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        // Fetch the full message with sender profile
        const { data } = await supabase
          .from('messages')
          .select('*, sender:profiles(id, display_name, avatar_url)')
          .eq('id', (payload.new as any).id)
          .single()
        if (data) {
          setMessages(prev => {
            // Deduplicate by ID (optimistic + realtime)
            const exists = prev.some(m => m.id === (data as any).id)
            if (exists) return prev
            return [...prev, data as unknown as MessageWithProfile]
          })
          setTimeout(scrollToBottom, 50)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async () => {
    const text = body.trim()
    if (!text || sending) return

    // Optimistic insert
    const optimisticId = `opt-${Date.now()}`
    const optimistic: MessageWithProfile = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body: text,
      image_url: null,
      created_at: new Date().toISOString(),
      sender: { id: currentUserId, display_name: 'You', avatar_url: null },
    }
    setMessages(prev => [...prev, optimistic])
    setBody('')
    setTimeout(scrollToBottom, 50)
    inputRef.current?.focus()

    setSending(true)
    try {
      const { data: sent } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          body: text,
        } as never)
        .select('*, sender:profiles(id, display_name, avatar_url)')
        .single()

      if (sent) {
        // Replace optimistic with real
        setMessages(prev =>
          prev.map(m => m.id === optimisticId ? sent as unknown as MessageWithProfile : m)
        )
      }
    } catch {
      // Revert optimistic
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setBody(text)
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.sender_id === currentUserId
            const sender = (msg as any).sender
            const prevMsg = messages[i - 1]
            const showAvatar = !prevMsg || (prevMsg as any).sender_id !== msg.sender_id

            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                {!isMe && (
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={sender?.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {sender?.display_name?.[0]?.toUpperCase() ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                )}
                <div className={`max-w-[75%] space-y-1 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {showAvatar && !isMe && (
                    <span className="text-xs text-muted-foreground px-1">
                      {sender?.display_name ?? 'Unknown'}
                    </span>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      isMe
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted rounded-tl-sm'
                    } ${msg.id.startsWith('opt-') ? 'opacity-70' : ''}`}
                  >
                    {msg.body}
                  </div>
                  <span className="text-xs text-muted-foreground px-1">
                    {formatAgo(msg.created_at)}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2">
        <Input
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message…"
          className="flex-1"
          disabled={sending}
        />
        <Button
          size="icon"
          onClick={sendMessage}
          disabled={!body.trim() || sending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
