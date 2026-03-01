-- ============================================================
-- Proof retries: max 2 attempts total, then rejected + penalty
-- ============================================================

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS proof_rejections_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.vote_on_challenge(
  p_challenge_id UUID,
  p_vote TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_member_count INT;
  v_threshold INT;
  v_approve_count INT;
  v_reject_count INT;
  v_reward INT;
  v_penalty INT;
BEGIN
  SELECT * INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.status != 'proof_submitted' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF v_challenge.target_id = auth.uid() THEN
    RAISE EXCEPTION 'Target cannot vote';
  END IF;

  IF NOT is_group_member(v_challenge.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  IF p_vote NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid vote value';
  END IF;

  INSERT INTO challenge_votes (challenge_id, voter_id, vote)
    VALUES (p_challenge_id, auth.uid(), p_vote)
    ON CONFLICT (challenge_id, voter_id)
    DO UPDATE SET vote = EXCLUDED.vote, created_at = now();

  SELECT COUNT(*) INTO v_member_count
  FROM members
  WHERE group_id = v_challenge.group_id
    AND profile_id != v_challenge.target_id;

  v_threshold := GREATEST(1, CEIL(v_member_count::NUMERIC / 4));

  SELECT
    COUNT(*) FILTER (WHERE vote = 'approve'),
    COUNT(*) FILTER (WHERE vote = 'reject')
  INTO v_approve_count, v_reject_count
  FROM challenge_votes
  WHERE challenge_id = p_challenge_id;

  IF v_approve_count >= v_threshold THEN
    v_reward := v_challenge.points;
    IF v_challenge.booster_inventory_id IS NOT NULL THEN
      v_reward := v_reward * 2;
    END IF;

    UPDATE challenges
      SET status = 'validated',
          proof_rejections_count = v_challenge.proof_rejections_count
      WHERE id = p_challenge_id;

    UPDATE profiles
      SET total_points = total_points + v_reward
      WHERE id = v_challenge.target_id;

    INSERT INTO transactions (profile_id, amount, type, challenge_id)
      VALUES (v_challenge.target_id, v_reward, 'challenge_reward', p_challenge_id);

    RETURN json_build_object(
      'status', 'validated',
      'approvals', v_approve_count,
      'rejections', v_reject_count,
      'threshold', v_threshold,
      'reward', v_reward,
      'proof_rejections_count', v_challenge.proof_rejections_count,
      'retries_left', GREATEST(0, 1 - v_challenge.proof_rejections_count)
    );
  ELSIF v_reject_count >= v_threshold THEN
    IF v_challenge.proof_rejections_count >= 1 THEN
      v_penalty := GREATEST(1, v_challenge.points / 2);

      UPDATE challenges
        SET status = 'rejected'
        WHERE id = p_challenge_id;

      UPDATE profiles
        SET total_points = GREATEST(0, total_points - v_penalty)
        WHERE id = v_challenge.target_id;

      INSERT INTO transactions (profile_id, amount, type, challenge_id)
        VALUES (v_challenge.target_id, -v_penalty, 'challenge_penalty', p_challenge_id);

      DELETE FROM challenge_votes WHERE challenge_id = p_challenge_id;

      RETURN json_build_object(
        'status', 'rejected',
        'approvals', v_approve_count,
        'rejections', v_reject_count,
        'threshold', v_threshold,
        'penalty', v_penalty,
        'proof_rejections_count', v_challenge.proof_rejections_count + 1,
        'retries_left', 0
      );
    ELSE
      UPDATE challenges
        SET status = 'accepted',
            proof_rejections_count = proof_rejections_count + 1
        WHERE id = p_challenge_id;

      DELETE FROM challenge_votes WHERE challenge_id = p_challenge_id;

      RETURN json_build_object(
        'status', 'retry_allowed',
        'approvals', v_approve_count,
        'rejections', v_reject_count,
        'threshold', v_threshold,
        'proof_rejections_count', v_challenge.proof_rejections_count + 1,
        'retries_left', 1
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'status', 'pending',
    'approvals', v_approve_count,
    'rejections', v_reject_count,
    'threshold', v_threshold,
    'proof_rejections_count', v_challenge.proof_rejections_count,
    'retries_left', GREATEST(0, 1 - v_challenge.proof_rejections_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_challenge_after_failed_proof(
  p_challenge_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_penalty INT;
BEGIN
  SELECT * INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.target_id != auth.uid() THEN
    RAISE EXCEPTION 'Not the target';
  END IF;

  IF v_challenge.status != 'accepted' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF v_challenge.proof_rejections_count < 1 THEN
    RAISE EXCEPTION 'No failed proof yet';
  END IF;

  v_penalty := GREATEST(1, v_challenge.points / 2);

  UPDATE challenges
    SET status = 'rejected'
    WHERE id = p_challenge_id;

  UPDATE profiles
    SET total_points = GREATEST(0, total_points - v_penalty)
    WHERE id = v_challenge.target_id;

  INSERT INTO transactions (profile_id, amount, type, challenge_id)
    VALUES (v_challenge.target_id, -v_penalty, 'challenge_penalty', p_challenge_id);

  RETURN json_build_object(
    'status', 'rejected',
    'penalty', v_penalty,
    'proof_rejections_count', v_challenge.proof_rejections_count,
    'retries_left', 0
  );
END;
$$;
