-- Migration 002: Replace structured criteria columns with JSONB data column
-- This supersedes the listing_criteria table definition in 001.
-- If applying fresh, the 001 migration already creates listing_criteria —
-- run this to alter it to the JSONB shape (or apply both and this will fix it).

ALTER TABLE public.listing_criteria
  DROP COLUMN IF EXISTS key,
  DROP COLUMN IF EXISTS operator,
  DROP COLUMN IF EXISTS value,
  DROP COLUMN IF EXISTS data_source;

ALTER TABLE public.listing_criteria
  ADD COLUMN IF NOT EXISTS criteria_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

-- criteria_type values: 'gender' | 'skill' | 'geo' | 'min_age' | 'custom'
-- data shapes documented in src/types/database.ts (CriterionData)

COMMENT ON COLUMN public.listing_criteria.data IS
  'Type-specific payload. gender: {value}, skill: {name,min_level}, geo: {travel_mode,distance_value,distance_unit,location_lat,location_lng,location_label}, min_age: {min_age}, custom: {text}';

-- Index for geo lookups inside criteria
CREATE INDEX IF NOT EXISTS listing_criteria_type_idx ON public.listing_criteria(criteria_type);
