-- ============================================================
-- letsdostuff — initial schema
-- Apply in Supabase SQL editor
-- ============================================================

-- Enable PostGIS for geo queries
create extension if not exists postgis;

-- ─────────────────────────────────────────
-- TYPES
-- ─────────────────────────────────────────
create type gender_type as enum ('male', 'female', 'other');
create type listing_status as enum ('open', 'closed', 'full', 'expired');
create type member_role as enum ('admin', 'member');
create type applicant_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type criterion_enforcement as enum ('auto', 'display', 'honor');
create type conversation_type as enum ('1on1', 'group');

-- ─────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  avatar_url      text,
  gender          gender_type,
  birth_year      smallint check (birth_year between 1900 and extract(year from now())::int),
  bio             text,
  -- location stored as both lat/lng (for Mapbox) and geography (for PostGIS queries)
  location_lat    double precision,
  location_lng    double precision,
  location_point  geography(point, 4326) generated always as (
    case
      when location_lat is not null and location_lng is not null
      then st_point(location_lng, location_lat)::geography
      else null
    end
  ) stored,
  location_label  text,
  travel_radius_km int default 25 check (travel_radius_km > 0),
  interests_raw   text,
  interest_tags   text[] default '{}',
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create profile automatically when user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────
-- PROFILE CHILDREN (no names)
-- ─────────────────────────────────────────
create table public.profile_children (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  gender      gender_type,
  birth_year  smallint not null check (birth_year between 2000 and extract(year from now())::int + 1),
  created_at  timestamptz default now() not null
);

-- ─────────────────────────────────────────
-- LISTINGS
-- ─────────────────────────────────────────
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  description     text,
  location_lat    double precision not null,
  location_lng    double precision not null,
  location_point  geography(point, 4326) generated always as (
    st_point(location_lng, location_lat)::geography
  ) stored,
  location_label  text,
  radius_km       int default 50 check (radius_km > 0),  -- search radius for this listing
  max_members     int check (max_members > 0),
  expires_at      timestamptz,
  status          listing_status default 'open' not null,
  is_public       boolean default true not null,
  interest_tags   text[] default '{}',
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

create index listings_location_idx on public.listings using gist(location_point);
create index listings_status_idx on public.listings(status);
create index listings_tags_idx on public.listings using gin(interest_tags);

create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────
-- LISTING CRITERIA
-- ─────────────────────────────────────────
create table public.listing_criteria (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  label        text not null,                      -- human-readable: "Women only"
  key          text,                               -- machine key: "gender"
  operator     text,                               -- "=", ">=", "in"
  value        text,                               -- "female", "2", etc.
  enforcement  criterion_enforcement default 'display' not null,
  data_source  text,                               -- "facebook", "self_declared", "system"
  sort_order   int default 0
);

-- ─────────────────────────────────────────
-- LISTING MEMBERS
-- ─────────────────────────────────────────
create table public.listing_members (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        member_role default 'member' not null,
  joined_at   timestamptz default now() not null,
  unique (listing_id, profile_id)
);

create index listing_members_listing_idx on public.listing_members(listing_id);

-- Auto-add creator as admin when listing created
create or replace function public.add_creator_as_admin()
returns trigger language plpgsql security definer as $$
begin
  insert into public.listing_members (listing_id, profile_id, role)
  values (new.id, new.creator_id, 'admin');
  return new;
end;
$$;

create trigger on_listing_created
  after insert on public.listings
  for each row execute function public.add_creator_as_admin();

-- ─────────────────────────────────────────
-- LISTING APPLICANTS
-- ─────────────────────────────────────────
create table public.listing_applicants (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  status       applicant_status default 'pending' not null,
  pitch        text,
  applied_at   timestamptz default now() not null,
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id),
  unique (listing_id, profile_id)
);

create index listing_applicants_listing_idx on public.listing_applicants(listing_id);
create index listing_applicants_status_idx on public.listing_applicants(status);

-- ─────────────────────────────────────────
-- CONVERSATIONS & MESSAGES
-- ─────────────────────────────────────────
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid references public.listings(id) on delete cascade,
  type        conversation_type not null,
  created_at  timestamptz default now() not null
);

create table public.conversation_participants (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at        timestamptz default now() not null,
  unique (conversation_id, profile_id)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text,
  image_url        text,
  created_at       timestamptz default now() not null,
  check (body is not null or image_url is not null)
);

create index messages_conversation_idx on public.messages(conversation_id, created_at);

-- ─────────────────────────────────────────
-- DISCOVERY FUNCTION (geo + tag ranking)
-- ─────────────────────────────────────────
create or replace function public.discover_listings(
  p_lat          double precision,
  p_lng          double precision,
  p_radius_km    int default 50,
  p_tags         text[] default '{}',
  p_limit        int default 50,
  p_offset       int default 0
)
returns table (
  id              uuid,
  creator_id      uuid,
  title           text,
  description     text,
  location_lat    double precision,
  location_lng    double precision,
  location_label  text,
  radius_km       int,
  max_members     int,
  expires_at      timestamptz,
  status          listing_status,
  interest_tags   text[],
  created_at      timestamptz,
  distance_km     double precision,
  tag_overlap     int,
  member_count    bigint
)
language sql stable as $$
  select
    l.id,
    l.creator_id,
    l.title,
    l.description,
    l.location_lat,
    l.location_lng,
    l.location_label,
    l.radius_km,
    l.max_members,
    l.expires_at,
    l.status,
    l.interest_tags,
    l.created_at,
    round((st_distance(
      l.location_point,
      st_point(p_lng, p_lat)::geography
    ) / 1000)::numeric, 1)::double precision as distance_km,
    coalesce(array_length(array(
      select unnest(l.interest_tags)
      intersect
      select unnest(p_tags)
    ), 1), 0) as tag_overlap,
    count(lm.id) as member_count
  from public.listings l
  left join public.listing_members lm on lm.listing_id = l.id
  where
    l.status = 'open'
    and l.is_public = true
    and (l.expires_at is null or l.expires_at > now())
    and st_dwithin(
      l.location_point,
      st_point(p_lng, p_lat)::geography,
      p_radius_km * 1000
    )
  group by l.id
  order by
    tag_overlap desc,
    distance_km asc,
    l.created_at desc
  limit p_limit
  offset p_offset;
$$;

-- ─────────────────────────────────────────
-- RPC: apply to a listing
-- ─────────────────────────────────────────
create or replace function public.apply_to_listing(
  p_listing_id  uuid,
  p_pitch       text default null
)
returns uuid language plpgsql security definer as $$
declare
  v_applicant_id uuid;
begin
  -- Can't apply to own listing
  if exists (
    select 1 from public.listings
    where id = p_listing_id and creator_id = auth.uid()
  ) then
    raise exception 'Cannot apply to your own listing';
  end if;

  -- Can't apply if already a member
  if exists (
    select 1 from public.listing_members
    where listing_id = p_listing_id and profile_id = auth.uid()
  ) then
    raise exception 'Already a member of this listing';
  end if;

  insert into public.listing_applicants (listing_id, profile_id, pitch)
  values (p_listing_id, auth.uid(), p_pitch)
  on conflict (listing_id, profile_id) do update
    set pitch = excluded.pitch, status = 'pending', applied_at = now()
  returning id into v_applicant_id;

  return v_applicant_id;
end;
$$;

-- ─────────────────────────────────────────
-- RPC: review an applicant (admin only)
-- ─────────────────────────────────────────
create or replace function public.review_applicant(
  p_applicant_id  uuid,
  p_decision      applicant_status  -- 'approved' or 'rejected'
)
returns void language plpgsql security definer as $$
declare
  v_listing_id  uuid;
  v_profile_id  uuid;
begin
  select listing_id, profile_id
  into v_listing_id, v_profile_id
  from public.listing_applicants
  where id = p_applicant_id;

  -- Caller must be an admin of this listing
  if not exists (
    select 1 from public.listing_members
    where listing_id = v_listing_id
      and profile_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Not an admin of this listing';
  end if;

  update public.listing_applicants
  set status = p_decision, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_applicant_id;

  -- If approved, add as member
  if p_decision = 'approved' then
    insert into public.listing_members (listing_id, profile_id, role)
    values (v_listing_id, v_profile_id, 'member')
    on conflict (listing_id, profile_id) do nothing;
  end if;
end;
$$;

-- ─────────────────────────────────────────
-- RPC: get or create 1:1 conversation between applicant and admin
-- ─────────────────────────────────────────
create or replace function public.get_or_create_applicant_conversation(
  p_listing_id  uuid,
  p_admin_id    uuid
)
returns uuid language plpgsql security definer as $$
declare
  v_conversation_id  uuid;
begin
  -- Look for existing 1on1 for this listing between current user and admin
  select cp1.conversation_id into v_conversation_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp2.conversation_id = cp1.conversation_id
    and cp2.profile_id = p_admin_id
  join public.conversations c
    on c.id = cp1.conversation_id
    and c.listing_id = p_listing_id
    and c.type = '1on1'
  where cp1.profile_id = auth.uid()
  limit 1;

  if v_conversation_id is null then
    -- Create new conversation
    insert into public.conversations (listing_id, type)
    values (p_listing_id, '1on1')
    returning id into v_conversation_id;

    insert into public.conversation_participants (conversation_id, profile_id)
    values
      (v_conversation_id, auth.uid()),
      (v_conversation_id, p_admin_id);
  end if;

  return v_conversation_id;
end;
$$;

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.profile_children enable row level security;
alter table public.listings enable row level security;
alter table public.listing_criteria enable row level security;
alter table public.listing_members enable row level security;
alter table public.listing_applicants enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

-- Profiles: anyone can read, only owner can write
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Profile children: only owner can read/write
create policy "children_all" on public.profile_children
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Listings: public listings anyone can read; only creator can write
create policy "listings_read" on public.listings for select
  using (is_public = true or creator_id = auth.uid());
create policy "listings_insert" on public.listings for insert
  with check (auth.uid() = creator_id);
create policy "listings_update" on public.listings for update
  using (auth.uid() = creator_id);
create policy "listings_delete" on public.listings for delete
  using (auth.uid() = creator_id);

-- Listing criteria: readable by anyone who can read the listing
create policy "criteria_read" on public.listing_criteria for select
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and (l.is_public or l.creator_id = auth.uid())
  ));
create policy "criteria_write" on public.listing_criteria
  for all using (exists (
    select 1 from public.listings l where l.id = listing_id and l.creator_id = auth.uid()
  ));

-- Listing members: members of a listing can see each other
create policy "members_read" on public.listing_members for select
  using (
    exists (
      select 1 from public.listing_members lm2
      where lm2.listing_id = listing_id and lm2.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.listings l where l.id = listing_id and l.is_public
    )
  );

-- Listing applicants: own row or admin of the listing
create policy "applicants_read" on public.listing_applicants for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.listing_members lm
      where lm.listing_id = listing_id and lm.profile_id = auth.uid() and lm.role = 'admin'
    )
  );
create policy "applicants_insert" on public.listing_applicants for insert
  with check (auth.uid() = profile_id);
create policy "applicants_update" on public.listing_applicants for update
  using (profile_id = auth.uid()); -- RPCs handle admin updates via SECURITY DEFINER

-- Conversations: only participants
create policy "conversations_read" on public.conversations for select
  using (exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = id and cp.profile_id = auth.uid()
  ));

create policy "participants_read" on public.conversation_participants for select
  using (exists (
    select 1 from public.conversation_participants cp2
    where cp2.conversation_id = conversation_id and cp2.profile_id = auth.uid()
  ));

-- Messages: only participants of the conversation
create policy "messages_read" on public.messages for select
  using (exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()
  ));
create policy "messages_insert" on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.profile_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.listing_applicants;
alter publication supabase_realtime add table public.listing_members;
