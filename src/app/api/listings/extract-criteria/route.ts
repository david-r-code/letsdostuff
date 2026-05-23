import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import type {
  CriterionType,
  CriterionEnforcement,
  CriterionData,
  ListingCriterion,
} from '@/types/database'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You extract membership criteria from free-text listing descriptions into structured JSON.

Return a JSON array of criterion objects. Each object has:
{
  "criteria_type": "gender" | "skill" | "geo" | "min_age" | "custom",
  "label": "Human-readable summary (short, e.g. 'Women only')",
  "enforcement": "auto" | "display",
  "data": { ...type-specific fields }
}

Data shapes per type:
- gender:  { "value": "male" | "female" | "other" | "any" }
- skill:   { "name": "string (skill name)", "min_level": "any" | "beginner" | "intermediate" | "advanced" | "expert" }
- geo:     { "travel_mode": "driving" | "walking", "distance_value": number, "distance_unit": "minutes" | "hours", "location_label": "string (place name as written)", "location_lat": null, "location_lng": null }
- min_age: { "min_age": number }
- custom:  { "text": "verbatim or paraphrased requirement" }

Rules:
- Set enforcement "auto" only for: gender, geo, min_age (these can be system-checked)
- Skills are always "display" (self-declared)
- Custom is always "display"
- For geo, extract the location label exactly as written — lat/lng will be resolved separately
- If a requirement doesn't fit gender/skill/geo/min_age, use "custom"
- Extract ALL distinct requirements, even vague ones (put them as "custom")
- Do not invent criteria not implied by the text
- Return [] if no criteria found
- Return only the JSON array, no explanation`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json() as { text: string }
  if (!text?.trim()) return NextResponse.json({ criteria: [] })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return NextResponse.json({ criteria: [] })

    let raw: Array<{
      criteria_type: CriterionType
      label: string
      enforcement: CriterionEnforcement
      data: CriterionData
    }>

    try {
      raw = JSON.parse(content.text)
      if (!Array.isArray(raw)) throw new Error('not array')
    } catch {
      // Try to extract JSON from the response if it has extra text
      const match = content.text.match(/\[[\s\S]*\]/)
      if (!match) return NextResponse.json({ criteria: [] })
      raw = JSON.parse(match[0])
    }

    // Geocode any geo criteria that have a location_label but no lat/lng
    const resolved = await Promise.all(
      raw.map(async (c) => {
        if (c.criteria_type === 'geo') {
          const geoData = c.data as { location_label: string; location_lat: null | number; location_lng: null | number; travel_mode: string; distance_value: number; distance_unit: string }
          if (geoData.location_label && (geoData.location_lat == null || geoData.location_lng == null)) {
            const geocoded = await geocodeLabel(geoData.location_label)
            if (geocoded) {
              geoData.location_lat = geocoded.lat
              geoData.location_lng = geocoded.lng
            }
          }
        }
        return c
      })
    )

    // Assign sort_order
    const criteria: Omit<ListingCriterion, 'id' | 'listing_id'>[] = resolved.map((c, i) => ({
      criteria_type: c.criteria_type,
      label: c.label,
      enforcement: c.enforcement,
      data: c.data,
      sort_order: i,
    }))

    return NextResponse.json({ criteria })
  } catch (err) {
    console.error('criteria extraction error', err)
    return NextResponse.json({ criteria: [] })
  }
}

async function geocodeLabel(label: string): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || token.startsWith('your_')) return null
  try {
    const encoded = encodeURIComponent(label)
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&access_token=${token}`
    )
    const json = await res.json()
    const coords = json.features?.[0]?.center
    if (!coords) return null
    return { lng: coords[0], lat: coords[1] }
  } catch {
    return null
  }
}
