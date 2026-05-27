'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LocationPicker } from '@/components/map/location-picker'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { MapPin, Users, Clock, Loader2, Trash2 } from 'lucide-react'
import type { ResponseMode } from '@/types/database'

const RESPONSE_MODE_OPTIONS: { value: ResponseMode; label: string; desc: string }[] = [
  { value: 'no_responses', label: 'No responses',  desc: 'Broadcast only' },
  { value: 'sign_up',      label: 'Sign up',        desc: 'Anyone joins instantly' },
  { value: 'apply',        label: 'Apply',           desc: 'You review each person' },
]

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responseMode, setResponseMode] = useState<ResponseMode>('apply')
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [criteriaText, setCriteriaText] = useState('')
  const [maxMembers, setMaxMembers] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')

  useEffect(() => {
    if (!user) return
    supabase.from('listings').select('*').eq('id', id).single()
      .then(({ data: listing, error }: { data: any; error: any }) => {
        if (error || !listing) { router.push('/'); return }
        if (listing.creator_id !== user.id) {
          toast.error('You can only edit your own posts')
          router.push(`/listings/${id}`)
          return
        }
        setTitle(listing.title ?? '')
        setDescription(listing.description ?? '')
        setResponseMode(listing.response_mode ?? 'apply')
        setCriteriaText((listing.criteria ?? []).join('\n'))
        setLocation(
          listing.location_lat && listing.location_lng
            ? { lat: listing.location_lat, lng: listing.location_lng, label: listing.location_label ?? '' }
            : null
        )
        setMaxMembers(listing.max_members ?? '')
        setExpiresAt(listing.expires_at ? new Date(listing.expires_at).toISOString().slice(0, 16) : '')
        setLoading(false)
      })
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Please add a headline'); return }
    if (!location) { toast.error('Please pick a location'); return }

    setSaving(true)
    try {
      const { error } = await supabase.from('listings').update({
        title: title.trim(),
        description: description.trim() || null,
        location_lat: location.lat,
        location_lng: location.lng,
        location_label: location.label,
        max_members: maxMembers || null,
        expires_at: expiresAt || null,
        response_mode: responseMode,
        criteria: responseMode === 'apply' && criteriaText.trim() ? [criteriaText.trim()] : [],
      } as never).eq('id', id)

      if (error) throw error

      const tagText = [title, description].filter(Boolean).join('. ')
      fetch('/api/listings/normalize-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, text: tagText }),
      })

      toast.success('Post updated!')
      router.push(`/listings/${id}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save.')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error } = await supabase.from('listings').delete().eq('id', id)
      if (error) throw error
      toast.success('Post deleted')
      router.push('/')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete post')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit post</h1>
          <p className="text-muted-foreground mt-0.5 text-sm truncate max-w-xs">{title}</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the post, all applications, and any group chat. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Headline */}
      <div className="space-y-1">
        <Label htmlFor="title">Headline *</Label>
        <Input
          id="title" value={title} onChange={e => setTitle(e.target.value)}
          placeholder='e.g. "Weekend surf crew"' maxLength={120}
        />
        <p className="text-xs text-muted-foreground text-right">{title.length}/120</p>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="description">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Textarea
          id="description" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="What's the vibe? Any important details?"
          rows={3}
        />
      </div>

      {/* Who can respond */}
      <div className="space-y-2">
        <Label>Who can respond?</Label>
        <div className="grid grid-cols-3 gap-2">
          {RESPONSE_MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setResponseMode(opt.value)}
              className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border text-left transition-colors ${
                responseMode === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <span className="font-medium text-sm">{opt.label}</span>
              <span className="text-xs text-muted-foreground leading-snug">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Who can join — apply mode only */}
      {responseMode === 'apply' && (
        <div className="space-y-1">
          <Label htmlFor="criteria">Who can join? <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Textarea
            id="criteria"
            value={criteriaText}
            onChange={e => setCriteriaText(e.target.value)}
            placeholder='e.g. "Women only, all skill levels welcome"'
            rows={2}
          />
        </div>
      )}

      {/* Location */}
      <div className="space-y-1">
        <Label>Location *</Label>
        <p className="text-xs text-muted-foreground">Street address for a garage sale, town or neighborhood for a group activity.</p>
        <LocationPicker value={location} onChange={setLocation} placeholder="Street address or town…" />
      </div>

      {/* Capacity + expiry */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="maxMembers" className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Max members
            <span className="text-muted-foreground text-xs ml-1">(optional)</span>
          </Label>
          <Input
            id="maxMembers" type="number" min={1}
            value={maxMembers} onChange={e => setMaxMembers(e.target.value ? Number(e.target.value) : '')}
            placeholder="e.g. 8"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expiresAt" className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Expires
            <span className="text-muted-foreground text-xs ml-1">(optional)</span>
          </Label>
          <Input
            id="expiresAt" type="datetime-local" value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      <Button
        type="button" className="w-full" onClick={handleSave}
        disabled={saving || !title.trim() || !location}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  )
}
