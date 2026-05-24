'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocationPicker, type PickedLocation } from '@/components/map/location-picker'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Plus, X, MapPin, User, Heart, Baby, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Gender } from '@/types/database'

interface ChildEntry {
  gender: Gender | null
  birth_year: number
}

const STEPS = ['about', 'location', 'interests', 'kids'] as const
type Step = typeof STEPS[number]

const STEP_LABELS: Record<Step, string> = {
  about: 'About you',
  location: 'Your location',
  interests: 'Your interests',
  kids: 'Kids (optional)',
}

const currentYear = new Date().getFullYear()
const birthYears = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i)
const childBirthYears = Array.from({ length: 19 }, (_, i) => currentYear - i)

export default function ProfileSetupPage() {
  const { user, refreshProfile } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('about')
  const [saving, setSaving] = useState(false)

  // About
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name ?? '')
  const [gender, setGender] = useState<Gender | ''>('')
  const [birthYear, setBirthYear] = useState<number | ''>('')
  const [bio, setBio] = useState('')

  // Location
  const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null)

  // Socials
  const [facebookUrl, setFacebookUrl] = useState('')
  const [socialLinksOther, setSocialLinksOther] = useState('')

  // Interests
  const [interestsRaw, setInterestsRaw] = useState('')

  // Kids
  const [children, setChildren] = useState<ChildEntry[]>([])

  const stepIndex = STEPS.indexOf(step)

  const addChild = () => {
    setChildren([...children, { gender: null, birth_year: currentYear - 5 }])
  }

  const removeChild = (i: number) => {
    setChildren(children.filter((_, idx) => idx !== i))
  }

  const updateChild = (i: number, updates: Partial<ChildEntry>) => {
    setChildren(children.map((c, idx) => (idx === i ? { ...c, ...updates } : c)))
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)

    try {
      // Upsert profile
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: displayName,
        gender: gender || null,
        birth_year: birthYear || null,
        bio: bio || null,
        location_lat: pickedLocation?.lat ?? null,
        location_lng: pickedLocation?.lng ?? null,
        location_label: pickedLocation?.label ?? null,
        interests_raw: interestsRaw || null,
        facebook_url: facebookUrl || null,
        social_links_other: socialLinksOther || null,
      } as never)

      if (profileError) throw profileError

      // Normalize tags via API if interests provided
      if (interestsRaw.trim()) {
        await fetch('/api/profile/normalize-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: user.id, text: interestsRaw }),
        })
      }

      // Upsert children — delete old, insert new
      await supabase.from('profile_children').delete().eq('profile_id', user.id)
      if (children.length > 0) {
        await supabase.from('profile_children').insert(
          children.map((c) => ({
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

  return (
    <div className="min-h-screen bg-muted/40 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`h-2 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-primary' : 'bg-muted-foreground/20'
                }`}
              />
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === 'about' && <User className="h-5 w-5" />}
              {step === 'location' && <MapPin className="h-5 w-5" />}
              {step === 'interests' && <Heart className="h-5 w-5" />}
              {step === 'kids' && <Baby className="h-5 w-5" />}
              {STEP_LABELS[step]}
            </CardTitle>
            <CardDescription>
              {step === 'about' && 'Tell people a little about yourself'}
              {step === 'location' && 'Where are you based? Required so we can find things near you.'}
              {step === 'interests' && 'Describe what you love — we\'ll figure out the tags.'}
              {step === 'kids' && 'Add children so we can suggest family-friendly activities. No names stored.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── ABOUT ── */}
            {step === 'about' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="displayName">Display name *</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How you appear to others"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Gender *</Label>
                  <Select value={gender} onValueChange={(v) => setGender(v as Gender | '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Prefer not to say" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other / Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Birth year *</Label>
                  <Select value={birthYear?.toString() ?? ''} onValueChange={(v) => setBirthYear(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {birthYears.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bio">Bio <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A sentence or two about yourself"
                    rows={3}
                  />
                </div>

                <Separator />

                <div className="space-y-1">
                  <Label htmlFor="facebookUrl" className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    Facebook <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="facebookUrl"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/yourprofile"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="socialLinksOther">
                    Other links <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Textarea
                    id="socialLinksOther"
                    value={socialLinksOther}
                    onChange={(e) => setSocialLinksOther(e.target.value)}
                    placeholder={"Instagram: @handle\nLinkedIn: https://...\nWebsite: https://..."}
                    rows={3}
                  />
                </div>
              </>
            )}

            {/* ── LOCATION ── */}
            {step === 'location' && (
              <LocationPicker
                value={pickedLocation}
                onChange={setPickedLocation}
                placeholder="Search by zip, city, or address…"
                height="240px"
              />
            )}

            {/* ── INTERESTS ── */}
            {step === 'interests' && (
              <>
                <Textarea
                  value={interestsRaw}
                  onChange={(e) => setInterestsRaw(e.target.value)}
                  placeholder="e.g. I'm active and love being near the water. I surf on weekends, enjoy hiking, and I'm really into cooking Italian food. I have two dogs and love meeting other dog owners."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Write naturally — we use AI to extract your interests from whatever you write.
                  The more you share, the better your matches will be.
                </p>
              </>
            )}

            {/* ── KIDS ── */}
            {step === 'kids' && (
              <>
                <p className="text-sm text-muted-foreground">
                  We only store gender and birth year — no names. This helps us match you with
                  family-friendly activities suited to your children&apos;s ages.
                </p>
                <Separator />
                {children.map((child, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Select
                      value={child.gender ?? ''}
                      onValueChange={(v) => updateChild(i, { gender: (v as Gender) || null })}
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
                      onValueChange={(v) => updateChild(i, { birth_year: Number(v) })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {childBirthYears.map((y) => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeChild(i)}
                      className="text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" onClick={addChild} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add a child
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Nav buttons */}
        <div className="flex gap-3">
          {stepIndex > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep(STEPS[stepIndex - 1])}
              className="flex-1"
            >
              Back
            </Button>
          )}

          {stepIndex < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(STEPS[stepIndex + 1])}
              className="flex-1"
              disabled={
                (step === 'about' && (!displayName.trim() || !gender || !birthYear)) ||
                (step === 'location' && !pickedLocation)
              }
            >
              Next
            </Button>
          ) : (
            <Button onClick={handleSave} className="flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Finish setup'}
            </Button>
          )}
        </div>

        <button
          className="w-full text-center text-sm text-muted-foreground hover:underline"
          onClick={() => router.push('/')}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
