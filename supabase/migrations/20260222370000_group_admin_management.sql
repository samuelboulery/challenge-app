-- Admin management helpers for groups.
-- Allows group admins to delete a group and transfer ownership safely.

CREATE OR REPLACE FUNCTION public.delete_group_admin(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  DELETE FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(
  p_group_id UUID,
  p_new_owner_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_exists BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.members
    WHERE group_id = p_group_id
      AND profile_id = p_new_owner_id
  ) INTO v_target_exists;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Target user is not a member of this group';
  END IF;

  UPDATE public.members
  SET role = 'admin'
  WHERE group_id = p_group_id
    AND role = 'owner';

  UPDATE public.members
  SET role = 'owner'
  WHERE group_id = p_group_id
    AND profile_id = p_new_owner_id;

  UPDATE public.groups
  SET created_by = p_new_owner_id
  WHERE id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_group_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_group_ownership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_group_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(UUID, UUID) TO authenticated;
