'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MapPin, Pencil, Trash2, Baby, Calendar, User, Globe } from 'lucide-react'
import { toast } from 'sonner'
import type { Gender } from '@/types/database'

interface ProfileData {
  display_name: string | null
  avatar_url: string | null
  gender: Gender | null
  birth_year: number | null
  bio: string | null
  location_label: string | null
  interests_raw: string | null
  interest_tags: string[]
}

interface ChildData {
  id: string
  gender: Gender | null
  birth_year: number
}

const GENDER_LABEL: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other / Prefer not to say',
}

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [children, setChildren] = useState<ChildData[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('profile_children').select('*').eq('profile_id', user.id),
    ]).then(([{ data: p }, { data: kids }]) => {
      setProfile(p as ProfileData)
      setChildren((kids ?? []) as ChildData[])
      setLoading(false)
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete account')
      await signOut()
      router.push('/')
      toast.success('Account deleted.')
    } catch {
      toast.error('Failed to delete account. Please try again.')
      setDeleting(false)
    }
  }

  if (!user || loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">Loading…</div>
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-4">
        <p className="text-muted-foreground">Profile not found.</p>
        <Button onClick={() => router.push('/profile/setup')}>Set up profile</Button>
      </div>
    )
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-xl">
              {(profile.display_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{profile.display_name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/profile/${user.id}`}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            Public view
          </Link>
          <Button variant="outline" size="sm" onClick={() => router.push('/profile/setup')}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* About */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {profile.bio && <p>{profile.bio}</p>}
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            {profile.gender && (
              <span>{GENDER_LABEL[profile.gender]}</span>
            )}
            {profile.birth_year && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Born {profile.birth_year} · {currentYear - profile.birth_year - 1}–{currentYear - profile.birth_year} yrs
              </span>
            )}
            {profile.location_label && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {profile.location_label}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Interests */}
      {(profile.interest_tags?.length > 0 || profile.interests_raw) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Interests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.interest_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.interest_tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
            {profile.interests_raw && (
              <p className="text-sm text-muted-foreground">{profile.interests_raw}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Kids */}
      {children.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Baby className="h-4 w-4" /> Kids
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {children.map((child) => (
              <div key={child.id} className="flex items-center gap-2 text-muted-foreground">
                <span>{child.gender ? GENDER_LABEL[child.gender] : 'Child'}</span>
                <span>·</span>
                <span>Born {child.birth_year} · {currentYear - child.birth_year - 1}–{currentYear - child.birth_year} yrs old</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Danger zone */}
      <Separator />
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Danger zone</p>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account, profile, and all listings you created.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting…' : 'Yes, delete everything'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
