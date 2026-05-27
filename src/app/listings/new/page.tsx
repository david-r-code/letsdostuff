'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { MapPin, Users, Clock, FileText, Target, X } from 'lucide-react'
import type { ResponseMode } from '@/types/database'

import { LocationPicker } from '@/components/map/location-picker'

const ALL_SECTIONS = ['basics', 'location', 'criteria', 'settings'] as const
type Section = typeof ALL_SECTIONS[number]

const SECTION_LABELS: Record<Section, { icon: React.ReactNode; title: string }> = {
  basics:   { icon: <FileText className="h-4 w-4" />, title: 'Basics' },
  location: { icon: <MapPin className="h-4 w-4" />,  title: 'Location' },
  criteria: { icon: <Target className="h-4 w-4" />,  title: 'Criteria' },
  settings: { icon: <Users className="h-4 w-4" />,   title: 'Settings' },
}

const RESPONSE_MODE_OPTIONS: { value: ResponseMode; label: string; desc: string }[] = [
  { value: 'no_responses', label: 'No responses',  desc: 'Broadcast only — no sign-ups' },
  { value: 'sign_up',      label: 'Sign up',        desc: 'Anyone joins instantly' },
  { value: 'apply',        label: 'Apply',           desc: 'You review each person' },
]

export default function NewListingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responseMode, setResponseMode] = useState<ResponseMode>('apply')
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [criteria, setCriteria] = useState<string[]>([])
  const [criteriaInput, setCriteriaInput] = useState('')
  const [maxMembers, setMaxMembers] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('basics')

  // Criteria section only relevant for apply mode
  const sections = ALL_SECTIONS.filter(s => s !== 'criteria' || responseMode === 'apply')

  const addCriterion = () => {
    const trimmed = criteriaInput.trim()
    if (!trimmed || criteria.includes(trimmed)) return
    setCriteria([...criteria, trimmed])
    setCriteriaInput('')
  }

  const handleSave = async () => {
    if (!user) return
    if (!title.trim()) { toast.error('Please add a title'); setActiveSection('basics'); return }
    if (!location) { toast.error('Please pick a location'); setActiveSection('location'); return }

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
          criteria: responseMode === 'apply' ? criteria : [],
          is_public: true,
          interest_tags: [],
        } as never)
        .select('id')
        .single()

      if (listingError || !listing) throw listingError ?? new Error('Failed to create listing')

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

  const currentIndex = sections.indexOf(activeSection)
  const isLast = currentIndex === sections.length - 1

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a post</h1>
        <p className="text-muted-foreground mt-1">Tell people what you&apos;re up to and who can join.</p>
      </div>

      {/* Section nav */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {sections.map((s) => (
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
            {SECTION_LABELS[s].icon}
            {SECTION_LABELS[s].title}
          </button>
        ))}
      </div>

      {/* ── BASICS ── */}
      {activeSection === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Basics</CardTitle>
            <CardDescription>What&apos;s this about, and how do people respond?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <Label htmlFor="title">Headline *</Label>
              <Input
                id="title" value={title} onChange={e => setTitle(e.target.value)}
                placeholder='e.g. "Weekend surf crew" or "Extra lemons — grab them now!"'
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground text-right">{title.length}/120</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What's the vibe? What will people do? Any important details?"
                rows={4}
              />
            </div>

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
          </CardContent>
        </Card>
      )}

      {/* ── LOCATION ── */}
      {activeSection === 'location' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Location</CardTitle>
            <CardDescription>Where does this take place?</CardDescription>
          </CardHeader>
          <CardContent>
            <LocationPicker value={location} onChange={setLocation} placeholder="Search for a location…" height="320px" />
          </CardContent>
        </Card>
      )}

      {/* ── CRITERIA (apply mode only) ── */}
      {activeSection === 'criteria' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Who can join?</CardTitle>
            <CardDescription>
              List your requirements. People read these before applying — you review each application manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={criteriaInput}
                onChange={e => setCriteriaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCriterion() } }}
                placeholder='e.g. "Women only" or "Intermediate surfers or better"'
              />
              <Button type="button" variant="outline" onClick={addCriterion} disabled={!criteriaInput.trim()}>
                Add
              </Button>
            </div>
            {criteria.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {criteria.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5 text-sm">
                    <span>{c}</span>
                    <button
                      type="button"
                      onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {criteria.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No criteria yet — anyone can apply. Add some to set expectations.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SETTINGS ── */}
      {activeSection === 'settings' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Settings</CardTitle>
            <CardDescription>Both optional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="maxMembers">
                Maximum {responseMode === 'no_responses' ? 'responses' : 'members'}{' '}
                <span className="text-muted-foreground text-xs">(leave blank for unlimited)</span>
              </Label>
              <Input
                id="maxMembers" type="number" min={1} className="w-32"
                value={maxMembers} onChange={e => setMaxMembers(e.target.value ? Number(e.target.value) : '')}
                placeholder="e.g. 8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expiresAt">
                Expires at <span className="text-muted-foreground text-xs">(leave blank to keep open)</span>
              </Label>
              <Input
                id="expiresAt" type="datetime-local" value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)} className="w-64"
              />
              <p className="text-xs text-muted-foreground">Great for time-sensitive posts like &quot;lemons available in 2 hours&quot;</p>
            </div>

            {(title || location) && (
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
                    <p className="text-muted-foreground text-xs capitalize">
                      {responseMode === 'no_responses' ? 'Broadcast · no responses' : responseMode === 'sign_up' ? 'Open sign-up' : 'Applications reviewed'}
                    </p>
                    {criteria.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {criteria.map((c, i) => <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>)}
                      </div>
                    )}
                    {maxMembers && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> Max {maxMembers}
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
        {currentIndex > 0 && (
          <Button type="button" variant="outline" className="bg-background"
            onClick={() => setActiveSection(sections[currentIndex - 1])}>
            Back
          </Button>
        )}
        {!isLast ? (
          <Button type="button" className="flex-1"
            onClick={() => setActiveSection(sections[currentIndex + 1])}>
            Next: {SECTION_LABELS[sections[currentIndex + 1]].title}
          </Button>
        ) : (
          <Button type="button" className="flex-1" onClick={handleSave}
            disabled={saving || !title.trim() || !location}>
            {saving ? 'Creating…' : 'Create post'}
          </Button>
        )}
      </div>
    </div>
  )
}
