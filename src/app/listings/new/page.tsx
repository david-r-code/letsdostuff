'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { CriteriaBuilder } from '@/components/listings/criteria-builder'
import { toast } from 'sonner'
import { MapPin, Users, Clock, FileText, Target, Sparkles } from 'lucide-react'
import type { ListingCriterion } from '@/types/database'

const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then(m => m.LocationPicker),
  { ssr: false }
)

type DraftCriterion = Omit<ListingCriterion, 'id' | 'listing_id'>

const SECTIONS = ['basics', 'location', 'criteria', 'settings'] as const
type Section = typeof SECTIONS[number]

const SECTION_LABELS: Record<Section, { icon: React.ReactNode; title: string; desc: string }> = {
  basics:   { icon: <FileText className="h-4 w-4" />, title: 'Basics',   desc: 'Name and mission' },
  location: { icon: <MapPin className="h-4 w-4" />,  title: 'Location',  desc: 'Where it happens' },
  criteria: { icon: <Target className="h-4 w-4" />,  title: 'Criteria',  desc: 'Who can join' },
  settings: { icon: <Users className="h-4 w-4" />,   title: 'Settings',  desc: 'Capacity and expiry' },
}

export default function NewListingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [criteria, setCriteria] = useState<DraftCriterion[]>([])
  const [maxMembers, setMaxMembers] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [isPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('basics')

  // Tag normalization state
  const [tagsNormalized, setTagsNormalized] = useState(false)

  const handleSave = async () => {
    if (!user) return
    if (!title.trim()) { toast.error('Please add a title'); setActiveSection('basics'); return }
    if (!location) { toast.error('Please pick a location'); setActiveSection('location'); return }

    setSaving(true)
    try {
      // 1. Insert listing
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
          is_public: isPublic,
          interest_tags: [],
        } as never)
        .select('id')
        .single()

      if (listingError || !listing) throw listingError ?? new Error('Failed to create listing')

      const listingId = (listing as { id: string }).id

      // 2. Insert criteria
      if (criteria.length > 0) {
        await supabase.from('listing_criteria').insert(
          criteria.map((c, i) => ({
            listing_id: listingId,
            criteria_type: c.criteria_type,
            label: c.label,
            data: c.data,
            enforcement: c.enforcement,
            sort_order: i,
          })) as never[]
        )
      }

      // 3. Normalize tags from title + description (fire and forget)
      const tagText = [title, description].filter(Boolean).join('. ')
      fetch('/api/listings/normalize-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, text: tagText }),
      })

      toast.success('Listing created!')
      router.push(`/listings/${listingId}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create listing. Please try again.')
      setSaving(false)
    }
  }

  const sectionComplete: Record<Section, boolean> = {
    basics: !!title.trim(),
    location: !!location,
    criteria: true, // always optional
    settings: true,
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a listing</h1>
        <p className="text-muted-foreground mt-1">
          Describe what you want to do and who you&apos;re looking for.
        </p>
      </div>

      {/* Section nav */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SECTIONS.map((s) => {
          const info = SECTION_LABELS[s]
          const complete = sectionComplete[s]
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSection(s)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeSection === s
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {info.icon}
              <span>{info.title}</span>
              {s !== 'criteria' && s !== 'settings' && complete && activeSection !== s && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── BASICS ── */}
      {activeSection === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Basics
            </CardTitle>
            <CardDescription>Give your listing a clear, compelling name and describe the mission.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Headline *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder='e.g. "Weekend surf crew — women only" or "Extra lemons — grab them now!"'
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground text-right">{title.length}/120</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Mission / description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this group about? What will members do together? What makes this special?"
                rows={5}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── LOCATION ── */}
      {activeSection === 'location' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Location
            </CardTitle>
            <CardDescription>
              Where does this activity take place? This pins your listing on the map.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LocationPicker
              value={location}
              onChange={setLocation}
              placeholder="Search for the activity location…"
              height="320px"
            />
          </CardContent>
        </Card>
      )}

      {/* ── CRITERIA ── */}
      {activeSection === 'criteria' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Membership criteria
            </CardTitle>
            <CardDescription>
              Describe who you&apos;re looking for in plain language. Our AI will extract the rules —
              you can then adjust enforcement levels for each one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CriteriaBuilder value={criteria} onChange={setCriteria} />
          </CardContent>
        </Card>
      )}

      {/* ── SETTINGS ── */}
      {activeSection === 'settings' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Settings
            </CardTitle>
            <CardDescription>Capacity and expiry are both optional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="maxMembers">
                Maximum members{' '}
                <span className="text-muted-foreground text-xs">(leave blank for unlimited)</span>
              </Label>
              <Input
                id="maxMembers"
                type="number"
                min={1}
                className="w-32"
                value={maxMembers}
                onChange={e => setMaxMembers(e.target.value ? Number(e.target.value) : '')}
                placeholder="e.g. 8"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="expiresAt">
                Expires at{' '}
                <span className="text-muted-foreground text-xs">(leave blank to keep open)</span>
              </Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-64"
              />
              <p className="text-xs text-muted-foreground">
                Great for time-sensitive listings like &quot;lemons available in the next 2 hours&quot;
              </p>
            </div>

            {/* Summary */}
            {(title || location || criteria.length > 0) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Summary</Label>
                  <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                    {title && <p className="font-medium">{title}</p>}
                    {location && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {location.label}
                      </p>
                    )}
                    {criteria.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {criteria.map((c, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {c.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {maxMembers && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> Max {maxMembers} members
                      </p>
                    )}
                    {expiresAt && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Expires {new Date(expiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Nav + submit */}
      <div className="flex gap-3 sticky bottom-4">
        {SECTIONS.indexOf(activeSection) > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setActiveSection(SECTIONS[SECTIONS.indexOf(activeSection) - 1])}
            className="bg-background"
          >
            Back
          </Button>
        )}

        {activeSection !== 'settings' ? (
          <Button
            type="button"
            className="flex-1"
            onClick={() => setActiveSection(SECTIONS[SECTIONS.indexOf(activeSection) + 1])}
          >
            Next: {SECTION_LABELS[SECTIONS[SECTIONS.indexOf(activeSection) + 1]].title}
          </Button>
        ) : (
          <Button
            type="button"
            className="flex-1"
            onClick={handleSave}
            disabled={saving || !title.trim() || !location}
          >
            {saving ? 'Creating…' : 'Create listing'}
          </Button>
        )}
      </div>
    </div>
  )
}
