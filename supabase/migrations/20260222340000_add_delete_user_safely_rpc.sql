-- Safe admin helper to delete a user and all cascading data.
-- Deletion is delegated to auth.admin_delete_user, which removes auth.users
-- and triggers ON DELETE CASCADE on profiles and related tables.
CREATE OR REPLACE FUNCTION public.delete_user_safely(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_user_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'User not found',
      'user_id', p_user_id
    );
  END IF;

  PERFORM auth.admin_delete_user(p_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'User deleted',
    'user_id', p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_safely(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_safely(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.delete_user_safely(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_user_safely(UUID) TO service_role;
