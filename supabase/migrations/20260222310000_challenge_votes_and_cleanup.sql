-- ============================================================
-- Table: challenge_votes
-- ============================================================

CREATE TABLE challenge_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  voter_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote         TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, voter_id)
);

ALTER TABLE challenge_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes visible to group members"
  ON challenge_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = challenge_votes.challenge_id
        AND is_group_member(c.group_id)
    )
  );

CREATE POLICY "Group members can vote"
  ON challenge_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = challenge_id
        AND c.target_id != auth.uid()
        AND c.status = 'proof_submitted'
        AND is_group_member(c.group_id)
    )
  );

CREATE POLICY "Voters can update own vote"
  ON challenge_votes FOR UPDATE
  TO authenticated
  USING (voter_id = auth.uid())
  WITH CHECK (voter_id = auth.uid());

-- ============================================================
-- Drop old validate_challenge RPC (single-creator validation)
-- ============================================================

DROP FUNCTION IF EXISTS validate_challenge(UUID);

-- ============================================================
-- RPC: vote_on_challenge
-- Community-based validation with quorum (ceil(N/4), min 1)
-- ============================================================

CREATE OR REPLACE FUNCTION vote_on_challenge(
  p_challenge_id UUID,
  p_vote TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge   challenges%ROWTYPE;
  v_member_count INT;
  v_threshold    INT;
  v_approve_count INT;
  v_reject_count  INT;
  v_reward       INT;
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

  -- Count eligible members (all group members except the target)
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

    UPDATE challenges SET status = 'validated' WHERE id = p_challenge_id;

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
      'reward', v_reward
    );
  ELSIF v_reject_count >= v_threshold THEN
    UPDATE challenges SET status = 'accepted' WHERE id = p_challenge_id;

    DELETE FROM challenge_votes WHERE challenge_id = p_challenge_id;

    RETURN json_build_object(
      'status', 'rejected',
      'approvals', v_approve_count,
      'rejections', v_reject_count,
      'threshold', v_threshold
    );
  END IF;

  RETURN json_build_object(
    'status', 'pending',
    'approvals', v_approve_count,
    'rejections', v_reject_count,
    'threshold', v_threshold
  );
END;
$$;

-- ============================================================
-- Cleanup: auto-delete proof photos older than 30 days
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_proofs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proof RECORD;
  v_path  TEXT;
BEGIN
  FOR v_proof IN
    SELECT id, media_url
      FROM proofs
      WHERE media_url IS NOT NULL
        AND created_at < now() - INTERVAL '30 days'
  LOOP
    v_path := substring(v_proof.media_url from '/object/public/proofs/(.+)$');

    IF v_path IS NOT NULL THEN
      DELETE FROM storage.objects
        WHERE bucket_id = 'proofs'
          AND name = v_path;
    END IF;

    UPDATE proofs SET media_url = NULL WHERE id = v_proof.id;
  END LOOP;
END;
$$;

-- Schedule daily cleanup at 03:00 UTC (requires pg_cron extension)
-- Enable pg_cron from the Supabase Dashboard > Extensions before running.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $sql$
      SELECT cron.schedule(
        'cleanup-old-proofs',
        '0 3 * * *',
        'SELECT cleanup_old_proofs()'
      )
    $sql$;
  END IF;
END;
$$;
