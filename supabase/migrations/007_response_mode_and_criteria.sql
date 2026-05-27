-- 007: response_mode + flat text[] criteria on listings
-- Replaces the structured listing_criteria table approach with a simple text array.
-- listing_criteria table is left in place (legacy) but no longer written to.

-- 1. New enum for how a listing accepts responses
create type public.response_mode as enum ('no_responses', 'sign_up', 'apply');

-- 2. Add new columns to listings
alter table public.listings
  add column if not exists response_mode public.response_mode not null default 'apply',
  add column if not exists criteria       text[]              not null default '{}';

-- 3. RPC: direct sign-up (no approval step)
--    Inserts the caller directly into listing_members.
create or replace function public.sign_up_to_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings%rowtype;
  v_count   bigint;
begin
  select * into strict v_listing
  from listings
  where id = p_listing_id;

  if v_listing.status <> 'open' then
    raise exception 'This listing is not open';
  end if;

  if v_listing.response_mode <> 'sign_up' then
    raise exception 'This listing does not allow direct sign-up';
  end if;

  -- check capacity
  if v_listing.max_members is not null then
    select count(*) into v_count
    from listing_members
    where listing_id = p_listing_id;

    if v_count >= v_listing.max_members then
      raise exception 'This listing is full';
    end if;
  end if;

  -- idempotent — silently return if already a member
  if exists (
    select 1 from listing_members
    where listing_id = p_listing_id
      and profile_id = auth.uid()
  ) then
    return;
  end if;

  insert into listing_members (listing_id, profile_id, role)
  values (p_listing_id, auth.uid(), 'member');
end;
$$;
