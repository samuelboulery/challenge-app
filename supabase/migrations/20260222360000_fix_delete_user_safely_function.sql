-- Fix delete_user_safely implementation for projects where
-- auth.admin_delete_user(uuid) is not available.
CREATE OR REPLACE FUNCTION public.delete_user_safely(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  DELETE FROM auth.users
  WHERE id = p_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'User not found',
      'user_id', p_user_id
    );
  END IF;

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
