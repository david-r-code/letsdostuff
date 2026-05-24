import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE() {
  const supabase = await createClient()
  const admin = await createAdminClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete listings where user is the sole admin (cascades to members, applicants, criteria, conversations, messages)
  const { data: adminRows } = await supabase
    .from('listing_members')
    .select('listing_id')
    .eq('profile_id', user.id)
    .eq('role', 'admin')

  if (adminRows?.length) {
    const listingIds = adminRows.map((r: { listing_id: string }) => r.listing_id)
    await supabase.from('listings').delete().in('id', listingIds)
  }

  // Delete the auth user — cascades to profiles + profile_children
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
