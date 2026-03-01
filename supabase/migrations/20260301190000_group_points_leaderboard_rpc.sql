-- Group-scoped points leaderboard based on transactions linked to the group.

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
     EXISTS (
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

REVOKE ALL ON FUNCTION public.get_group_points_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_points_leaderboard(UUID) TO authenticated;
