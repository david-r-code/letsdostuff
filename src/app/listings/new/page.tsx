'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LocationPicker } from '@/components/map/location-picker'
import { toast } from 'sonner'
import { MapPin, Users, Clock } from 'lucide-react'
import type { ResponseMode } from '@/types/database'

const RESPONSE_MODE_OPTIONS: { value: ResponseMode; label: string; desc: string }[] = [
  { value: 'no_responses', label: 'No responses',  desc: 'Broadcast only' },
  { value: 'sign_up',      label: 'Sign up',        desc: 'Anyone joins instantly' },
  { value: 'apply',        label: 'Apply',           desc: 'You review each person' },
]

export default function NewListingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responseMode, setResponseMode] = useState<ResponseMode>('apply')
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [criteriaText, setCriteriaText] = useState('')
  const [maxMembers, setMaxMembers] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!user) return
    if (!title.trim()) { toast.error('Please add a headline'); return }
    if (!location) { toast.error('Please pick a location'); return }

    setSaving(true)
    try {
      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .insert({
          creator_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          location_lat: location.lat,
          location_lng: location.lng,
          location_label: location.label,
          max_members: maxMembers || null,
          expires_at: expiresAt || null,
          status: 'open' as const,
          response_mode: responseMode,
          criteria: responseMode === 'apply' && criteriaText.trim() ? [criteriaText.trim()] : [],
          is_public: true,
          interest_tags: [],
        } as never)
        .select('id')
        .single()

      if (listingError || !listing) throw listingError ?? new Error('Failed to create post')

      const listingId = (listing as { id: string }).id

      // Normalize tags (fire and forget)
      const tagText = [title, description].filter(Boolean).join('. ')
      fetch('/api/listings/normalize-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, text: tagText }),
      })

      toast.success('Post created!')
      router.push(`/listings/${listingId}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create post. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a post</h1>
        <p className="text-muted-foreground mt-1 text-sm">Tell people what you&apos;re up to.</p>
      </div>

      {/* Headline */}
      <div className="space-y-1">
        <Label htmlFor="title">Headline *</Label>
        <Input
          id="title" value={title} onChange={e => setTitle(e.target.value)}
          placeholder='e.g. "Weekend surf crew" or "Garage Sale this Sunday"'
          maxLength={120}
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

      {location && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {location.label}
        </p>
      )}

      <Button
        type="button" className="w-full" onClick={handleSave}
        disabled={saving || !title.trim() || !location}
      >
        {saving ? 'Creating…' : 'Create post'}
      </Button>
    </div>
  )
}
