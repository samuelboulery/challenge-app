CREATE OR REPLACE FUNCTION purchase_item(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price    INT;
  v_stock    INT;
  v_group_id UUID;
  v_balance  INT;
BEGIN
  SELECT price, stock, group_id
    INTO v_price, v_stock, v_group_id
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

  SELECT total_points INTO v_balance
    FROM profiles
    WHERE id = auth.uid()
    FOR UPDATE;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE profiles
    SET total_points = total_points - v_price
    WHERE id = auth.uid();

  UPDATE shop_items
    SET stock = stock - 1
    WHERE id = p_item_id AND stock IS NOT NULL;

  INSERT INTO inventory (profile_id, shop_item_id)
    VALUES (auth.uid(), p_item_id);

  INSERT INTO transactions (profile_id, amount, type, shop_item_id)
    VALUES (auth.uid(), -v_price, 'shop_purchase', p_item_id);
END;
$$;
