'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { MapPin, Users, Clock, FileText, Target, X, Loader2, Trash2 } from 'lucide-react'
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

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('basics')

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responseMode, setResponseMode] = useState<ResponseMode>('apply')
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [criteria, setCriteria] = useState<string[]>([])
  const [criteriaInput, setCriteriaInput] = useState('')
  const [maxMembers, setMaxMembers] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')

  // Load existing listing
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
        setResponseMode((listing as any).response_mode ?? 'apply')
        setCriteria((listing as any).criteria ?? [])
        setLocation(
          listing.location_lat && listing.location_lng
            ? { lat: listing.location_lat, lng: listing.location_lng, label: listing.location_label ?? '' }
            : null
        )
        setMaxMembers(listing.max_members ?? '')
        setExpiresAt(
          listing.expires_at
            ? new Date(listing.expires_at).toISOString().slice(0, 16)
            : ''
        )
        setLoading(false)
      })
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Criteria section only shown for apply mode
  const sections = ALL_SECTIONS.filter(s => s !== 'criteria' || responseMode === 'apply')

  const addCriterion = () => {
    const trimmed = criteriaInput.trim()
    if (!trimmed || criteria.includes(trimmed)) return
    setCriteria([...criteria, trimmed])
    setCriteriaInput('')
  }

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Please add a title'); setActiveSection('basics'); return }
    if (!location) { toast.error('Please pick a location'); setActiveSection('location'); return }

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
        criteria: responseMode === 'apply' ? criteria : [],
      } as never).eq('id', id)

      if (error) throw error

      // Re-normalize tags (fire and forget)
      const tagText = [title, description].filter(Boolean).join('. ')
      fetch('/api/listings/normalize-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, text: tagText }),
      })

      toast.success('Post updated!')
      router.push(`/listings/${id}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save. Please try again.')
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

  const currentIndex = sections.indexOf(activeSection)
  const isLast = currentIndex === sections.length - 1

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit post</h1>
          <p className="text-muted-foreground mt-1 text-sm truncate max-w-sm">{title}</p>
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
                This permanently removes the post, all applications, and any group chat.
                Members will lose access. This cannot be undone.
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
                placeholder='e.g. "Weekend surf crew — women only"' maxLength={120}
              />
              <p className="text-xs text-muted-foreground text-right">{title.length}/120</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What is this group about?" rows={4}
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
            <LocationPicker value={location} onChange={setLocation} placeholder="Search for location…" height="320px" />
          </CardContent>
        </Card>
      )}

      {/* ── CRITERIA (apply mode only) ── */}
      {activeSection === 'criteria' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Who can join?</CardTitle>
            <CardDescription>List your requirements. People read these before applying — you review each application manually.</CardDescription>
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
              <p className="text-xs text-muted-foreground">No criteria yet — anyone can apply.</p>
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
                Maximum members <span className="text-muted-foreground text-xs">(leave blank for unlimited)</span>
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
                    <p className="text-muted-foreground text-xs">
                      {responseMode === 'no_responses' ? 'Broadcast · no responses' : responseMode === 'sign_up' ? 'Open sign-up' : 'Applications reviewed'}
                    </p>
                    {criteria.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {criteria.map((c, i) => <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>)}
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

      {/* Nav + save */}
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
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  )
}
