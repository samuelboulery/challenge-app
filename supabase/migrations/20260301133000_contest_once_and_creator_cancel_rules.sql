-- ============================================================
-- Rules update:
-- 1) Target can contest only once per challenge
-- 2) Creator can cancel at any time except proof validation phase
-- ============================================================

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS contested_once BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION start_challenge_contestation(
  p_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_voter_count INT;
  v_threshold INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.status <> 'proposed' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF auth.uid() <> v_challenge.target_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_challenge.contested_once THEN
    RAISE EXCEPTION 'Already contested';
  END IF;

  SELECT COUNT(*)
  INTO v_voter_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  IF v_voter_count = 0 THEN
    RAISE EXCEPTION 'No eligible voters';
  END IF;

  v_threshold := LEAST(3, v_voter_count);

  UPDATE challenges
  SET status = 'negotiating',
      contested_once = TRUE
  WHERE id = p_challenge_id;

  UPDATE challenge_price_rounds
  SET outcome = 'cancelled',
      resolved_at = now()
  WHERE challenge_id = p_challenge_id
    AND resolved_at IS NULL;

  INSERT INTO challenge_price_rounds (
    challenge_id,
    round_number,
    proposed_points,
    proposed_by,
    outcome
  )
  VALUES (
    p_challenge_id,
    1,
    v_challenge.points,
    auth.uid(),
    'pending'
  );

  RETURN jsonb_build_object(
    'status', 'contestation_started',
    'round', 1,
    'proposed_points', v_challenge.points,
    'threshold', v_threshold,
    'validators_count', v_voter_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION cancel_challenge_by_creator(
  p_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.creator_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_challenge.status = 'proof_submitted' THEN
    RAISE EXCEPTION 'Proof validation pending';
  END IF;

  IF v_challenge.status IN ('validated', 'rejected', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE challenges
  SET status = 'cancelled'
  WHERE id = p_challenge_id;

  UPDATE challenge_price_rounds
  SET outcome = 'cancelled',
      resolved_at = now()
  WHERE challenge_id = p_challenge_id
    AND resolved_at IS NULL;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;
