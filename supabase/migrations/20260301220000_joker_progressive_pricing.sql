-- ============================================================
-- Progressive joker pricing per user/group (weekly reset)
-- Rule: effective_price = ceil(base_price * 1.3^n)
-- where n = number of joker purchases this week in the same group
-- ============================================================

CREATE OR REPLACE FUNCTION purchase_item(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price INT;
  v_effective_price INT;
  v_stock INT;
  v_group_id UUID;
  v_item_type TEXT;
  v_balance INT;
  v_week_start TIMESTAMPTZ;
  v_weekly_joker_purchases INT;
BEGIN
  SELECT price, stock, group_id, item_type
    INTO v_base_price, v_stock, v_group_id, v_item_type
    FROM shop_items
    WHERE id = p_item_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  IF NOT is_group_member(v_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Item out of stock';
  END IF;

  -- Lock buyer profile to keep balance and pricing reads serialized per user.
  SELECT total_points INTO v_balance
    FROM profiles
    WHERE id = auth.uid()
    FOR UPDATE;

  v_effective_price := v_base_price;

  IF v_item_type = 'joker' THEN
    -- Monday 00:00 UTC of current week
    v_week_start := date_trunc('week', timezone('UTC', now())) AT TIME ZONE 'UTC';

    SELECT COUNT(*)::INT
      INTO v_weekly_joker_purchases
      FROM inventory i
      JOIN shop_items si ON si.id = i.shop_item_id
      WHERE i.profile_id = auth.uid()
        AND si.group_id = v_group_id
        AND si.item_type = 'joker'
        AND i.purchased_at >= v_week_start;

    v_effective_price := CEIL(v_base_price * POWER(1.3::NUMERIC, v_weekly_joker_purchases::NUMERIC))::INT;
  END IF;

  IF v_balance < v_effective_price THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE profiles
    SET total_points = total_points - v_effective_price
    WHERE id = auth.uid();

  UPDATE shop_items
    SET stock = stock - 1
    WHERE id = p_item_id AND stock IS NOT NULL;

  INSERT INTO inventory (profile_id, shop_item_id)
    VALUES (auth.uid(), p_item_id);

  INSERT INTO transactions (profile_id, amount, type, shop_item_id)
    VALUES (auth.uid(), -v_effective_price, 'shop_purchase', p_item_id);
END;
$$;

CREATE OR REPLACE FUNCTION get_my_group_shop_effective_prices(p_group_id UUID)
RETURNS TABLE (
  item_id UUID,
  effective_price INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start TIMESTAMPTZ;
  v_weekly_joker_purchases INT;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  -- Monday 00:00 UTC of current week
  v_week_start := date_trunc('week', timezone('UTC', now())) AT TIME ZONE 'UTC';

  SELECT COUNT(*)::INT
    INTO v_weekly_joker_purchases
    FROM inventory i
    JOIN shop_items si ON si.id = i.shop_item_id
    WHERE i.profile_id = auth.uid()
      AND si.group_id = p_group_id
      AND si.item_type = 'joker'
      AND i.purchased_at >= v_week_start;

  RETURN QUERY
  SELECT
    si.id AS item_id,
    CASE
      WHEN si.item_type = 'joker'
        THEN CEIL(si.price * POWER(1.3::NUMERIC, v_weekly_joker_purchases::NUMERIC))::INT
      ELSE si.price
    END AS effective_price
  FROM shop_items si
  WHERE si.group_id = p_group_id;
END;
$$;
