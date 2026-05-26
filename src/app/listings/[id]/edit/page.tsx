'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { CriteriaBuilder } from '@/components/listings/criteria-builder'
import { toast } from 'sonner'
import { MapPin, Users, Clock, FileText, Target, Loader2, Trash2 } from 'lucide-react'
import type { ListingCriterion } from '@/types/database'

const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then(m => m.LocationPicker),
  { ssr: false }
)

type DraftCriterion = Omit<ListingCriterion, 'id' | 'listing_id'>

const SECTIONS = ['basics', 'location', 'criteria', 'settings'] as const
type Section = typeof SECTIONS[number]

const SECTION_LABELS: Record<Section, { icon: React.ReactNode; title: string }> = {
  basics:   { icon: <FileText className="h-4 w-4" />, title: 'Basics' },
  location: { icon: <MapPin className="h-4 w-4" />,  title: 'Location' },
  criteria: { icon: <Target className="h-4 w-4" />,  title: 'Criteria' },
  settings: { icon: <Users className="h-4 w-4" />,   title: 'Settings' },
}

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
  const [location, setLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [criteria, setCriteria] = useState<DraftCriterion[]>([])
  const [maxMembers, setMaxMembers] = useState<number | ''>('')
  const [expiresAt, setExpiresAt] = useState('')

  // Load existing listing
  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('listings').select('*').eq('id', id).single(),
      supabase.from('listing_criteria').select('*').eq('listing_id', id).order('sort_order'),
    ]).then(([{ data: listing, error }, { data: existingCriteria }]) => {
      if (error || !listing) { router.push('/'); return }

      // Auth check — must be creator
      if (listing.creator_id !== user.id) {
        toast.error('You can only edit your own listings')
        router.push(`/listings/${id}`)
        return
      }

      setTitle(listing.title ?? '')
      setDescription(listing.description ?? '')
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
      setCriteria(
        (existingCriteria ?? []).map((c: any) => ({
          criteria_type: c.criteria_type,
          label: c.label,
          data: c.data,
          enforcement: c.enforcement,
          sort_order: c.sort_order,
        }))
      )
      setLoading(false)
    })
  }, [id, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Please add a title'); setActiveSection('basics'); return }
    if (!location) { toast.error('Please pick a location'); setActiveSection('location'); return }

    setSaving(true)
    try {
      // Update listing
      const { error } = await supabase.from('listings').update({
        title: title.trim(),
        description: description.trim() || null,
        location_lat: location.lat,
        location_lng: location.lng,
        location_label: location.label,
        max_members: maxMembers || null,
        expires_at: expiresAt || null,
      } as never).eq('id', id)

      if (error) throw error

      // Replace criteria — delete old, insert new
      await supabase.from('listing_criteria').delete().eq('listing_id', id)
      if (criteria.length > 0) {
        await supabase.from('listing_criteria').insert(
          criteria.map((c, i) => ({
            listing_id: id,
            criteria_type: c.criteria_type,
            label: c.label,
            data: c.data,
            enforcement: c.enforcement,
            sort_order: i,
          })) as never[]
        )
      }

      // Re-normalize tags
      const tagText = [title, description].filter(Boolean).join('. ')
      fetch('/api/listings/normalize-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, text: tagText }),
      })

      toast.success('Listing updated!')
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
      toast.success('Listing deleted')
      router.push('/')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete listing')
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
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit listing</h1>
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
              <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the listing, all applications, and any group chat.
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
        {SECTIONS.map((s) => (
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
            <CardDescription>Name and description of your listing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                placeholder="What is this group about?" rows={5}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── LOCATION ── */}
      {activeSection === 'location' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Location</CardTitle>
            <CardDescription>Where does this activity take place?</CardDescription>
          </CardHeader>
          <CardContent>
            <LocationPicker value={location} onChange={setLocation} placeholder="Search for location…" height="320px" />
          </CardContent>
        </Card>
      )}

      {/* ── CRITERIA ── */}
      {activeSection === 'criteria' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Membership criteria</CardTitle>
            <CardDescription>Who can join? Describe in plain language — AI extracts the rules.</CardDescription>
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
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Settings</CardTitle>
            <CardDescription>Capacity and expiry are both optional.</CardDescription>
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
                        {criteria.map((c, i) => <Badge key={i} variant="secondary" className="text-xs">{c.label}</Badge>)}
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
        {SECTIONS.indexOf(activeSection) > 0 && (
          <Button type="button" variant="outline" className="bg-background"
            onClick={() => setActiveSection(SECTIONS[SECTIONS.indexOf(activeSection) - 1])}>
            Back
          </Button>
        )}
        {activeSection !== 'settings' ? (
          <Button type="button" className="flex-1"
            onClick={() => setActiveSection(SECTIONS[SECTIONS.indexOf(activeSection) + 1])}>
            Next: {SECTION_LABELS[SECTIONS[SECTIONS.indexOf(activeSection) + 1]].title}
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
