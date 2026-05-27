# letsdostuff — Product Spec

**letsdostuff** is a location-based social app for finding people to do things with — from "women-only surf crew at Malibu" to "garage sale this Sunday" to "anyone want lemons in 15 minutes".

---

## Core concept

The fundamental unit is a **post**: a public notice about an activity, group, or event. A post has a location and a **response mode** that determines how other people can interact with it.

### Response modes

| Mode | Label | Behaviour |
|---|---|---|
| `no_responses` | No responses | Broadcast only. No join button. Good for announcements. |
| `sign_up` | Sign up | Anyone can join instantly. No approval step. |
| `apply` | Apply | Creator reviews each person before they join. |

---

## Routes

### `/` — Discovery feed

- **Signed-out**: splash page with tagline and "Get started" / "Sign in" buttons.
- **Signed-in**: a filtered list of posts near the user.

**Filter bar**:
- Keyword search (filters title, description, tags client-side).
- Radius selector: 5 / 10 / 25 / 50 / 100 miles.
- Location text input with Mapbox autocomplete (postcode, place, neighborhood, address).
- "Near me" crosshair button: uses browser geolocation + reverse geocodes to a place name.

**Discovery logic** (server-side via `discover_listings` RPC):
- PostGIS `ST_DWithin` geo filter at selected radius.
- Results ranked by tag overlap with user's interest tags + recency decay.
- Auto-expand: if nothing found at selected radius, expands through 50 → 100 → 250 → 500 miles and shows a notice.
- Up to 50 results returned.

**Discovery center**: resolved from the user's saved `location_lat`/`location_lng`. If only `location_label` exists (legacy accounts), geocodes once and saves coordinates. Falls back to Santa Monica if no location is set.

---

### `/listings/new` — Create a post

Single scrollable page. Required: headline + location. Everything else is optional.

Fields (in order):
1. **Headline** — max 120 chars, with character counter.
2. **Description** — optional free text.
3. **Who can respond?** — 3-button picker (No responses / Sign up / Apply).
4. **Who can join?** — free-text textarea, only shown when mode is Apply. Optional. Stored as `criteria text[]`.
5. **Location** — Mapbox geocoding autocomplete + "Use my location" button.
   - Hint: "Street address for a garage sale, town or neighborhood for a group activity."
6. **Max members** — optional number input.
7. **Expires** — optional datetime picker.

On save:
- Inserts row into `listings`.
- Fires `POST /api/listings/normalize-tags` (fire-and-forget) to extract `interest_tags` via Claude Haiku.
- Redirects to the post detail page.

Submit button is disabled until headline and location are both filled.

---

### `/listings/[id]` — Post detail

**Header**: title, status badge (if not open), location, member count, expiry, interest tags.

**Organiser card**: avatar + display name + "Created N ago".

**Members preview**: avatar grid, up to 12 shown, +N overflow. Only shown for sign_up / apply modes.

**About**: description (if set).

**Who we're looking for**: criteria text (if set and mode is apply).

**Edit / Manage buttons**: visible to the post creator and any admin member.

**CTA (sticky bottom)**:

| Who | Mode | CTA |
|---|---|---|
| Signed-out | sign_up or apply | "Sign up to join" → `/auth/signup` |
| Signed-in, not creator, not member | `sign_up` | "Sign up" button → `sign_up_to_listing` RPC |
| Signed-in, not creator, not member | `apply` | "Express interest" → pitch dialog |
| Signed-in, not creator, not member | `apply`, pending | "Your application is pending review" + Withdraw button |
| Signed-in, not creator, not member | `apply`, approved | Green banner: "You've been approved! Check your messages." |
| Signed-in, not creator, not member | `apply`, rejected | Muted banner: "Your application wasn't accepted." |
| Signed-in, not creator, not member | `no_responses` | No CTA |
| Member (non-creator) | sign_up or apply | Green banner: "You're a member of this group." |
| Creator | — | Edit / Manage buttons instead |

**Express interest dialog**: optional pitch message → calls `apply_to_listing` RPC.

---

### `/listings/[id]/edit` — Edit a post

Same single-page layout as create. Pre-fills all fields from the existing post.

Criteria load: `(listing.criteria ?? []).join('\n')`.
Criteria save: `[criteriaText.trim()]` or `[]`.

**Delete button** (header, right): opens AlertDialog. Calls `listings.delete()`. Redirects to `/`.

Only the post creator can access this page — non-creators are redirected to the detail page.

---

### `/listings/[id]/manage` — Admin panel

Accessible to the post creator and any admin member. Others are redirected.

**Header**: post title, "Admin panel" label, "Group chat" button.

**Group chat**: inline chat panel (RealtimeChat component). Created on first open; adds all current members as participants.

**Tabs**:

#### Applicants tab

Shows all people who have expressed interest, grouped:
- **Pending** (with count badge).
- **Reviewed** (approved / rejected / withdrawn), separated by a divider.

Each applicant card shows:
- Avatar, display name, gender badge, approximate age.
- Bio (truncated to 2 lines).
- Interest tags (up to 5).
- Pitch message (if provided).
- "Applied N ago" timestamp.
- Actions: **Message** (opens/creates 1:1 conversation inline), **Approve**, **Decline** (pending only).

Realtime: the applicants list auto-refreshes when new applications arrive via Supabase Realtime `postgres_changes`.

#### Members tab

List of all current members with avatar, display name, joined date, Admin badge.

**Remove member** button (visible for all members except the creator and yourself).

---

### `/inbox` — Applications inbox

Two tabs: **Received** and **Sent**.

#### Received tab

Applications to posts you created. Filter: Pending (default) or All.

Each item shows: applicant avatar (links to public profile), name, post title, pitch, timestamp.

Actions for pending items:
- **Accept** → `review_applicant` RPC with `approved`.
- **Decline** → `review_applicant` RPC with `rejected`.
- **Block** → `review_applicant` RPC with `blocked`.
- **Reply** → `get_or_create_applicant_conversation` RPC → redirects to `/chat/[id]`.

Pending count shown as a red badge on the "Received" tab.

Realtime: auto-refreshes both tabs on any change to `listing_applicants`.

#### Sent tab

Your own applications (excluding withdrawn). Shows post title, status badge, pitch, timestamp.

Pending items have a **Withdraw** button → sets status to `withdrawn`.

---

### `/my-events` — Activity hub

Three sections (only shown if non-empty):

| Section | Contents |
|---|---|
| **Organizing** | Posts you created. Shows Manage link. |
| **Joined** | Posts where you're a member (role = member, not creator). |
| **Interested in** | Your non-withdrawn applications where you're not yet a member. Shows status badge. |

Each card shows: title (links to detail), description (1 line), interest tags (up to 4), location, expiry.

---

### `/chat/[id]` — Realtime chat

1:1 or group conversation. Full-page realtime messaging via Supabase Realtime.

---

### `/profile` — Own profile

Shows: avatar, display name, email, gender, birth year (shown as age range), location, bio, interest tags (as badges), raw interests text, kids (gender + age range, private).

**Edit** button → `/profile/setup`.
**Public view** link → `/profile/[id]`.
**Delete account** button (danger zone): calls `DELETE /api/account/delete`, signs out, redirects to `/`.

---

### `/profile/setup` — Profile setup / edit

Onboarding wizard (also used for editing). Steps:

1. **About you**: display name (required), birth year (required, age > 12), gender (optional, defaults to "Other / Prefer not to say"), bio (optional).
2. **Kids**: gender + birth year per child (private, not shown publicly). Optional.
3. **Location**: Mapbox geocoding autocomplete + "Use my location".
4. **Interests**: free-text textarea. On save: fires `POST /api/profile/normalize-tags` (Claude Haiku) to extract `interest_tags`.

Profile is complete when `display_name` and `birth_year` are set. Completion gates the "Create post" nav button and is checked at OAuth callback.

---

### `/profile/[id]` — Public profile

Read-only. Visible to everyone (including signed-out users).

Shows: avatar, display name, location, bio, gender, age range, interest tags, raw interests text.

Kids data is **not** shown (private by RLS).

---

### Auth routes

- `/auth/signup` — Email + password or Google OAuth.
- `/auth/login` — Email + password or Google OAuth.
- `/auth/callback` — Post-OAuth handler. Checks `birth_year`; if null, redirects to `/profile/setup`.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/listings/normalize-tags` | POST | Claude Haiku extracts `interest_tags` from listing title + description. |
| `/api/profile/normalize-tags` | POST | Claude Haiku extracts `interest_tags` from profile interests text. |
| `/api/account/delete` | DELETE | Deletes auth user + all associated data. |

---

## Data model (key tables)

| Table | Key columns |
|---|---|
| `profiles` | `id`, `display_name`, `avatar_url`, `gender`, `birth_year`, `bio`, `location_lat`, `location_lng`, `location_label`, `interest_tags text[]`, `interests_raw` |
| `profile_children` | `profile_id`, `gender`, `birth_year` |
| `listings` | `id`, `creator_id`, `title`, `description`, `response_mode`, `criteria text[]`, `location_lat`, `location_lng`, `location_label`, `max_members`, `expires_at`, `status`, `interest_tags text[]`, `is_public` |
| `listing_members` | `listing_id`, `profile_id`, `role` (admin \| member), `joined_at` |
| `listing_applicants` | `listing_id`, `profile_id`, `status` (pending \| approved \| rejected \| withdrawn \| blocked), `pitch`, `applied_at` |
| `conversations` | `id`, `listing_id`, `type` (1on1 \| group) |
| `conversation_participants` | `conversation_id`, `profile_id` |
| `messages` | `conversation_id`, `sender_id`, `content`, `created_at` |

### Key RPCs

| RPC | What it does |
|---|---|
| `discover_listings(lat, lng, radius_km, tags, limit, offset)` | Geo + tag ranked feed |
| `apply_to_listing(listing_id, pitch)` | Express interest; idempotent |
| `sign_up_to_listing(listing_id)` | Join instantly; checks capacity; idempotent |
| `review_applicant(applicant_id, decision)` | Approve / reject / block; adds to members on approve |
| `get_or_create_applicant_conversation(listing_id, admin_id)` | Creates or returns 1:1 conversation |

### Applicant statuses

`pending` → `approved` (added to members) or `rejected` or `blocked`  
`pending` → `withdrawn` (by the applicant)

---

## Access control summary

| Resource | Who can see | Who can edit |
|---|---|---|
| Posts | Everyone | Creator only |
| Manage panel | Creator + admin members | Creator + admin members |
| Public profile | Everyone | Owner only |
| Kids data | Owner only | Owner only |
| Applicants list | Creator + admin members | Creator + admin members |
| Conversations | Participants only | Participants only |

---

## Navigation

Shown to signed-in users with a complete profile:
- **letsdostuff** (home / discovery)
- **Inbox** (with pending count badge)
- **My Events**
- **Create** (only if profile complete)
- **Profile**

---

## Tech notes

- **Next.js 16** App Router, all pages are client components.
- **shadcn/ui v4** with `@base-ui/react` — `render={}` not `asChild`, `buttonVariants()` on `<Link>`.
- **Supabase** singleton client; PostgREST for data, Realtime for live updates.
- **Mapbox Geocoding REST API** for location search and reverse geocoding (no map SDK).
- Location picker dropdown uses `createPortal` into `document.body` with `position: fixed` to escape parent `overflow: hidden`.
- **Vercel** auto-deploys on push to `main`.
- `discover_listings` must be `LANGUAGE plpgsql STABLE SECURITY DEFINER` — the SQL language version fails via PostgREST.
- Nested FK joins (`select('*, profile:profiles!creator_id(*)')`) are avoided; always split into separate parallel queries.
