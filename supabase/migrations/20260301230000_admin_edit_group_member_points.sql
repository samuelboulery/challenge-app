-- ============================================================
-- Admin can edit member points per group
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_group_id
  ON public.transactions(group_id);

CREATE OR REPLACE FUNCTION public.adjust_member_group_points(
  p_group_id UUID,
  p_member_id UUID,
  p_new_points INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_member BOOLEAN;
  v_current_group_points INT;
  v_delta INT;
  v_current_total_points INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_points < 0 THEN
    RAISE EXCEPTION 'Invalid points value';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.members
    WHERE group_id = p_group_id
      AND profile_id = auth.uid()
      AND role IN ('owner', 'admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.members
    WHERE group_id = p_group_id
      AND profile_id = p_member_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Target user is not a member of this group';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)::INT
    INTO v_current_group_points
    FROM public.transactions t
    WHERE t.profile_id = p_member_id
      AND (
        t.group_id = p_group_id
        OR EXISTS (
          SELECT 1
          FROM public.challenges c
          WHERE c.id = t.challenge_id
            AND c.group_id = p_group_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.shop_items si
          WHERE si.id = t.shop_item_id
            AND si.group_id = p_group_id
        )
      );

  v_delta := p_new_points - v_current_group_points;

  IF v_delta = 0 THEN
    RETURN jsonb_build_object(
      'previous_points', v_current_group_points,
      'new_points', p_new_points,
      'delta', 0
    );
  END IF;

  SELECT total_points
    INTO v_current_total_points
    FROM public.profiles
    WHERE id = p_member_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_current_total_points + v_delta < 0 THEN
    RAISE EXCEPTION 'Resulting total_points would be negative';
  END IF;

  UPDATE public.profiles
  SET total_points = total_points + v_delta
  WHERE id = p_member_id;

  INSERT INTO public.transactions (profile_id, amount, type, group_id)
  VALUES (
    p_member_id,
    v_delta,
    CASE WHEN v_delta >= 0 THEN 'bonus'::transaction_type ELSE 'challenge_penalty'::transaction_type END,
    p_group_id
  );

  RETURN jsonb_build_object(
    'previous_points', v_current_group_points,
    'new_points', p_new_points,
    'delta', v_delta
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_points_leaderboard(p_group_id UUID)
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  group_points INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  SELECT
    m.profile_id,
    COALESCE(p.username, 'Utilisateur') AS username,
    COALESCE(SUM(t.amount), 0)::INT AS group_points
  FROM public.members m
  LEFT JOIN public.profiles p
    ON p.id = m.profile_id
  LEFT JOIN public.transactions t
    ON t.profile_id = m.profile_id
   AND (
     t.group_id = p_group_id
     OR EXISTS (
       SELECT 1
       FROM public.challenges c
       WHERE c.id = t.challenge_id
         AND c.group_id = p_group_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.shop_items si
       WHERE si.id = t.shop_item_id
         AND si.group_id = p_group_id
     )
   )
  WHERE m.group_id = p_group_id
  GROUP BY m.profile_id, p.username
  ORDER BY group_points DESC, username ASC;
END;
$$;

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

  DELETE FROM public.challenges
  WHERE group_id = p_group_id;

  RETURN v_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_member_group_points(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_member_group_points(UUID, UUID, INT) TO authenticated;
