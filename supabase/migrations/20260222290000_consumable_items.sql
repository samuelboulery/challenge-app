-- ============================================================
-- Consumable Items System
-- ============================================================

-- 1. Add item_type to shop_items
ALTER TABLE shop_items
  ADD COLUMN item_type TEXT NOT NULL DEFAULT 'custom'
  CHECK (item_type IN ('custom', 'joker', 'booster', 'voleur'));

-- 2. Add consumption tracking to inventory
ALTER TABLE inventory
  ADD COLUMN used_at TIMESTAMPTZ,
  ADD COLUMN used_on_challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL;

-- 3. Add booster link to challenges
ALTER TABLE challenges
  ADD COLUMN booster_inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL;

-- ============================================================
-- RPC: decline_with_penalty
-- Handles challenge decline with weekly free limit + joker + penalty
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
  -- Lock and fetch challenge
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

  IF v_challenge.status != 'proposed' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  -- Calculate start of current week (Monday)
  v_week_start := date_trunc('week', now());

  -- Count declines this week in this group
  SELECT COUNT(*) INTO v_weekly_declines
    FROM challenges
    WHERE target_id = auth.uid()
      AND group_id = v_challenge.group_id
      AND status = 'cancelled'
      AND updated_at >= v_week_start;

  v_penalty := 0;

  IF v_weekly_declines >= 2 THEN
    -- Past free limit
    IF p_joker_inventory_id IS NOT NULL THEN
      -- Validate and consume the joker
      SELECT * INTO v_joker_item
        FROM inventory
        WHERE id = p_joker_inventory_id
          AND profile_id = auth.uid()
          AND used_at IS NULL
        FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Joker not found or already used';
      END IF;

      -- Verify it's actually a joker in the same group
      SELECT * INTO v_joker_shop_item
        FROM shop_items
        WHERE id = v_joker_item.shop_item_id
          AND item_type = 'joker'
          AND group_id = v_challenge.group_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid joker for this group';
      END IF;

      -- Consume the joker
      UPDATE inventory
        SET used_at = now(), used_on_challenge_id = p_challenge_id
        WHERE id = p_joker_inventory_id;

      v_result := jsonb_build_object(
        'penalty', 0,
        'joker_used', true,
        'free_declines_remaining', 0
      );
    ELSE
      -- Apply penalty: 50% of challenge points
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

  -- Cancel the challenge
  UPDATE challenges
    SET status = 'cancelled'
    WHERE id = p_challenge_id;

  RETURN v_result;
END;
$$;

-- ============================================================
-- RPC: use_voleur
-- Steals 30% of the leader's points (or 2nd if buyer is leader)
-- ============================================================

CREATE OR REPLACE FUNCTION use_voleur(p_inventory_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv inventory%ROWTYPE;
  v_shop shop_items%ROWTYPE;
  v_victim_id UUID;
  v_victim_points INT;
  v_stolen INT;
  v_victim_username TEXT;
BEGIN
  -- Lock and fetch inventory item
  SELECT * INTO v_inv
    FROM inventory
    WHERE id = p_inventory_id
      AND profile_id = auth.uid()
      AND used_at IS NULL
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already used';
  END IF;

  -- Verify it's a voleur
  SELECT * INTO v_shop
    FROM shop_items
    WHERE id = v_inv.shop_item_id
      AND item_type = 'voleur';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a voleur item';
  END IF;

  -- Find the leader in the group (exclude buyer if they are #1)
  SELECT m.profile_id, p.total_points INTO v_victim_id, v_victim_points
    FROM members m
    JOIN profiles p ON p.id = m.profile_id
    WHERE m.group_id = v_shop.group_id
      AND m.profile_id != auth.uid()
    ORDER BY p.total_points DESC
    LIMIT 1;

  IF v_victim_id IS NULL THEN
    RAISE EXCEPTION 'No valid target found';
  END IF;

  -- Calculate 30% steal
  v_stolen := GREATEST(1, (v_victim_points * 30) / 100);

  -- Deduct from victim
  UPDATE profiles
    SET total_points = GREATEST(0, total_points - v_stolen)
    WHERE id = v_victim_id;

  -- Credit to buyer
  UPDATE profiles
    SET total_points = total_points + v_stolen
    WHERE id = auth.uid();

  -- Record transactions
  INSERT INTO transactions (profile_id, amount, type, shop_item_id)
    VALUES (v_victim_id, -v_stolen, 'challenge_penalty', v_inv.shop_item_id);

  INSERT INTO transactions (profile_id, amount, type, shop_item_id)
    VALUES (auth.uid(), v_stolen, 'bonus', v_inv.shop_item_id);

  -- Mark as used
  UPDATE inventory
    SET used_at = now()
    WHERE id = p_inventory_id;

  -- Get victim username for result
  SELECT username INTO v_victim_username
    FROM profiles WHERE id = v_victim_id;

  RETURN jsonb_build_object(
    'stolen', v_stolen,
    'victim_id', v_victim_id,
    'victim_username', v_victim_username
  );
END;
$$;

-- ============================================================
-- Update validate_challenge to handle booster (double points)
-- ============================================================

CREATE OR REPLACE FUNCTION validate_challenge(p_challenge_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_reward INT;
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

  -- Base reward, doubled if booster is active
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
END;
$$;
