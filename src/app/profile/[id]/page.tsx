'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, ExternalLink, Baby, Calendar, User, Loader2 } from 'lucide-react'
import type { Gender } from '@/types/database'

interface PublicProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  gender: Gender | null
  birth_year: number | null
  bio: string | null
  location_label: string | null
  interest_tags: string[]
  interests_raw: string | null
  facebook_url: string | null
  social_links_other: string | null
}

const GENDER_LABEL: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other / Prefer not to say',
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url, gender, birth_year, bio, location_label, interest_tags, interests_raw, facebook_url, social_links_other')
      .eq('id', id)
      .single()
      .then(({ data }: { data: unknown }) => {
        setProfile(data as PublicProfile | null)
        setLoading(false)
      })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        Profile not found.
      </div>
    )
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-xl">
            {(profile.display_name?.[0] ?? '?').toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{profile.display_name ?? 'Anonymous'}</h1>
          {profile.location_label && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5" />
              {profile.location_label}
            </p>
          )}
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
            {profile.gender && <span>{GENDER_LABEL[profile.gender]}</span>}
            {profile.birth_year && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {currentYear - profile.birth_year - 1}–{currentYear - profile.birth_year} yrs old
              </span>
            )}
          </div>
          {!profile.bio && !profile.gender && !profile.birth_year && (
            <p className="text-muted-foreground italic">No details yet.</p>
          )}
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

      {/* Social links */}
      {(profile.facebook_url || profile.social_links_other) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {profile.facebook_url && (
              <a
                href={profile.facebook_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Facebook
              </a>
            )}
            {profile.social_links_other && (
              <p className="text-muted-foreground whitespace-pre-line">{profile.social_links_other}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
