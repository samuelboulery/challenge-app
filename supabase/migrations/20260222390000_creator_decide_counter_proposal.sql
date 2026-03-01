-- ============================================================
-- RPC: creator_decide_counter_proposal
-- ============================================================

CREATE OR REPLACE FUNCTION creator_decide_counter_proposal(
  p_challenge_id UUID,
  p_action TEXT,
  p_counter_points INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_round challenge_price_rounds%ROWTYPE;
  v_validator_count INT;
  v_threshold INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('accept', 'counter') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT *
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.status <> 'negotiating' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF auth.uid() <> v_challenge.creator_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT *
  INTO v_round
  FROM challenge_price_rounds
  WHERE challenge_id = p_challenge_id
    AND resolved_at IS NULL
  ORDER BY round_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active negotiation round';
  END IF;

  SELECT COUNT(*) INTO v_validator_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  v_threshold := LEAST(2, v_validator_count);

  IF p_action = 'accept' THEN
    UPDATE challenges
    SET status = 'proposed',
        points = v_round.proposed_points
    WHERE id = p_challenge_id;

    UPDATE challenge_price_rounds
    SET outcome = 'validated',
        resolved_at = now()
    WHERE id = v_round.id;

    RETURN jsonb_build_object(
      'status', 'price_validated',
      'round', v_round.round_number,
      'proposed_points', v_round.proposed_points,
      'approvals', 0,
      'rejections', 0,
      'threshold', v_threshold
    );
  END IF;

  IF p_counter_points IS NULL OR p_counter_points <= 0 THEN
    RAISE EXCEPTION 'Invalid counter proposal';
  END IF;

  UPDATE challenge_price_rounds
  SET outcome = 'countered',
      resolved_at = now()
  WHERE id = v_round.id;

  INSERT INTO challenge_price_rounds (
    challenge_id,
    round_number,
    proposed_points,
    proposed_by,
    outcome
  )
  VALUES (
    p_challenge_id,
    v_round.round_number + 1,
    p_counter_points,
    auth.uid(),
    'pending'
  );

  RETURN jsonb_build_object(
    'status', 'countered',
    'round', v_round.round_number + 1,
    'proposed_points', p_counter_points,
    'approvals', 0,
    'rejections', 0,
    'threshold', v_threshold
  );
END;
$$;

REVOKE ALL ON FUNCTION creator_decide_counter_proposal(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_decide_counter_proposal(UUID, TEXT, INT) TO authenticated;
