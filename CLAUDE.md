# letsdostuff

Location-based social app for finding people to do activities with — from "women-only surf crew at Malibu" to "anyone want lemons in 15 minutes".

**This is NOT Fortro.** Fortro is a creator messaging app at `C:\Users\David\Documents\Fortro`. letsdostuff is a separate project with a different schema, different stack layer (Next.js web, not Expo mobile), and a different Supabase project.

## Stack
- **Next.js 16** (App Router) + Tailwind + **shadcn/ui v4** (uses `@base-ui/react`, NOT Radix — no `asChild` prop, use `render={}` instead)
- **Supabase** — PostGIS for geo, Realtime for chat, Auth for users
- **Mapbox GL JS** — discovery map + location picker
- **Claude Haiku** (`claude-haiku-4-5-20251001`) — tag normalization + criteria extraction
- **Vercel** deployment

## Key gotchas
- shadcn/ui v4 uses `@base-ui/react` — `Button` doesn't support `asChild`. Use `buttonVariants()` on `<Link>` or `render={<Link />}` on base-ui components.
- Next.js 16 uses `proxy.ts` not `middleware.ts`. Export function must be named `proxy`.
- Supabase client has URL validation guard (placeholder fallback) so build works before env vars are set.
- `useSearchParams()` requires `<Suspense>` wrapper — see `src/app/auth/login/page.tsx`.
- Gender is always `'male' | 'female' | 'other' | null` — never binary. Applies to user profiles and kids.

## Repo & deployment
- GitHub: https://github.com/david-r-code/letsdostuff
- Vercel: not yet connected (TODO)
- Local: `C:\Users\David\Documents\letsdostuff`

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN
ANTHROPIC_API_KEY
```

## Database
Run migrations in order via Supabase SQL editor:
1. `supabase/migrations/001_initial_schema.sql` — all tables, PostGIS, RLS, RPCs
2. `supabase/migrations/002_criteria_jsonb.sql` — switches listing_criteria to JSONB

After running migrations, enable Realtime on: `messages`, `listing_applicants`, `listing_members`

### Key tables
| Table | Purpose |
|---|---|
| `profiles` | User profile, location (PostGIS), interests, gender, birth_year |
| `profile_children` | Kids — gender + birth_year only, no names |
| `listings` | Activity listings with PostGIS location |
| `listing_criteria` | JSONB criteria — gender/skill/geo/min_age/custom |
| `listing_members` | role: admin \| member |
| `listing_applicants` | status: pending \| approved \| rejected \| withdrawn |
| `conversations` | type: 1on1 \| group |
| `messages` | Chat messages |

### Key RPCs
- `discover_listings(p_lat, p_lng, p_radius_km, p_tags, p_limit, p_offset)` — geo + tag ranked feed
- `apply_to_listing(p_listing_id, p_pitch)` — express interest
- `review_applicant(p_applicant_id, p_decision)` — admin approve/reject
- `get_or_create_applicant_conversation(p_listing_id, p_admin_id)` — 1:1 chat

## Routes
| Route | Description |
|---|---|
| `/` | Discovery — map + feed side by side |
| `/auth/login` `/auth/signup` | Email + Google OAuth |
| `/profile/setup` | Onboarding wizard (gender, birth year, kids, location, interests) |
| `/listings/new` | Create listing (basics → location → criteria → settings) |
| `/listings/[id]` | Listing detail + express interest |
| `/listings/[id]/manage` | Admin panel — applicants, members, group chat |
| `/chat/[id]` | Realtime 1:1 or group chat |

## API routes
| Route | Purpose |
|---|---|
| `POST /api/listings/extract-criteria` | Haiku parses free text → structured criteria array |
| `POST /api/listings/normalize-tags` | Haiku extracts interest tags from listing text |
| `POST /api/profile/normalize-tags` | Haiku extracts interest tags from profile text |

## Criteria system
Listing criteria use JSONB `data` column for extensibility. Types:
- `gender` — `{ value: 'male'|'female'|'other'|'any' }`
- `skill` — `{ name: string, min_level: 'any'|'beginner'|'intermediate'|'advanced'|'expert' }`
- `geo` — `{ travel_mode: 'driving'|'walking', distance_value: number, distance_unit: 'minutes'|'hours', location_lat, location_lng, location_label }` — reference location is SEPARATE from listing pin
- `min_age` — `{ min_age: number }`
- `custom` — `{ text: string }`

Enforcement per criterion: `auto` (system checks) | `display` (shown, admin reviews) | `honor` (self-declared)

## Key design decisions
- **Free text criteria** → Claude Haiku extracts structured data. Admin reviews + adjusts.
- **Geo criterion** has its own reference location, independent of the listing's map pin.
- **Skills**: multiple per listing, free text name + level.
- **Admin**: creator only at creation. Assigning admin to other members is post-MVP.
- **Applicant chat**: 1:1 with any group admin via get_or_create_applicant_conversation RPC.
- **Discovery algorithm**: geo filter (PostGIS ST_DWithin) + tag overlap score + recency decay.
- **Interest tags**: stored as `text[]`, normalized by Haiku from free-text input.

## Post-MVP backlog
- GitHub → Vercel auto-deploy
- Multiple moderators sharing applicant review load
- Assign admin rights to existing members
- pgvector embeddings for semantic discovery
- Activity-based interest inference
- Linked accounts (Facebook etc.) for auto-enforcement of criteria
- Mobile app (Expo, same Supabase backend) — reference Fortro patterns
