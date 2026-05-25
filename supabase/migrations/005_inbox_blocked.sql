-- Migration 005: Add 'blocked' applicant status + filter blocked users from discovery

-- 1. Extend the enum
ALTER TYPE applicant_status ADD VALUE IF NOT EXISTS 'blocked';

-- 2. Recreate discover_listings to hide listings where the caller is blocked
CREATE OR REPLACE FUNCTION public.discover_listings(
  p_lat          double precision,
  p_lng          double precision,
  p_radius_km    int DEFAULT 50,
  p_tags         text[] DEFAULT '{}',
  p_limit        int DEFAULT 50,
  p_offset       int DEFAULT 0
)
RETURNS TABLE (
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geography;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  RETURN QUERY
  SELECT
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
    ROUND(
      (ST_Distance(l.location_point, v_point) / 1000.0)::numeric, 1
    )::double precision                                        AS distance_km,
    COALESCE((
      SELECT COUNT(*)::int
      FROM   UNNEST(l.interest_tags) AS t(tag)
      WHERE  tag = ANY(p_tags)
    ), 0)                                                      AS tag_overlap,
    COUNT(lm.id)::bigint                                       AS member_count
  FROM  public.listings       l
  LEFT JOIN public.listing_members lm ON lm.listing_id = l.id
  WHERE l.status    = 'open'
    AND l.is_public = TRUE
    AND (l.expires_at IS NULL OR l.expires_at > NOW())
    AND ST_DWithin(l.location_point, v_point, (p_radius_km * 1000)::double precision)
    -- Hide listings where the calling user has been blocked
    AND NOT EXISTS (
      SELECT 1 FROM public.listing_applicants ba
      WHERE  ba.listing_id  = l.id
        AND  ba.profile_id  = auth.uid()
        AND  ba.status      = 'blocked'
    )
  GROUP BY l.id
  ORDER BY
    COALESCE((
      SELECT COUNT(*)::int FROM UNNEST(l.interest_tags) AS t(tag) WHERE tag = ANY(p_tags)
    ), 0)                                             DESC,
    ST_Distance(l.location_point, v_point)            ASC,
    l.created_at                                      DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_listings(
  double precision, double precision, int, text[], int, int
) TO authenticated, anon;
