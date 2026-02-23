CREATE OR REPLACE FUNCTION validate_challenge(p_challenge_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_challenge
    FROM challenges
    WHERE id = p_challenge_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.creator_id != auth.uid() THEN
    RAISE EXCEPTION 'Not the creator';
  END IF;

  IF v_challenge.status != 'proof_submitted' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE challenges SET status = 'validated' WHERE id = p_challenge_id;

  UPDATE profiles
    SET total_points = total_points + v_challenge.points
    WHERE id = v_challenge.target_id;

  INSERT INTO transactions (profile_id, amount, type, challenge_id)
    VALUES (v_challenge.target_id, v_challenge.points, 'challenge_reward', p_challenge_id);
END;
$$;
