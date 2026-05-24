-- Add social link fields to profiles
alter table profiles
  add column if not exists facebook_url text,
  add column if not exists social_links_other text;
