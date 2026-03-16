-- Atomic increment for group_volume to prevent TOCTOU race conditions
CREATE OR REPLACE FUNCTION public.increment_group_volume(row_id uuid, amount numeric)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE volume_tracking
  SET group_volume = COALESCE(group_volume, 0) + amount,
      updated_at = now()
  WHERE id = row_id;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.increment_group_volume(uuid, numeric) TO service_role;
