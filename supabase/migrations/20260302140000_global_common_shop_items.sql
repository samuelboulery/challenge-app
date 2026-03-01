-- ============================================================
-- Global common shop items + per-group enablement
-- ============================================================

CREATE TABLE IF NOT EXISTS public.global_shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL CHECK (price > 0),
  stock INT,
  is_active_global BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_enabled_items (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  global_item_id UUID NOT NULL REFERENCES public.global_shop_items(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, global_item_id)
);

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS global_shop_item_id UUID REFERENCES public.global_shop_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchased_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

ALTER TABLE public.inventory
  ALTER COLUMN shop_item_id DROP NOT NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS global_shop_item_id UUID REFERENCES public.global_shop_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_global_item ON public.inventory(global_shop_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchased_group ON public.inventory(purchased_group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_global_item ON public.transactions(global_shop_item_id);
CREATE INDEX IF NOT EXISTS idx_group_enabled_items_enabled ON public.group_enabled_items(group_id, enabled);

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_item_reference_check;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_item_reference_check
  CHECK (shop_item_id IS NOT NULL OR global_shop_item_id IS NOT NULL);

-- Migrate common (non-custom, non-item_49_3) items into global catalog.
INSERT INTO public.global_shop_items (item_type, name, description, price, stock, is_active_global)
SELECT DISTINCT ON (si.item_type)
  si.item_type,
  si.name,
  si.description,
  si.price,
  si.stock,
  true
FROM public.shop_items si
WHERE si.item_type <> 'custom'
  AND si.item_type <> 'item_49_3'
ORDER BY si.item_type, si.updated_at DESC NULLS LAST, si.created_at DESC NULLS LAST, si.id DESC
ON CONFLICT (item_type) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  stock = EXCLUDED.stock,
  is_active_global = EXCLUDED.is_active_global,
  updated_at = now();

-- Enable all global items for all groups by default.
INSERT INTO public.group_enabled_items (group_id, global_item_id, enabled)
SELECT g.id, gi.id, true
FROM public.groups g
CROSS JOIN public.global_shop_items gi
ON CONFLICT (group_id, global_item_id) DO NOTHING;

-- Move existing inventory references for common items.
WITH common_shop AS (
  SELECT si.id AS shop_item_id, si.group_id, gi.id AS global_item_id
  FROM public.shop_items si
  JOIN public.global_shop_items gi ON gi.item_type = si.item_type
  WHERE si.item_type <> 'custom'
    AND si.item_type <> 'item_49_3'
)
UPDATE public.inventory i
SET
  global_shop_item_id = cs.global_item_id,
  purchased_group_id = COALESCE(i.purchased_group_id, cs.group_id)
FROM common_shop cs
WHERE i.shop_item_id = cs.shop_item_id;

-- Ensure custom / 49.3 inventory has purchased_group_id.
UPDATE public.inventory i
SET purchased_group_id = si.group_id
FROM public.shop_items si
WHERE i.shop_item_id = si.id
  AND i.purchased_group_id IS NULL;

-- Move existing transaction references for common items.
WITH common_shop AS (
  SELECT si.id AS shop_item_id, gi.id AS global_item_id
  FROM public.shop_items si
  JOIN public.global_shop_items gi ON gi.item_type = si.item_type
  WHERE si.item_type <> 'custom'
    AND si.item_type <> 'item_49_3'
)
UPDATE public.transactions t
SET global_shop_item_id = cs.global_item_id
FROM common_shop cs
WHERE t.shop_item_id = cs.shop_item_id;

-- Keep only custom + item_49_3 in shop_items.
DELETE FROM public.shop_items
WHERE item_type <> 'custom'
  AND item_type <> 'item_49_3';

ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_item_type_check;

ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_item_type_check
  CHECK (item_type IN ('custom', 'item_49_3'));

ALTER TABLE public.global_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_enabled_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global items readable by authenticated users" ON public.global_shop_items;
CREATE POLICY "Global items readable by authenticated users"
  ON public.global_shop_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Group enabled items readable by group members" ON public.group_enabled_items;
CREATE POLICY "Group enabled items readable by group members"
  ON public.group_enabled_items FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "Group enabled items managed by group admins" ON public.group_enabled_items;
CREATE POLICY "Group enabled items managed by group admins"
  ON public.group_enabled_items FOR ALL
  TO authenticated
  USING (public.is_group_admin(group_id))
  WITH CHECK (public.is_group_admin(group_id));

CREATE OR REPLACE FUNCTION public.seed_special_shop_items(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep only seasonal 49.3 per group in local shop_items.
  INSERT INTO public.shop_items (group_id, name, description, price, stock, item_type)
  VALUES (
    p_group_id,
    '49.3',
    'Validation automatique de ta propre preuve sans vote du tribunal (usage unique)',
    999999,
    0,
    'item_49_3'
  )
  ON CONFLICT DO NOTHING;

  -- Ensure every global common item is enabled for this group by default.
  INSERT INTO public.group_enabled_items (group_id, global_item_id, enabled)
  SELECT p_group_id, gi.id, true
  FROM public.global_shop_items gi
  ON CONFLICT (group_id, global_item_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_item(
  p_item_id UUID,
  p_group_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_custom_item public.shop_items%ROWTYPE;
  v_global_item public.global_shop_items%ROWTYPE;
  v_group_id UUID;
  v_price INT;
  v_stock INT;
  v_balance INT;
  v_week_start TIMESTAMPTZ;
  v_weekly_joker_purchases INT;
BEGIN
  -- 1) Try custom/local item first.
  SELECT *
  INTO v_custom_item
  FROM public.shop_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF FOUND THEN
    v_group_id := v_custom_item.group_id;
    v_price := v_custom_item.price;
    v_stock := v_custom_item.stock;

    IF NOT public.is_group_member(v_group_id) THEN
      RAISE EXCEPTION 'Not a member of this group';
    END IF;

    IF v_stock IS NOT NULL AND v_stock <= 0 THEN
      RAISE EXCEPTION 'Item out of stock';
    END IF;

    SELECT total_points INTO v_balance
    FROM public.profiles
    WHERE id = auth.uid()
    FOR UPDATE;

    IF v_balance < v_price THEN
      RAISE EXCEPTION 'Insufficient points';
    END IF;

    UPDATE public.profiles
    SET total_points = total_points - v_price
    WHERE id = auth.uid();

    UPDATE public.shop_items
    SET stock = stock - 1
    WHERE id = v_custom_item.id
      AND stock IS NOT NULL;

    INSERT INTO public.inventory (profile_id, shop_item_id, purchased_group_id)
    VALUES (auth.uid(), v_custom_item.id, v_group_id);

    INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, group_id)
    VALUES (auth.uid(), -v_price, 'shop_purchase', v_custom_item.id, v_group_id);

    RETURN;
  END IF;

  -- 2) Global/common item path.
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group id is required for global item purchase';
  END IF;

  SELECT *
  INTO v_global_item
  FROM public.global_shop_items
  WHERE id = p_item_id
    AND is_active_global = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  v_group_id := p_group_id;

  IF NOT public.is_group_member(v_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_enabled_items gei
    WHERE gei.group_id = v_group_id
      AND gei.global_item_id = v_global_item.id
      AND gei.enabled = true
  ) THEN
    RAISE EXCEPTION 'Item disabled for this group';
  END IF;

  IF public.is_profile_effect_active(v_group_id, auth.uid(), 'handcuffs') THEN
    RAISE EXCEPTION 'Buyer is handcuffed';
  END IF;

  IF public.is_profile_effect_active(v_group_id, auth.uid(), 'embargo') THEN
    RAISE EXCEPTION 'Buyer is embargoed';
  END IF;

  IF v_global_item.stock IS NOT NULL AND v_global_item.stock <= 0 THEN
    RAISE EXCEPTION 'Item out of stock';
  END IF;

  v_price := v_global_item.price;

  IF v_global_item.item_type = 'joker' THEN
    v_week_start := date_trunc('week', timezone('UTC', now())) AT TIME ZONE 'UTC';
    SELECT COUNT(*)::INT
    INTO v_weekly_joker_purchases
    FROM public.inventory i
    JOIN public.global_shop_items gi ON gi.id = i.global_shop_item_id
    WHERE i.profile_id = auth.uid()
      AND i.purchased_group_id = v_group_id
      AND gi.item_type = 'joker'
      AND i.purchased_at >= v_week_start;

    v_price := CEIL(v_global_item.price * POWER(1.3::NUMERIC, v_weekly_joker_purchases::NUMERIC))::INT;
  END IF;

  SELECT total_points INTO v_balance
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE public.profiles
  SET total_points = total_points - v_price
  WHERE id = auth.uid();

  UPDATE public.global_shop_items
  SET stock = stock - 1
  WHERE id = v_global_item.id
    AND stock IS NOT NULL;

  INSERT INTO public.inventory (profile_id, global_shop_item_id, purchased_group_id)
  VALUES (auth.uid(), v_global_item.id, v_group_id);

  INSERT INTO public.transactions (profile_id, amount, type, global_shop_item_id, group_id)
  VALUES (auth.uid(), -v_price, 'shop_purchase', v_global_item.id, v_group_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_group_shop_effective_prices(p_group_id UUID)
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
  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  v_week_start := date_trunc('week', timezone('UTC', now())) AT TIME ZONE 'UTC';
  SELECT COUNT(*)::INT
  INTO v_weekly_joker_purchases
  FROM public.inventory i
  JOIN public.global_shop_items gi ON gi.id = i.global_shop_item_id
  WHERE i.profile_id = auth.uid()
    AND i.purchased_group_id = p_group_id
    AND gi.item_type = 'joker'
    AND i.purchased_at >= v_week_start;

  RETURN QUERY
  SELECT
    gi.id AS item_id,
    CASE
      WHEN gi.item_type = 'joker'
        THEN CEIL(gi.price * POWER(1.3::NUMERIC, v_weekly_joker_purchases::NUMERIC))::INT
      ELSE gi.price
    END AS effective_price
  FROM public.global_shop_items gi
  JOIN public.group_enabled_items gei
    ON gei.global_item_id = gi.id
   AND gei.group_id = p_group_id
   AND gei.enabled = true
  WHERE gi.is_active_global = true

  UNION ALL

  SELECT
    si.id AS item_id,
    si.price AS effective_price
  FROM public.shop_items si
  WHERE si.group_id = p_group_id
    AND si.item_type <> 'item_49_3';
END;
$$;

CREATE OR REPLACE FUNCTION public.use_voleur(p_inventory_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.inventory%ROWTYPE;
  v_shop public.shop_items%ROWTYPE;
  v_global public.global_shop_items%ROWTYPE;
  v_group_id UUID;
  v_victim_id UUID;
  v_victim_points INT;
  v_stolen INT;
  v_victim_username TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id
    AND profile_id = auth.uid()
    AND used_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already used';
  END IF;

  v_group_id := v_inv.purchased_group_id;

  IF v_inv.global_shop_item_id IS NOT NULL THEN
    SELECT * INTO v_global
    FROM public.global_shop_items
    WHERE id = v_inv.global_shop_item_id;

    IF NOT FOUND OR v_global.item_type <> 'voleur' THEN
      RAISE EXCEPTION 'Not a voleur item';
    END IF;
  ELSE
    SELECT * INTO v_shop
    FROM public.shop_items
    WHERE id = v_inv.shop_item_id
      AND item_type = 'voleur';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not a voleur item';
    END IF;

    v_group_id := COALESCE(v_group_id, v_shop.group_id);
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Missing group context for voleur';
  END IF;

  SELECT m.profile_id, p.total_points
  INTO v_victim_id, v_victim_points
  FROM public.members m
  JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.group_id = v_group_id
    AND m.profile_id <> auth.uid()
  ORDER BY p.total_points DESC
  LIMIT 1;

  IF v_victim_id IS NULL THEN
    RAISE EXCEPTION 'No valid target found';
  END IF;

  v_stolen := GREATEST(1, (v_victim_points * 30) / 100);

  UPDATE public.profiles
  SET total_points = GREATEST(0, total_points - v_stolen)
  WHERE id = v_victim_id;

  UPDATE public.profiles
  SET total_points = total_points + v_stolen
  WHERE id = auth.uid();

  INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, global_shop_item_id, group_id)
  VALUES (v_victim_id, -v_stolen, 'challenge_penalty', v_inv.shop_item_id, v_inv.global_shop_item_id, v_group_id);

  INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, global_shop_item_id, group_id)
  VALUES (auth.uid(), v_stolen, 'bonus', v_inv.shop_item_id, v_inv.global_shop_item_id, v_group_id);

  UPDATE public.inventory
  SET used_at = now()
  WHERE id = p_inventory_id;

  SELECT username INTO v_victim_username
  FROM public.profiles
  WHERE id = v_victim_id;

  RETURN jsonb_build_object(
    'stolen', v_stolen,
    'victim_id', v_victim_id,
    'victim_username', v_victim_username
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_hidden_joker_counts(p_group_id UUID)
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  jokers_available INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;
  IF NOT public.is_profile_effect_active(p_group_id, auth.uid(), 'snitch') THEN
    RAISE EXCEPTION 'Snitch effect not active';
  END IF;

  RETURN QUERY
  SELECT
    m.profile_id,
    COALESCE(p.username, 'Utilisateur') AS username,
    COUNT(i.id)::INT AS jokers_available
  FROM public.members m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  LEFT JOIN public.inventory i
    ON i.profile_id = m.profile_id
   AND i.used_at IS NULL
   AND i.purchased_group_id = p_group_id
  LEFT JOIN public.global_shop_items gi
    ON gi.id = i.global_shop_item_id
   AND gi.item_type = 'joker'
  LEFT JOIN public.shop_items si
    ON si.id = i.shop_item_id
   AND si.item_type = 'joker'
  WHERE m.group_id = p_group_id
    AND (gi.id IS NOT NULL OR si.id IS NOT NULL)
  GROUP BY m.profile_id, p.username
  ORDER BY jokers_available DESC, username ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_inventory_item_effect(
  p_inventory_id UUID,
  p_challenge_id UUID DEFAULT NULL,
  p_target_profile_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_shop_item public.shop_items%ROWTYPE;
  v_global_item public.global_shop_items%ROWTYPE;
  v_item_type TEXT;
  v_group_id UUID;
  v_challenge public.challenges%ROWTYPE;
  v_alt_challenge_id UUID;
  v_random_target UUID;
  v_bundle_id UUID;
  v_points INT;
  v_title TEXT;
  v_description TEXT;
  v_deadline TIMESTAMPTZ;
  v_leader UUID;
  v_leader_points INT;
  v_theft INT;
  v_bottom RECORD;
  v_split INT;
  v_remainder INT;
  v_cancelled_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id
    AND profile_id = auth.uid()
    AND used_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or already used';
  END IF;

  v_group_id := v_inventory.purchased_group_id;

  IF v_inventory.global_shop_item_id IS NOT NULL THEN
    SELECT * INTO v_global_item
    FROM public.global_shop_items
    WHERE id = v_inventory.global_shop_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shop item not found';
    END IF;
    v_item_type := v_global_item.item_type;
  ELSE
    SELECT * INTO v_shop_item
    FROM public.shop_items
    WHERE id = v_inventory.shop_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shop item not found';
    END IF;
    v_item_type := v_shop_item.item_type;
    v_group_id := COALESCE(v_group_id, v_shop_item.group_id);
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Missing item group context';
  END IF;
  IF NOT public.is_group_member(v_group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  IF p_challenge_id IS NOT NULL THEN
    SELECT *
    INTO v_challenge
    FROM public.challenges
    WHERE id = p_challenge_id
      AND group_id = v_group_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Challenge not found';
    END IF;
  END IF;

  IF v_item_type = 'gilet_pare_balles' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Invalid challenge for bulletproof vest';
    END IF;
    UPDATE public.challenges
    SET points = GREATEST(1, CEIL(points / 2.0))
    WHERE id = v_challenge.id;

  ELSIF v_item_type = 'mode_fantome' THEN
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_group_id, auth.uid(), auth.uid(), 'ghost_mode', now() + interval '24 hours');

  ELSIF v_item_type = 'miroir_magique' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid challenge for magic mirror';
    END IF;
    UPDATE public.challenges
    SET creator_id = auth.uid(),
        target_id = v_challenge.creator_id,
        status = 'proposed'
    WHERE id = v_challenge.id;

  ELSIF v_item_type = 'patate_chaude' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid challenge for hot potato';
    END IF;
    SELECT m.profile_id
    INTO v_random_target
    FROM public.members m
    WHERE m.group_id = v_challenge.group_id
      AND m.profile_id <> v_challenge.creator_id
      AND m.profile_id <> v_challenge.target_id
      AND NOT public.is_profile_effect_active(v_challenge.group_id, m.profile_id, 'ghost_mode')
    ORDER BY random()
    LIMIT 1;
    IF v_random_target IS NULL THEN
      RAISE EXCEPTION 'No transfer target found';
    END IF;
    UPDATE public.challenges
    SET target_id = v_random_target
    WHERE id = v_challenge.id;

  ELSIF v_item_type = 'cinquante_cinquante' THEN
    IF p_challenge_id IS NULL OR v_challenge.creator_id <> auth.uid() OR v_challenge.status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid challenge for 50/50';
    END IF;
    IF v_challenge.challenge_bundle_id IS NOT NULL THEN
      RAISE EXCEPTION '50/50 already active on this challenge';
    END IF;
    v_bundle_id := gen_random_uuid();
    v_title := COALESCE(NULLIF(p_payload->>'title', ''), v_challenge.title || ' (Option 2)');
    v_description := COALESCE(NULLIF(p_payload->>'description', ''), v_challenge.description);
    v_points := COALESCE(NULLIF((p_payload->>'points')::INT, 0), v_challenge.points);
    v_deadline := COALESCE((p_payload->>'deadline')::timestamptz, v_challenge.deadline);

    INSERT INTO public.challenges (
      group_id, creator_id, target_id, title, description, points, status, deadline,
      challenge_bundle_id, bundle_choice_required
    ) VALUES (
      v_challenge.group_id, v_challenge.creator_id, v_challenge.target_id, v_title, v_description,
      GREATEST(1, v_points), 'proposed', v_deadline, v_bundle_id, true
    )
    RETURNING id INTO v_alt_challenge_id;

    UPDATE public.challenges
    SET challenge_bundle_id = v_bundle_id, bundle_choice_required = true
    WHERE id = v_challenge.id;

  ELSIF v_item_type = 'menottes' THEN
    IF p_target_profile_id IS NULL OR p_target_profile_id = auth.uid() THEN
      RAISE EXCEPTION 'Invalid target for handcuffs';
    END IF;
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_group_id, auth.uid(), p_target_profile_id, 'handcuffs', now() + interval '12 hours');

  ELSIF v_item_type = 'surcharge' THEN
    IF p_challenge_id IS NULL OR v_challenge.creator_id <> auth.uid() OR v_challenge.status <> 'negotiating' THEN
      RAISE EXCEPTION 'Invalid challenge for surcharge';
    END IF;
    UPDATE public.challenges
    SET points = GREATEST(1, CEIL(points * 1.2))
    WHERE id = v_challenge.id;
    UPDATE public.challenge_price_rounds
    SET proposed_points = GREATEST(1, CEIL(proposed_points * 1.2))
    WHERE challenge_id = v_challenge.id
      AND resolved_at IS NULL;

  ELSIF v_item_type = 'sniper' THEN
    IF p_challenge_id IS NULL OR v_challenge.creator_id <> auth.uid() OR v_challenge.status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid challenge for sniper';
    END IF;
    UPDATE public.challenges
    SET no_negotiation = true
    WHERE id = v_challenge.id;

  ELSIF v_item_type = 'embargo' THEN
    IF p_target_profile_id IS NULL OR p_target_profile_id = auth.uid() THEN
      RAISE EXCEPTION 'Invalid target for embargo';
    END IF;
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_group_id, auth.uid(), p_target_profile_id, 'embargo', now() + interval '3 days');

  ELSIF v_item_type = 'roulette_russe' THEN
    v_title := NULLIF(p_payload->>'title', '');
    v_description := NULLIF(p_payload->>'description', '');
    v_points := COALESCE(NULLIF((p_payload->>'points')::INT, 0), 100);
    v_deadline := COALESCE((p_payload->>'deadline')::timestamptz, NULL);
    IF v_title IS NULL THEN
      RAISE EXCEPTION 'Roulette challenge title required';
    END IF;
    SELECT m.profile_id
    INTO v_random_target
    FROM public.members m
    WHERE m.group_id = v_group_id
      AND NOT public.is_profile_effect_active(v_group_id, m.profile_id, 'ghost_mode')
    ORDER BY random()
    LIMIT 1;
    IF v_random_target IS NULL THEN
      RAISE EXCEPTION 'No eligible target for roulette';
    END IF;
    INSERT INTO public.challenges (
      group_id, creator_id, target_id, title, description, points, status, deadline
    ) VALUES (
      v_group_id, auth.uid(), v_random_target, v_title, v_description, GREATEST(1, v_points), 'proposed', v_deadline
    )
    RETURNING id INTO v_alt_challenge_id;

  ELSIF v_item_type = 'robin_des_bois' THEN
    SELECT m.profile_id, p.total_points
    INTO v_leader, v_leader_points
    FROM public.members m
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.group_id = v_group_id
    ORDER BY p.total_points DESC
    LIMIT 1
    FOR UPDATE;
    IF v_leader IS NULL THEN
      RAISE EXCEPTION 'No leader found';
    END IF;
    v_theft := GREATEST(1, FLOOR(v_leader_points * 0.1));
    UPDATE public.profiles
    SET total_points = GREATEST(0, total_points - v_theft)
    WHERE id = v_leader;
    v_split := FLOOR(v_theft / 3.0);
    v_remainder := v_theft - (v_split * 3);
    FOR v_bottom IN
      SELECT m.profile_id
      FROM public.members m
      JOIN public.profiles p ON p.id = m.profile_id
      WHERE m.group_id = v_group_id
      ORDER BY p.total_points ASC
      LIMIT 3
    LOOP
      UPDATE public.profiles
      SET total_points = total_points + v_split + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END
      WHERE id = v_bottom.profile_id;
      INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, global_shop_item_id, group_id)
      VALUES (
        v_bottom.profile_id,
        v_split + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END,
        'bonus',
        v_inventory.shop_item_id,
        v_inventory.global_shop_item_id,
        v_group_id
      );
      IF v_remainder > 0 THEN
        v_remainder := v_remainder - 1;
      END IF;
    END LOOP;
    INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, global_shop_item_id, group_id)
    VALUES (v_leader, -v_theft, 'challenge_penalty', v_inventory.shop_item_id, v_inventory.global_shop_item_id, v_group_id);

  ELSIF v_item_type = 'amnesie' THEN
    SELECT c.id
    INTO v_cancelled_id
    FROM public.challenges c
    WHERE c.group_id = v_group_id
      AND c.status IN ('proposed', 'negotiating', 'accepted', 'in_progress', 'proof_submitted')
    ORDER BY c.created_at DESC
    LIMIT 1
    FOR UPDATE;
    IF v_cancelled_id IS NULL THEN
      RAISE EXCEPTION 'No active challenge to cancel';
    END IF;
    UPDATE public.challenges
    SET status = 'cancelled'
    WHERE id = v_cancelled_id;

  ELSIF v_item_type = 'mouchard' THEN
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_group_id, auth.uid(), auth.uid(), 'snitch', now() + interval '1 hour');

  ELSIF v_item_type = 'assurance' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Invalid challenge for insurance';
    END IF;
    UPDATE public.challenges
    SET insurance_enabled = true
    WHERE id = v_challenge.id;

  ELSIF v_item_type = 'quitte_ou_double' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Invalid challenge for quitte ou double';
    END IF;
    UPDATE public.challenges
    SET double_or_nothing_requested = true,
        double_or_nothing_approved = false
    WHERE id = v_challenge.id;
    DELETE FROM public.quit_or_double_votes WHERE challenge_id = v_challenge.id;

  ELSE
    RAISE EXCEPTION 'Unsupported item type';
  END IF;

  UPDATE public.inventory
  SET used_at = now(), used_on_challenge_id = p_challenge_id
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'ok', true,
    'item_type', v_item_type,
    'challenge_id', p_challenge_id,
    'alt_challenge_id', v_alt_challenge_id
  );
END;
$$;

