-- ========================================
-- RPC: create_challenges_bulk
-- Creates multiple challenges atomically and inserts in-app notifications.
-- ========================================
CREATE OR REPLACE FUNCTION public.create_challenges_bulk(
  p_group_id UUID,
  p_target_ids UUID[],
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_points INT DEFAULT 1,
  p_deadline TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(challenge_id UUID, target_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_username TEXT;
  v_target_id UUID;
  v_challenge_id UUID;
  v_unique_target_ids UUID[];
  v_valid_targets_count INT;
BEGIN
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'Invalid points';
  END IF;

  IF p_target_ids IS NULL OR array_length(p_target_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No targets';
  END IF;

  SELECT ARRAY(SELECT DISTINCT t FROM unnest(p_target_ids) AS t)
  INTO v_unique_target_ids;

  IF array_length(v_unique_target_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No targets';
  END IF;

  IF v_creator_id = ANY(v_unique_target_ids) THEN
    RAISE EXCEPTION 'Cannot target yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM members m
    WHERE m.group_id = p_group_id
      AND m.profile_id = v_creator_id
  ) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  SELECT COUNT(*)
  INTO v_valid_targets_count
  FROM members m
  WHERE m.group_id = p_group_id
    AND m.profile_id = ANY(v_unique_target_ids);

  IF v_valid_targets_count <> array_length(v_unique_target_ids, 1) THEN
    RAISE EXCEPTION 'Non-member target';
  END IF;

  SELECT p.username
  INTO v_creator_username
  FROM profiles p
  WHERE p.id = v_creator_id;

  FOREACH v_target_id IN ARRAY v_unique_target_ids LOOP
    INSERT INTO challenges (
      group_id,
      creator_id,
      target_id,
      title,
      description,
      points,
      deadline
    ) VALUES (
      p_group_id,
      v_creator_id,
      v_target_id,
      p_title,
      p_description,
      p_points,
      p_deadline
    )
    RETURNING id INTO v_challenge_id;

    INSERT INTO notifications (
      profile_id,
      type,
      title,
      body,
      metadata
    ) VALUES (
      v_target_id,
      'challenge_received',
      'Nouveau défi !',
      format('%s t''a lancé le défi "%s"', COALESCE(v_creator_username, 'Quelqu''un'), p_title),
      jsonb_build_object(
        'group_id', p_group_id,
        'challenge_id', v_challenge_id
      )
    );

    challenge_id := v_challenge_id;
    target_id := v_target_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
