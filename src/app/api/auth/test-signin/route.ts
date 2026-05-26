import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Shared internal password used only in test mode.
// Not a security secret — the whole route is gated by NEXT_PUBLIC_TEST_MODE.
const TEST_PASSWORD = 'letsdostuff-test-internal-pw-2025'

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Try to create the user. If they already exist, update their password
  // so it matches the internal test password regardless.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })

  if (createError && createError.message.includes('already been registered')) {
    // User exists — look them up and reset their password
    const { data: { users } } = await admin.auth.admin.listUsers()
    const existing = users.find(u => u.email === email)
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD })
    }
  } else if (createError && !created?.user) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  // Return the internal password so the client can sign in normally
  return NextResponse.json({ password: TEST_PASSWORD })
}
