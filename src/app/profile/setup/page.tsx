'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocationPicker, type PickedLocation } from '@/components/map/location-picker'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Plus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Gender } from '@/types/database'

interface ChildEntry {
  id?: string          // existing rows have an id
  gender: Gender | null
  birth_year: number
}

const currentYear = new Date().getFullYear()
const birthYears = Array.from({ length: 110 - 13 + 1 }, (_, i) => currentYear - 13 - i)
const childBirthYears = Array.from({ length: 19 }, (_, i) => currentYear - i)

export default function ProfileSetupPage() {
  const { user, refreshProfile } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // About
  const [displayName, setDisplayName] = useState('')
  const [gender, setGender] = useState<Gender>('other')
  const [birthYear, setBirthYear] = useState<number | ''>('')
  const [bio, setBio] = useState('')

  // Location
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null)

  // Interests
  const [interestsRaw, setInterestsRaw] = useState('')

  // Kids
  const [children, setChildren] = useState<ChildEntry[]>([])

  // Pre-load existing profile data
  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('profiles')
        .select('display_name, gender, birth_year, bio, location_lat, location_lng, location_label, interests_raw')
        .eq('id', user.id)
        .single(),
      supabase.from('profile_children')
        .select('id, gender, birth_year')
        .eq('profile_id', user.id),
    ]).then(([{ data: p }, { data: kids }]) => {
      if (p) {
        setDisplayName((p as any).display_name ?? user?.user_metadata?.display_name ?? '')
        setGender((p as any).gender ?? 'other')
        setBirthYear((p as any).birth_year ?? '')
        setBio((p as any).bio ?? '')
        setInterestsRaw((p as any).interests_raw ?? '')
        if ((p as any).location_lat && (p as any).location_lng) {
          setPickedLocation({
            lat: (p as any).location_lat,
            lng: (p as any).location_lng,
            label: (p as any).location_label ?? '',
          })
        }
      } else {
        // New user — pre-fill display_name from OAuth metadata
        setDisplayName(user?.user_metadata?.display_name ?? '')
      }
      setChildren(
        ((kids ?? []) as any[]).map(k => ({
          id: k.id,
          gender: k.gender ?? null,
          birth_year: k.birth_year,
        }))
      )
      setLoading(false)
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const addChild = () => setChildren(c => [...c, { gender: null, birth_year: currentYear - 5 }])
  const removeChild = (i: number) => setChildren(c => c.filter((_, idx) => idx !== i))
  const updateChild = (i: number, updates: Partial<ChildEntry>) =>
    setChildren(c => c.map((ch, idx) => idx === i ? { ...ch, ...updates } : ch))

  const handleSave = async () => {
    if (!user) return
    if (!displayName.trim()) { toast.error('Please add a display name'); return }
    if (!birthYear) { toast.error('Please select your birth year'); return }

    setSaving(true)
    try {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: displayName.trim(),
        gender,
        birth_year: birthYear || null,
        bio: bio.trim() || null,
        location_lat: pickedLocation?.lat ?? null,
        location_lng: pickedLocation?.lng ?? null,
        location_label: pickedLocation?.label ?? null,
        interests_raw: interestsRaw.trim() || null,
      } as never)

      if (profileError) throw profileError

      if (interestsRaw.trim()) {
        fetch('/api/profile/normalize-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: user.id, text: interestsRaw }),
        })
      }

      // Replace all children
      await supabase.from('profile_children').delete().eq('profile_id', user.id)
      if (children.length > 0) {
        await supabase.from('profile_children').insert(
          children.map(c => ({
            profile_id: user.id,
            gender: c.gender,
            birth_year: c.birth_year,
          })) as never[]
        )
      }

      await refreshProfile()
      toast.success('Profile saved!')
      router.push('/')
    } catch (err) {
      console.error(err)
      toast.error('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
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
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Visible to others when you express interest in their posts.
        </p>
      </div>

      {/* ── About ── */}
      <div className="space-y-4">
        <h2 className="font-semibold">About you</h2>

        <div className="space-y-1">
          <Label htmlFor="displayName">Display name *</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="How you appear to others"
          />
        </div>

        <div className="space-y-1">
          <Label>Birth year *</Label>
          <Select value={birthYear?.toString() ?? ''} onValueChange={v => setBirthYear(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {birthYears.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Gender <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Select value={gender} onValueChange={v => setGender(v as Gender)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other / Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="bio">Bio <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="A sentence or two about yourself"
            rows={3}
          />
        </div>
      </div>

      <Separator />

      {/* ── Location ── */}
      <div className="space-y-4">
        <h2 className="font-semibold">Location <span className="text-muted-foreground font-normal text-sm">(optional)</span></h2>
        <p className="text-sm text-muted-foreground -mt-2">Your town or neighborhood — used to find posts near you.</p>
        <LocationPicker
          value={pickedLocation}
          onChange={setPickedLocation}
          placeholder="Search by zip, city, or address…"
        />
      </div>

      <Separator />

      {/* ── Interests ── */}
      <div className="space-y-4">
        <h2 className="font-semibold">Interests <span className="text-muted-foreground font-normal text-sm">(optional)</span></h2>
        <Textarea
          value={interestsRaw}
          onChange={e => setInterestsRaw(e.target.value)}
          placeholder="e.g. I love being near the water — I surf on weekends, enjoy hiking, and I'm really into cooking Italian food. I have two dogs and love meeting other dog owners."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Write naturally — we use AI to extract your interests. The more you share, the better your matches.
        </p>
      </div>

      <Separator />

      {/* ── Kids ── */}
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Kids <span className="text-muted-foreground font-normal text-sm">(optional)</span></h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gender and birth year only — no names. Helps match family-friendly activities.
          </p>
        </div>

        {children.map((child, i) => (
          <div key={i} className="flex items-center gap-3">
            <Select
              value={child.gender ?? ''}
              onValueChange={v => updateChild(i, { gender: (v as Gender) || null })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Gender (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Boy</SelectItem>
                <SelectItem value="female">Girl</SelectItem>
                <SelectItem value="other">Other / Prefer not to say</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={child.birth_year.toString()}
              onValueChange={v => updateChild(i, { birth_year: Number(v) })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {childBirthYears.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="ghost" size="icon" onClick={() => removeChild(i)} className="text-destructive">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button variant="outline" onClick={addChild} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add a child
        </Button>
      </div>

      <Button
        className="w-full"
        onClick={handleSave}
        disabled={saving || !displayName.trim() || !birthYear}
      >
        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : 'Save profile'}
      </Button>

      <button
        className="w-full text-center text-sm text-muted-foreground hover:underline pb-4"
        onClick={() => router.push('/')}
      >
        Skip for now
      </button>
    </div>
  )
}
