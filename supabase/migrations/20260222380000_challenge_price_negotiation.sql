-- ============================================================
-- Challenge price negotiation (pre-acceptance)
-- ============================================================

CREATE TABLE IF NOT EXISTS challenge_price_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  round_number    INT NOT NULL CHECK (round_number > 0),
  proposed_points INT NOT NULL CHECK (proposed_points > 0),
  proposed_by     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  outcome         TEXT CHECK (outcome IN ('pending', 'validated', 'countered', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  UNIQUE (challenge_id, round_number)
);

CREATE TABLE IF NOT EXISTS challenge_price_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES challenge_price_rounds(id) ON DELETE CASCADE,
  voter_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote            TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
  proposed_points INT CHECK (proposed_points IS NULL OR proposed_points > 0),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, voter_id)
);

ALTER TABLE challenge_price_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_price_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Price rounds visible to group members"
  ON challenge_price_rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM challenges c
      WHERE c.id = challenge_price_rounds.challenge_id
        AND is_group_member(c.group_id)
    )
  );

CREATE POLICY "Validators can create counter rounds"
  ON challenge_price_rounds FOR INSERT
  TO authenticated
  WITH CHECK (
    proposed_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM challenges c
      JOIN members m ON m.group_id = c.group_id
      WHERE c.id = challenge_id
        AND c.status = 'negotiating'
        AND m.profile_id = auth.uid()
        AND auth.uid() <> c.creator_id
        AND auth.uid() <> c.target_id
    )
  );

CREATE POLICY "Price votes visible to group members"
  ON challenge_price_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM challenge_price_rounds r
      JOIN challenges c ON c.id = r.challenge_id
      WHERE r.id = challenge_price_votes.round_id
        AND is_group_member(c.group_id)
    )
  );

CREATE POLICY "Validators can vote on challenge price"
  ON challenge_price_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM challenge_price_rounds r
      JOIN challenges c ON c.id = r.challenge_id
      JOIN members m ON m.group_id = c.group_id
      WHERE r.id = round_id
        AND c.status = 'negotiating'
        AND m.profile_id = auth.uid()
        AND auth.uid() <> c.creator_id
        AND auth.uid() <> c.target_id
    )
  );

CREATE POLICY "Validators can update own challenge price vote"
  ON challenge_price_votes FOR UPDATE
  TO authenticated
  USING (voter_id = auth.uid())
  WITH CHECK (voter_id = auth.uid());

-- ============================================================
-- RPC: start_challenge_price_negotiation
-- ============================================================

CREATE OR REPLACE FUNCTION start_challenge_price_negotiation(
  p_challenge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_validator_count INT;
  v_threshold INT;
  v_existing_round UUID;
BEGIN
  SELECT *
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  SELECT COUNT(*) INTO v_validator_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  v_threshold := LEAST(2, v_validator_count);

  IF v_threshold = 0 THEN
    UPDATE challenges
      SET status = 'proposed'
      WHERE id = p_challenge_id;

    RETURN jsonb_build_object(
      'status', 'price_validated',
      'required_approvals', 0,
      'validators_count', v_validator_count,
      'points', v_challenge.points
    );
  END IF;

  SELECT id
  INTO v_existing_round
  FROM challenge_price_rounds
  WHERE challenge_id = p_challenge_id
    AND resolved_at IS NULL
  ORDER BY round_number DESC
  LIMIT 1;

  IF v_existing_round IS NULL THEN
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
      v_challenge.creator_id,
      'pending'
    );
  END IF;

  UPDATE challenges
    SET status = 'negotiating'
    WHERE id = p_challenge_id;

  RETURN jsonb_build_object(
    'status', 'negotiating',
    'required_approvals', v_threshold,
    'validators_count', v_validator_count
  );
END;
$$;

-- ============================================================
-- RPC: vote_challenge_price
-- ============================================================

CREATE OR REPLACE FUNCTION vote_challenge_price(
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
  v_validator_count INT;
  v_threshold INT;
  v_approvals INT;
  v_rejections INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_vote NOT IN ('approve', 'reject') THEN
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
    RAISE EXCEPTION 'Not allowed to validate price';
  END IF;

  IF NOT is_group_member(v_challenge.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
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

  IF p_counter_points IS NOT NULL THEN
    IF p_counter_points <= 0 THEN
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
      'proposed_points', p_counter_points
    );
  END IF;

  SELECT COUNT(*) INTO v_validator_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  v_threshold := LEAST(2, v_validator_count);

  SELECT
    COUNT(*) FILTER (WHERE vote = 'approve'),
    COUNT(*) FILTER (WHERE vote = 'reject')
  INTO v_approvals, v_rejections
  FROM challenge_price_votes
  WHERE round_id = v_round.id;

  IF v_approvals >= v_threshold THEN
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
      'approvals', v_approvals,
      'rejections', v_rejections,
      'threshold', v_threshold,
      'points', v_round.proposed_points
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'pending',
    'approvals', v_approvals,
    'rejections', v_rejections,
    'threshold', v_threshold,
    'round', v_round.round_number,
    'proposed_points', v_round.proposed_points
  );
END;
$$;

-- ============================================================
-- RPC: cancel_challenge_by_creator
-- ============================================================

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

  IF v_challenge.status <> 'negotiating' THEN
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

-- ============================================================
-- RPC: get_challenge_price_state
-- ============================================================

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

  SELECT COUNT(*) INTO v_validator_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  v_threshold := LEAST(2, v_validator_count);

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
    COUNT(*) FILTER (WHERE vote = 'approve'),
    COUNT(*) FILTER (WHERE vote = 'reject')
  INTO v_approvals, v_rejections
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
    'threshold', v_threshold,
    'validators_count', v_validator_count,
    'user_vote', v_user_vote,
    'votes', v_votes
  );
END;
$$;

REVOKE ALL ON FUNCTION start_challenge_price_negotiation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION vote_challenge_price(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_challenge_by_creator(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_challenge_price_state(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION start_challenge_price_negotiation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION vote_challenge_price(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_challenge_by_creator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_challenge_price_state(UUID) TO authenticated;
