import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TEST_PASSWORD = 'letsdostuff-test-internal-pw-2025'

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Try to create the user fresh
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    })

    if (createError) {
      // User already exists — find them by email and reset the test password
      const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

      const existing = listData.users.find((u: { email?: string }) => u.email === email)
      if (!existing) return NextResponse.json({ error: createError.message }, { status: 500 })

      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password: TEST_PASSWORD,
        email_confirm: true,
      })
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ password: TEST_PASSWORD })
  } catch (err: any) {
    // Always return JSON — never let the route return an empty body
    return NextResponse.json({ error: err?.message ?? 'Server error' }, { status: 500 })
  }
}
