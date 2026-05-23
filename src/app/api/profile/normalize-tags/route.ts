import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeTags } from '@/lib/tags'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { profileId, text } = await request.json()

  // Only allow users to normalize their own profile tags
  if (profileId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tags = await normalizeTags(text)

  const { error } = await supabase
    .from('profiles')
    .update({ interest_tags: tags } as never)
    .eq('id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tags })
}
