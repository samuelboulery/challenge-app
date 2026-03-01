-- ============================================================
-- Contestation: add "keep as-is" vote option
-- ============================================================

ALTER TABLE challenge_price_votes
  DROP CONSTRAINT IF EXISTS challenge_price_votes_vote_check;

ALTER TABLE challenge_price_votes
  ADD CONSTRAINT challenge_price_votes_vote_check
  CHECK (vote IN ('approve', 'reject', 'counter', 'cancel', 'keep'));

CREATE OR REPLACE FUNCTION vote_challenge_contestation(
  p_challenge_id UUID,
  p_vote TEXT,
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
  v_voter_count INT;
  v_threshold INT;
  v_counter_votes INT;
  v_cancel_votes INT;
  v_keep_votes INT;
  v_final_points INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_vote NOT IN ('counter', 'cancel', 'keep') THEN
    RAISE EXCEPTION 'Invalid vote';
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

  IF auth.uid() = v_challenge.creator_id OR auth.uid() = v_challenge.target_id THEN
    RAISE EXCEPTION 'Not allowed to vote contestation';
  END IF;

  IF NOT is_group_member(v_challenge.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
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

  IF p_vote = 'counter' AND (p_counter_points IS NULL OR p_counter_points <= 0) THEN
    RAISE EXCEPTION 'Invalid counter proposal';
  END IF;

  IF p_vote IN ('cancel', 'keep') AND p_counter_points IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid counter proposal';
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

  INSERT INTO challenge_price_votes (
    round_id,
    voter_id,
    vote,
    proposed_points
  )
  VALUES (
    v_round.id,
    auth.uid(),
    p_vote,
    p_counter_points
  )
  ON CONFLICT (round_id, voter_id)
  DO UPDATE SET
    vote = EXCLUDED.vote,
    proposed_points = EXCLUDED.proposed_points,
    created_at = now();

  SELECT COUNT(*) INTO v_counter_votes
  FROM challenge_price_votes
  WHERE round_id = v_round.id
    AND vote = 'counter';

  SELECT COUNT(*) INTO v_keep_votes
  FROM challenge_price_votes
  WHERE round_id = v_round.id
    AND vote = 'keep';

  SELECT COUNT(*) INTO v_cancel_votes
  FROM challenge_price_votes
  WHERE round_id = v_round.id
    AND vote = 'cancel';

  -- First threshold reached wins. Since votes are processed one-by-one,
  -- we prioritize the option represented by the current vote.
  IF p_vote = 'cancel' AND v_cancel_votes >= v_threshold THEN
    UPDATE challenges
    SET status = 'cancelled'
    WHERE id = p_challenge_id;

    UPDATE challenge_price_rounds
    SET outcome = 'cancelled',
        resolved_at = now()
    WHERE id = v_round.id;

    RETURN jsonb_build_object(
      'status', 'cancelled_by_contestation',
      'approvals', v_counter_votes,
      'keeps', v_keep_votes,
      'rejections', v_cancel_votes,
      'threshold', v_threshold,
      'round', v_round.round_number
    );
  END IF;

  IF p_vote = 'keep' AND v_keep_votes >= v_threshold THEN
    UPDATE challenges
    SET status = 'proposed',
        points = v_round.proposed_points
    WHERE id = p_challenge_id;

    UPDATE challenge_price_rounds
    SET outcome = 'validated',
        resolved_at = now()
    WHERE id = v_round.id;

    RETURN jsonb_build_object(
      'status', 'kept_by_contestation',
      'approvals', v_counter_votes,
      'keeps', v_keep_votes,
      'rejections', v_cancel_votes,
      'threshold', v_threshold,
      'round', v_round.round_number,
      'points', v_round.proposed_points
    );
  END IF;

  IF p_vote = 'counter' AND v_counter_votes >= v_threshold THEN
    SELECT ROUND(AVG(proposed_points)::NUMERIC)::INT
    INTO v_final_points
    FROM challenge_price_votes
    WHERE round_id = v_round.id
      AND vote = 'counter'
      AND proposed_points IS NOT NULL;

    UPDATE challenges
    SET status = 'proposed',
        points = v_final_points
    WHERE id = p_challenge_id;

    UPDATE challenge_price_rounds
    SET outcome = 'validated',
        resolved_at = now(),
        proposed_points = v_final_points
    WHERE id = v_round.id;

    RETURN jsonb_build_object(
      'status', 'counter_applied',
      'approvals', v_counter_votes,
      'keeps', v_keep_votes,
      'rejections', v_cancel_votes,
      'threshold', v_threshold,
      'round', v_round.round_number,
      'points', v_final_points
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'pending',
    'approvals', v_counter_votes,
    'keeps', v_keep_votes,
    'rejections', v_cancel_votes,
    'threshold', v_threshold,
    'round', v_round.round_number,
    'proposed_points', v_round.proposed_points
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_challenge_price_state(
  p_challenge_id UUID
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
  v_approvals INT;
  v_rejections INT;
  v_keeps INT;
  v_user_vote TEXT;
  v_votes JSONB;
BEGIN
  SELECT *
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF NOT is_group_member(v_challenge.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  SELECT COUNT(*)
  INTO v_validator_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  v_threshold := LEAST(3, v_validator_count);

  SELECT *
  INTO v_round
  FROM challenge_price_rounds
  WHERE challenge_id = p_challenge_id
    AND resolved_at IS NULL
  ORDER BY round_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'challenge_status', v_challenge.status,
      'validators_count', v_validator_count,
      'threshold', v_threshold
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE vote = 'counter'),
    COUNT(*) FILTER (WHERE vote = 'cancel'),
    COUNT(*) FILTER (WHERE vote = 'keep')
  INTO v_approvals, v_rejections, v_keeps
  FROM challenge_price_votes
  WHERE round_id = v_round.id;

  SELECT vote
  INTO v_user_vote
  FROM challenge_price_votes
  WHERE round_id = v_round.id
    AND voter_id = auth.uid();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'voter_id', v.voter_id,
        'username', p.username,
        'vote', v.vote
      )
      ORDER BY v.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_votes
  FROM challenge_price_votes v
  JOIN profiles p ON p.id = v.voter_id
  WHERE v.round_id = v_round.id;

  RETURN jsonb_build_object(
    'challenge_status', v_challenge.status,
    'round_id', v_round.id,
    'round', v_round.round_number,
    'proposed_points', v_round.proposed_points,
    'proposed_by', v_round.proposed_by,
    'approvals', COALESCE(v_approvals, 0),
    'rejections', COALESCE(v_rejections, 0),
    'keeps', COALESCE(v_keeps, 0),
    'threshold', v_threshold,
    'validators_count', v_validator_count,
    'user_vote', v_user_vote,
    'votes', v_votes
  );
END;
$$;
