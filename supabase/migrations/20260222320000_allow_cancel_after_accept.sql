-- ============================================================
-- Patch: allow decline_with_penalty on accepted challenges
-- ============================================================

CREATE OR REPLACE FUNCTION decline_with_penalty(
  p_challenge_id UUID,
  p_joker_inventory_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_weekly_declines INT;
  v_week_start TIMESTAMPTZ;
  v_penalty INT;
  v_joker_item inventory%ROWTYPE;
  v_joker_shop_item shop_items%ROWTYPE;
  v_result jsonb;
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

  -- Allow both initial refusal and cancellation after acceptance.
  IF v_challenge.status NOT IN ('proposed', 'accepted') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  v_week_start := date_trunc('week', now());

  SELECT COUNT(*) INTO v_weekly_declines
    FROM challenges
    WHERE target_id = auth.uid()
      AND group_id = v_challenge.group_id
      AND status = 'cancelled'
      AND updated_at >= v_week_start;

  v_penalty := 0;

  IF v_weekly_declines >= 2 THEN
    IF p_joker_inventory_id IS NOT NULL THEN
      SELECT * INTO v_joker_item
        FROM inventory
        WHERE id = p_joker_inventory_id
          AND profile_id = auth.uid()
          AND used_at IS NULL
        FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joker not found or already used';
      END IF;

      SELECT * INTO v_joker_shop_item
        FROM shop_items
        WHERE id = v_joker_item.shop_item_id
          AND item_type = 'joker'
          AND group_id = v_challenge.group_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid joker for this group';
      END IF;

      UPDATE inventory
        SET used_at = now(), used_on_challenge_id = p_challenge_id
        WHERE id = p_joker_inventory_id;

      v_result := jsonb_build_object(
        'penalty', 0,
        'joker_used', true,
        'free_declines_remaining', 0
      );
    ELSE
      v_penalty := GREATEST(1, v_challenge.points / 2);

      UPDATE profiles
        SET total_points = GREATEST(0, total_points - v_penalty)
        WHERE id = auth.uid();

      INSERT INTO transactions (profile_id, amount, type, challenge_id)
        VALUES (auth.uid(), -v_penalty, 'challenge_penalty', p_challenge_id);

      v_result := jsonb_build_object(
        'penalty', v_penalty,
        'joker_used', false,
        'free_declines_remaining', 0
      );
    END IF;
  ELSE
    v_result := jsonb_build_object(
      'penalty', 0,
      'joker_used', false,
      'free_declines_remaining', 2 - v_weekly_declines - 1
    );
  END IF;

  UPDATE challenges
    SET status = 'cancelled'
    WHERE id = p_challenge_id;

  RETURN v_result;
END;
$$;
