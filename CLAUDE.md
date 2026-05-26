# letsdostuff

Location-based social app for finding people to do activities with — from "women-only surf crew at Malibu" to "anyone want lemons in 15 minutes".

**This is NOT Fortro.** Fortro is a creator messaging app at `C:\Users\David\Documents\Fortro`. letsdostuff is a separate project with a different schema, different stack layer (Next.js web, not Expo mobile), and a different Supabase project.

## Stack
- **Next.js 16** (App Router) + Tailwind + **shadcn/ui v4** (uses `@base-ui/react`, NOT Radix — no `asChild` prop, use `render={}` instead)
- **Supabase** — PostGIS for geo, Realtime for chat, Auth for users
- **Mapbox GL JS** — discovery map + location picker
- **Claude Haiku** (`claude-haiku-4-5-20251001`) — tag normalization + criteria extraction
- **Vercel** deployment (connected to GitHub main branch — every push auto-deploys)

## Key gotchas
- shadcn/ui v4 uses `@base-ui/react` — `Button` doesn't support `asChild`. Use `buttonVariants()` on `<Link>` or `render={<Link />}` on base-ui components.
- Next.js 16 uses `proxy.ts` not `middleware.ts`. Export function must be named `proxy`.
- Supabase client has URL validation guard (placeholder fallback) so build works before env vars are set.
- `useSearchParams()` requires `<Suspense>` wrapper — see `src/app/auth/login/page.tsx`.
- Gender is always `'male' | 'female' | 'other' | null` — never binary. Applies to user profiles and kids.

## Repo & deployment
- GitHub: https://github.com/david-r-code/letsdostuff
- Vercel: https://letsdostuff.vercel.app (auto-deploys from GitHub main)
- Local: `C:\Users\David\Documents\letsdostuff`
- To force a deploy outside of a push: `npx vercel --prod`

## Remote development
To work on this machine from a laptop or tablet on the same network, SSH in:
- This machine's IP: check with `ipconfig` (look for WiFi IPv4)
- `ssh David@<ip>` then `cd Documents/letsdostuff`
- VS Code: Remote-SSH extension → connect to host → open folder
- OpenSSH Server must be running: `Start-Service sshd` (set to Automatic in Services)

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN
ANTHROPIC_API_KEY
```

## Database
Migrations live in `supabase/migrations/` — run in order via Supabase SQL editor:
1. `001_initial_schema.sql` — all tables, PostGIS, RLS, RPCs
2. `002_criteria_jsonb.sql` — switches listing_criteria to JSONB
3. `003_discover_listings_v2.sql` — rewrites discover_listings RPC (plpgsql, fixes 500)
4. `004_fix_discover_listings.sql` — further fixes to tag overlap calculation
5. `005_inbox_blocked.sql` — adds `blocked` to applicant_status enum
6. `006_fix_applicants_rls.sql` — fixes applicants_read RLS to include listing creator

After running migrations, enable Realtime on: `messages`, `listing_applicants`, `listing_members`

### Key tables
| Table | Purpose |
|---|---|
| `profiles` | User profile, location (PostGIS), interests, gender, birth_year |
| `profile_children` | Kids — gender + birth_year only, no names |
| `listings` | Activity listings with PostGIS location |
| `listing_criteria` | JSONB criteria — gender/skill/geo/min_age/custom |
| `listing_members` | role: admin \| member |
| `listing_applicants` | status: pending \| approved \| rejected \| withdrawn \| blocked |
| `conversations` | type: 1on1 \| group |
| `messages` | Chat messages |

### Key RPCs
- `discover_listings(p_lat, p_lng, p_radius_km, p_tags, p_limit, p_offset)` — geo + tag ranked feed
- `apply_to_listing(p_listing_id, p_pitch)` — express interest
- `review_applicant(p_applicant_id, p_decision)` — admin approve/reject/block
- `get_or_create_applicant_conversation(p_listing_id, p_admin_id)` — 1:1 chat

## Routes
| Route | Description |
|---|---|
| `/` | Discovery — map + feed side by side |
| `/auth/login` `/auth/signup` | Email + Google OAuth |
| `/profile/setup` | Onboarding wizard (gender, birth year, kids, location, interests) |
| `/profile` | Self profile view + edit link |
| `/profile/[id]` | Public profile page (read-only, visible to all) |
| `/listings/new` | Create listing (basics → location → criteria → settings) |
| `/listings/[id]` | Listing detail + express interest |
| `/listings/[id]/manage` | Admin panel — applicants, members, group chat |
| `/inbox` | Review applications to your listings (accept/decline/block/reply) |
| `/my-events` | Events you created + joined + applied to |
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

## Hard-won lessons (don't re-learn these)

### Supabase / PostgREST
- **Never use nested FK joins** like `select('*, creator:profiles!creator_id(*)')` — PostgREST returns arrays not objects, or silently returns null. Always split into separate parallel queries.
- **Supabase browser client must be a singleton** — multiple instances each register auth listeners; when one refreshes the token, others fire `onAuthStateChange(null)` and sign the user out. See `src/lib/supabase/client.ts`.
- **Always check `{ error }` from RPC calls** — `await supabase.rpc(...)` returns `{ data, error }`, never throws. Ignoring error means failures show as success.
- **RLS policies that join `listing_members` for admin access will fail for creators** if the auto-add trigger didn't fire (e.g. older listings). Always also check `listings.creator_id = auth.uid()` directly.
- **`discover_listings` must be `LANGUAGE plpgsql STABLE SECURITY DEFINER`** — the sql language version returns 500 via PostgREST. Tag overlap must use a correlated COUNT subquery, not `ARRAY(SELECT unnest INTERSECT SELECT unnest)`.
- **`profileComplete`** checks `display_name AND birth_year` — Google OAuth pre-fills `display_name`, so `birth_year` is the reliable signal that a user has completed `/profile/setup`.

### TypeScript / build
- **Vercel runs `tsc --noEmit`** as part of `next build` — TypeScript errors that pass locally (due to build cache) will fail CI. Run `npx tsc --noEmit` before pushing when touching types.
- **Supabase callback `.then(({ data }) => ...)` gets implicit `any`** because the client isn't fully generic-typed. Pattern: `.then(({ data }: { data: unknown }) => ...)`.
- **`postgres_changes` payload parameter** needs explicit type: `async (payload: Record<string, unknown>) => ...`.
- **`Record<ApplicantStatus, ...>` must include all enum members** — adding a new status (e.g. `blocked`) breaks any exhaustive record that doesn't include it.

### Auth / onboarding
- **New Google OAuth users** land at `/auth/callback` which checks `birth_year` — if null, redirects to `/profile/setup`. This is the gate for incomplete profiles.
- **`profileComplete`** controls the Create button visibility in the nav. Requires both `display_name` and `birth_year`.

### Discovery feed
- **Don't search before profile location resolves** — guard `loadListings` on a `centerReady` flag, otherwise it searches from a default coordinate (Santa Monica) before the user's location is known.
- **Auto-expand radius**: if nothing found at selected radius, expand through [50, 100, 250, 500] miles and show a notice.

## Key design decisions
- **Free text criteria** → Claude Haiku extracts structured data. Admin reviews + adjusts.
- **Geo criterion** has its own reference location, independent of the listing's map pin.
- **Skills**: multiple per listing, free text name + level.
- **Admin**: creator only at creation. Assigning admin to other members is post-MVP.
- **Applicant chat**: 1:1 with any group admin via get_or_create_applicant_conversation RPC.
- **Discovery algorithm**: geo filter (PostGIS ST_DWithin) + tag overlap score + recency decay.
- **Interest tags**: stored as `text[]`, normalized by Haiku from free-text input.
- **Profiles are fully public** (`profiles_read` policy: `using (true)`). No email shown on public profile.
- **Kids data is private** — `profile_children` RLS only allows owner access. Not shown on public profile.

## Post-MVP backlog
- Multiple moderators sharing applicant review load
- Assign admin rights to existing members
- pgvector embeddings for semantic discovery
- Activity-based interest inference
- Linked accounts (Facebook etc.) for auto-enforcement of criteria
- Mobile app (Expo, same Supabase backend) — reference Fortro patterns
