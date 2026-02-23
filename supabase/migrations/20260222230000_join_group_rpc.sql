CREATE OR REPLACE FUNCTION join_group_by_invite_code(code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  SELECT id INTO v_group_id FROM groups WHERE invite_code = code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO members (group_id, profile_id, role)
    VALUES (v_group_id, auth.uid(), 'member')
    ON CONFLICT DO NOTHING;

  RETURN v_group_id;
END;
$$;
