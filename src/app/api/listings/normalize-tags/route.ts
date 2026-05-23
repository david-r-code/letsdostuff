import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeTags } from '@/lib/tags'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listingId, text } = await request.json()

  // Verify user owns this listing
  const { data: listing } = await supabase
    .from('listings')
    .select('creator_id')
    .eq('id', listingId)
    .single()

  if (!listing || (listing as unknown as { creator_id: string }).creator_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tags = await normalizeTags(text)

  const { error } = await supabase
    .from('listings')
    .update({ interest_tags: tags } as never)
    .eq('id', listingId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tags })
}
