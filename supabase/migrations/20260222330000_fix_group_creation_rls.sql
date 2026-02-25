-- Robust group creation through SECURITY DEFINER RPC.
-- This avoids client-facing RLS friction on INSERT ... SELECT patterns.
CREATE OR REPLACE FUNCTION public.create_group(
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.groups (name, description, created_by)
  VALUES (p_name, p_description, auth.uid())
  RETURNING id INTO v_group_id;

  -- Keep explicit owner membership for robustness. Existing trigger may also
  -- create it, so ON CONFLICT prevents duplicate key failures.
  INSERT INTO public.members (group_id, profile_id, role)
  VALUES (v_group_id, auth.uid(), 'owner')
  ON CONFLICT (group_id, profile_id) DO NOTHING;

  RETURN v_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, TEXT) TO authenticated;
