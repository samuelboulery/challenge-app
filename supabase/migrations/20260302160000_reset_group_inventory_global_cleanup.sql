-- Ensure reset_group_data_admin also removes global items bought in the group.
CREATE OR REPLACE FUNCTION public.reset_group_data_admin(p_group_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_paths TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.members
    WHERE group_id = p_group_id
      AND profile_id = auth.uid()
      AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = p_group_id) THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  SELECT COALESCE(
    array_agg(path),
    ARRAY[]::TEXT[]
  )
  INTO v_paths
  FROM (
    SELECT DISTINCT substring(p.media_url from '/object/public/proofs/(.+)$') AS path
    FROM public.proofs p
    JOIN public.challenges c ON c.id = p.challenge_id
    WHERE c.group_id = p_group_id
      AND p.media_url IS NOT NULL
  ) proof_paths
  WHERE path IS NOT NULL;

  WITH group_transactions AS (
    SELECT t.profile_id, t.amount
    FROM public.transactions t
    WHERE t.group_id = p_group_id
       OR EXISTS (
        SELECT 1
        FROM public.challenges c
        WHERE c.id = t.challenge_id
          AND c.group_id = p_group_id
      ) OR EXISTS (
        SELECT 1
        FROM public.shop_items si
        WHERE si.id = t.shop_item_id
          AND si.group_id = p_group_id
      )
  ),
  deltas AS (
    SELECT profile_id, COALESCE(SUM(amount), 0) AS total_delta
    FROM group_transactions
    GROUP BY profile_id
  )
  UPDATE public.profiles p
  SET total_points = GREATEST(0, p.total_points - d.total_delta)
  FROM deltas d
  WHERE p.id = d.profile_id;

  DELETE FROM public.transactions t
  WHERE t.group_id = p_group_id
     OR EXISTS (
      SELECT 1
      FROM public.challenges c
      WHERE c.id = t.challenge_id
        AND c.group_id = p_group_id
  ) OR EXISTS (
      SELECT 1
      FROM public.shop_items si
      WHERE si.id = t.shop_item_id
        AND si.group_id = p_group_id
  );

  DELETE FROM public.inventory i
  USING public.shop_items si
  WHERE i.shop_item_id = si.id
    AND si.group_id = p_group_id;

  DELETE FROM public.inventory
  WHERE purchased_group_id = p_group_id;

  DELETE FROM public.challenges
  WHERE group_id = p_group_id;

  RETURN v_paths;
END;
$$;
