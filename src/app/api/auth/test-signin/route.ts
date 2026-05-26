import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Only available when NEXT_PUBLIC_TEST_MODE=true in .env.local
// Never set this in Vercel production environment variables.
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

  // Create the user if they don't exist yet (ignore "already exists" error)
  await admin.auth.admin.createUser({ email, email_confirm: true })

  // Generate a magic-link token — no email is sent, we hand the token straight to the client
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message ?? 'Failed to generate token' }, { status: 500 })
  }

  return NextResponse.json({ token: data.properties.hashed_token, email })
}
