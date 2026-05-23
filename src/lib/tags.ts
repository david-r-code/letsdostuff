import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

// Seed taxonomy — Claude will normalize to these where possible, and add new ones if needed
export const SEED_TAGS = [
  // Water & beach
  'surfing', 'swimming', 'beach', 'water_sports', 'kayaking', 'paddleboarding',
  'sailing', 'fishing', 'snorkeling', 'scuba_diving',
  // Outdoor
  'hiking', 'camping', 'rock_climbing', 'cycling', 'trail_running', 'outdoor_activities',
  'nature', 'birdwatching', 'gardening',
  // Fitness
  'fitness', 'yoga', 'running', 'crossfit', 'gym', 'martial_arts', 'tennis',
  'basketball', 'soccer', 'volleyball', 'golf',
  // Social & food
  'cooking', 'baking', 'food', 'wine', 'coffee', 'dining',
  // Arts & culture
  'music', 'art', 'photography', 'film', 'theatre', 'dancing', 'reading',
  // Family
  'family_activities', 'kids_activities', 'parenting', 'pets', 'dogs',
  // Tech & games
  'technology', 'gaming', 'board_games',
  // Community
  'volunteering', 'neighbourhood', 'environment',
]

export async function normalizeTags(text: string): Promise<string[]> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Extract interest tags from this text. Return ONLY a JSON array of snake_case strings.

Rules:
- Prefer tags from this list where they fit: ${SEED_TAGS.join(', ')}
- Add up to 3 new snake_case tags if the text clearly implies interests not in the list
- Maximum 12 tags total
- Be specific (prefer "surfing" over "sports", "cooking" over "food" when clear)
- Return [] if no clear interests found

Text: "${text}"

Return only the JSON array, no explanation.`,
      },
    ],
  })

  try {
    const content = message.content[0]
    if (content.type !== 'text') return []
    const tags = JSON.parse(content.text)
    if (!Array.isArray(tags)) return []
    return tags.filter((t): t is string => typeof t === 'string').slice(0, 12)
  } catch {
    return []
  }
}
