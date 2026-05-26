-- Fix applicants_read RLS: listing creator must be able to read applications
-- even if the listing_members trigger failed to add them as admin.
-- Previously only checked listing_members; now also checks listings.creator_id.

drop policy if exists "applicants_read" on public.listing_applicants;

create policy "applicants_read" on public.listing_applicants for select
  using (
    -- applicant sees their own row
    profile_id = auth.uid()
    -- admin member sees applications to their listing
    or exists (
      select 1 from public.listing_members lm
      where lm.listing_id = listing_id
        and lm.profile_id = auth.uid()
        and lm.role = 'admin'
    )
    -- creator always sees applications, regardless of listing_members row
    or exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.creator_id = auth.uid()
    )
  );
