-- ============================================================
-- Store expansion MVP: 16 new items + effect engine
-- ============================================================

ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_item_type_check;

ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_item_type_check
  CHECK (
    item_type IN (
      'custom',
      'joker',
      'booster',
      'voleur',
      'item_49_3',
      'gilet_pare_balles',
      'mode_fantome',
      'miroir_magique',
      'patate_chaude',
      'cinquante_cinquante',
      'menottes',
      'surcharge',
      'sniper',
      'embargo',
      'roulette_russe',
      'robin_des_bois',
      'amnesie',
      'mouchard',
      'assurance',
      'quitte_ou_double'
    )
  );

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS no_negotiation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS double_or_nothing_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS double_or_nothing_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS challenge_bundle_id UUID,
  ADD COLUMN IF NOT EXISTS bundle_choice_required BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.profile_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  source_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effect_type TEXT NOT NULL CHECK (
    effect_type IN ('ghost_mode', 'handcuffs', 'embargo', 'snitch')
  ),
  active_until TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_effects_lookup
  ON public.profile_effects(group_id, target_profile_id, effect_type, active_until DESC);

CREATE TABLE IF NOT EXISTS public.quit_or_double_votes (
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approve BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, voter_id)
);

ALTER TABLE public.profile_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quit_or_double_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profile effects readable by group members" ON public.profile_effects;
CREATE POLICY "Profile effects readable by group members"
  ON public.profile_effects
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "Quit or double votes readable by group members" ON public.quit_or_double_votes;
CREATE POLICY "Quit or double votes readable by group members"
  ON public.quit_or_double_votes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.challenges c
      WHERE c.id = challenge_id
        AND public.is_group_member(c.group_id)
    )
  );

CREATE OR REPLACE FUNCTION public.is_profile_effect_active(
  p_group_id UUID,
  p_profile_id UUID,
  p_effect_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_effects pe
    WHERE pe.group_id = p_group_id
      AND pe.target_profile_id = p_profile_id
      AND pe.effect_type = p_effect_type
      AND pe.active_until > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.seed_special_shop_items(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shop_items (group_id, name, description, price, stock, item_type)
  VALUES
    (p_group_id, 'Joker', 'Esquive un défi sans perdre de points (après tes 2 refus gratuits par semaine)', 100, NULL, 'joker'),
    (p_group_id, 'Booster x2', 'Double les points gagnés sur le prochain défi accepté', 150, NULL, 'booster'),
    (p_group_id, 'Voleur', 'Vole 30% des points du leader du groupe (effet immédiat)', 500, NULL, 'voleur'),
    (p_group_id, 'Gilet Pare-Balles', 'Réduit l''intensité d''un défi: points divisés par 2', 120, NULL, 'gilet_pare_balles'),
    (p_group_id, 'Mode Fantôme', 'Tu disparais des cibles possibles pendant 24h', 250, NULL, 'mode_fantome'),
    (p_group_id, 'Miroir Magique', 'Renvoie instantanément le défi à son envoyeur', 250, NULL, 'miroir_magique'),
    (p_group_id, 'Patate Chaude', 'Transfère le défi à un autre membre (hors envoyeur)', 120, NULL, 'patate_chaude'),
    (p_group_id, 'Le 50/50', 'Crée une seconde option de défi: la cible doit en choisir une', 120, NULL, 'cinquante_cinquante'),
    (p_group_id, 'Les Menottes', 'La cible ne peut plus envoyer de défi ni acheter pendant 12h', 50, NULL, 'menottes'),
    (p_group_id, 'La Surcharge', 'Ajoute +20% de points pendant une contestation', 250, NULL, 'surcharge'),
    (p_group_id, 'Le Sniper', 'Le défi ne peut plus être contesté', 120, NULL, 'sniper'),
    (p_group_id, 'L''Embargo', 'Bloque l''accès boutique de la cible pendant 3 jours', 500, NULL, 'embargo'),
    (p_group_id, 'Roulette Russe', 'Crée un défi pour une cible aléatoire du groupe (toi inclus)', 50, NULL, 'roulette_russe'),
    (p_group_id, 'Robin des Bois', 'Prend 10% du leader et redistribue aux 3 derniers', 400, NULL, 'robin_des_bois'),
    (p_group_id, 'Amnésie', 'Annule le dernier défi actif envoyé dans le groupe', 250, NULL, 'amnesie'),
    (p_group_id, 'Le Mouchard', 'Révèle le stock exact de jokers des membres pendant 1h', 120, NULL, 'mouchard'),
    (p_group_id, 'L''Assurance', 'En cas d''échec de preuve, évite la perte de points', 120, NULL, 'assurance'),
    (p_group_id, 'Quitte ou Double', 'Parie tes points: x2 si réussi, -montant du défi si échec', 1, NULL, 'quitte_ou_double')
  ON CONFLICT DO NOTHING;
END;
$$;

DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN SELECT id FROM public.groups LOOP
    PERFORM public.seed_special_shop_items(g.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_challenges_bulk(
  p_group_id UUID,
  p_target_ids UUID[],
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_points INT DEFAULT 1,
  p_deadline TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(challenge_id UUID, target_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_username TEXT;
  v_target_id UUID;
  v_challenge_id UUID;
  v_unique_target_ids UUID[];
  v_valid_targets_count INT;
BEGIN
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'Invalid points';
  END IF;

  IF p_target_ids IS NULL OR array_length(p_target_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No targets';
  END IF;

  IF public.is_profile_effect_active(p_group_id, v_creator_id, 'handcuffs') THEN
    RAISE EXCEPTION 'Creator is handcuffed';
  END IF;

  SELECT ARRAY(SELECT DISTINCT t FROM unnest(p_target_ids) AS t)
  INTO v_unique_target_ids;

  IF array_length(v_unique_target_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No targets';
  END IF;

  IF v_creator_id = ANY(v_unique_target_ids) THEN
    RAISE EXCEPTION 'Cannot target yourself';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_unique_target_ids) AS t(target_id)
    WHERE public.is_profile_effect_active(p_group_id, t.target_id, 'ghost_mode')
  ) THEN
    RAISE EXCEPTION 'Target in ghost mode';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND m.profile_id = v_creator_id
  ) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  SELECT COUNT(*)
  INTO v_valid_targets_count
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND m.profile_id = ANY(v_unique_target_ids);

  IF v_valid_targets_count <> array_length(v_unique_target_ids, 1) THEN
    RAISE EXCEPTION 'Non-member target';
  END IF;

  SELECT p.username
  INTO v_creator_username
  FROM public.profiles p
  WHERE p.id = v_creator_id;

  FOREACH v_target_id IN ARRAY v_unique_target_ids LOOP
    INSERT INTO public.challenges (
      group_id,
      creator_id,
      target_id,
      title,
      description,
      points,
      deadline
    ) VALUES (
      p_group_id,
      v_creator_id,
      v_target_id,
      p_title,
      p_description,
      p_points,
      p_deadline
    )
    RETURNING id INTO v_challenge_id;

    INSERT INTO public.notifications (
      profile_id,
      type,
      title,
      body,
      metadata
    ) VALUES (
      v_target_id,
      'challenge_received',
      'Nouveau défi !',
      format('%s t''a lancé le défi "%s"', COALESCE(v_creator_username, 'Quelqu''un'), p_title),
      jsonb_build_object(
        'group_id', p_group_id,
        'challenge_id', v_challenge_id
      )
    );

    challenge_id := v_challenge_id;
    target_id := v_target_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_item(p_item_id UUID)
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
    FROM public.shop_items
    WHERE id = p_item_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  IF v_item_type = 'item_49_3' THEN
    RAISE EXCEPTION 'Item not purchasable';
  END IF;

  IF public.is_profile_effect_active(v_group_id, auth.uid(), 'handcuffs') THEN
    RAISE EXCEPTION 'Buyer is handcuffed';
  END IF;

  IF public.is_profile_effect_active(v_group_id, auth.uid(), 'embargo') THEN
    RAISE EXCEPTION 'Buyer is embargoed';
  END IF;

  IF NOT public.is_group_member(v_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Item out of stock';
  END IF;

  SELECT total_points
    INTO v_balance
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  v_effective_price := v_base_price;

  IF v_item_type = 'joker' THEN
    v_week_start := date_trunc('week', timezone('UTC', now())) AT TIME ZONE 'UTC';

    SELECT COUNT(*)::INT
      INTO v_weekly_joker_purchases
    FROM public.inventory i
    JOIN public.shop_items si ON si.id = i.shop_item_id
    WHERE i.profile_id = auth.uid()
      AND si.group_id = v_group_id
      AND si.item_type = 'joker'
      AND i.purchased_at >= v_week_start;

    v_effective_price := CEIL(v_base_price * POWER(1.3::NUMERIC, v_weekly_joker_purchases::NUMERIC))::INT;
  END IF;

  IF v_balance < v_effective_price THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE public.profiles
  SET total_points = total_points - v_effective_price
  WHERE id = auth.uid();

  UPDATE public.shop_items
  SET stock = stock - 1
  WHERE id = p_item_id
    AND stock IS NOT NULL;

  INSERT INTO public.inventory (profile_id, shop_item_id)
  VALUES (auth.uid(), p_item_id);

  INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, group_id)
  VALUES (auth.uid(), -v_effective_price, 'shop_purchase', p_item_id, v_group_id);
END;
$$;

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
  v_challenge public.challenges%ROWTYPE;
  v_member_count INT;
  v_threshold INT;
  v_approve_count INT;
  v_reject_count INT;
  v_reward INT;
  v_penalty INT;
BEGIN
  SELECT * INTO v_challenge
  FROM public.challenges
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

  IF NOT public.is_group_member(v_challenge.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  IF p_vote NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid vote value';
  END IF;

  INSERT INTO public.challenge_votes (challenge_id, voter_id, vote)
    VALUES (p_challenge_id, auth.uid(), p_vote)
    ON CONFLICT (challenge_id, voter_id)
    DO UPDATE SET vote = EXCLUDED.vote, created_at = now();

  SELECT COUNT(*) INTO v_member_count
  FROM public.members
  WHERE group_id = v_challenge.group_id
    AND profile_id != v_challenge.target_id;

  v_threshold := GREATEST(1, CEIL(v_member_count::NUMERIC / 4));

  SELECT
    COUNT(*) FILTER (WHERE vote = 'approve'),
    COUNT(*) FILTER (WHERE vote = 'reject')
  INTO v_approve_count, v_reject_count
  FROM public.challenge_votes
  WHERE challenge_id = p_challenge_id;

  IF v_approve_count >= v_threshold THEN
    v_reward := v_challenge.points;
    IF v_challenge.booster_inventory_id IS NOT NULL THEN
      v_reward := v_reward * 2;
    END IF;
    IF v_challenge.double_or_nothing_approved THEN
      v_reward := v_reward * 2;
    END IF;

    UPDATE public.challenges
      SET status = 'validated',
          proof_rejections_count = v_challenge.proof_rejections_count
      WHERE id = p_challenge_id;

    UPDATE public.profiles
      SET total_points = total_points + v_reward
      WHERE id = v_challenge.target_id;

    INSERT INTO public.transactions (profile_id, amount, type, challenge_id, group_id)
      VALUES (v_challenge.target_id, v_reward, 'challenge_reward', p_challenge_id, v_challenge.group_id);

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
      IF v_challenge.insurance_enabled THEN
        v_penalty := 0;
      ELSIF v_challenge.double_or_nothing_approved THEN
        v_penalty := GREATEST(1, v_challenge.points);
      ELSE
        v_penalty := GREATEST(1, v_challenge.points / 2);
      END IF;

      UPDATE public.challenges
        SET status = 'rejected'
        WHERE id = p_challenge_id;

      IF v_penalty > 0 THEN
        UPDATE public.profiles
          SET total_points = GREATEST(0, total_points - v_penalty)
          WHERE id = v_challenge.target_id;

        INSERT INTO public.transactions (profile_id, amount, type, challenge_id, group_id)
          VALUES (v_challenge.target_id, -v_penalty, 'challenge_penalty', p_challenge_id, v_challenge.group_id);
      END IF;

      DELETE FROM public.challenge_votes WHERE challenge_id = p_challenge_id;

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
      UPDATE public.challenges
        SET status = 'accepted',
            proof_rejections_count = proof_rejections_count + 1
        WHERE id = p_challenge_id;

      DELETE FROM public.challenge_votes WHERE challenge_id = p_challenge_id;

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
  v_challenge public.challenges%ROWTYPE;
  v_penalty INT;
BEGIN
  SELECT * INTO v_challenge
  FROM public.challenges
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

  IF v_challenge.insurance_enabled THEN
    v_penalty := 0;
  ELSIF v_challenge.double_or_nothing_approved THEN
    v_penalty := GREATEST(1, v_challenge.points);
  ELSE
    v_penalty := GREATEST(1, v_challenge.points / 2);
  END IF;

  UPDATE public.challenges
    SET status = 'rejected'
    WHERE id = p_challenge_id;

  IF v_penalty > 0 THEN
    UPDATE public.profiles
      SET total_points = GREATEST(0, total_points - v_penalty)
      WHERE id = v_challenge.target_id;

    INSERT INTO public.transactions (profile_id, amount, type, challenge_id, group_id)
      VALUES (v_challenge.target_id, -v_penalty, 'challenge_penalty', p_challenge_id, v_challenge.group_id);
  END IF;

  RETURN json_build_object(
    'status', 'rejected',
    'penalty', v_penalty,
    'proof_rejections_count', v_challenge.proof_rejections_count,
    'retries_left', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_quitte_ou_double(
  p_challenge_id UUID,
  p_approve BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_validator_count INT;
  v_threshold INT;
  v_approvals INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_challenge
  FROM public.challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF NOT public.is_group_member(v_challenge.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  IF auth.uid() = v_challenge.creator_id OR auth.uid() = v_challenge.target_id THEN
    RAISE EXCEPTION 'Not allowed to vote';
  END IF;

  IF NOT v_challenge.double_or_nothing_requested THEN
    RAISE EXCEPTION 'Quitte ou double not requested';
  END IF;

  IF v_challenge.double_or_nothing_approved THEN
    RETURN jsonb_build_object(
      'approved', true,
      'approvals', 2,
      'threshold', 2
    );
  END IF;

  SELECT COUNT(*)
  INTO v_validator_count
  FROM public.members
  WHERE group_id = v_challenge.group_id
    AND profile_id <> v_challenge.creator_id
    AND profile_id <> v_challenge.target_id;

  IF v_validator_count <= 0 THEN
    RAISE EXCEPTION 'No validators available';
  END IF;

  v_threshold := LEAST(2, v_validator_count);

  INSERT INTO public.quit_or_double_votes (challenge_id, voter_id, approve)
  VALUES (p_challenge_id, auth.uid(), p_approve)
  ON CONFLICT (challenge_id, voter_id)
  DO UPDATE
    SET approve = EXCLUDED.approve,
        created_at = now();

  SELECT COUNT(*)
  INTO v_approvals
  FROM public.quit_or_double_votes
  WHERE challenge_id = p_challenge_id
    AND approve = true;

  IF v_approvals >= v_threshold THEN
    UPDATE public.challenges
    SET double_or_nothing_approved = true
    WHERE id = p_challenge_id;
  END IF;

  RETURN jsonb_build_object(
    'approved', (v_approvals >= v_threshold),
    'approvals', v_approvals,
    'threshold', v_threshold
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
  LEFT JOIN public.profiles p
    ON p.id = m.profile_id
  LEFT JOIN public.inventory i
    ON i.profile_id = m.profile_id
   AND i.used_at IS NULL
  LEFT JOIN public.shop_items si
    ON si.id = i.shop_item_id
   AND si.group_id = p_group_id
   AND si.item_type = 'joker'
  WHERE m.group_id = p_group_id
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
  v_item public.shop_items%ROWTYPE;
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

  SELECT *
  INTO v_item
  FROM public.shop_items
  WHERE id = v_inventory.shop_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop item not found';
  END IF;

  IF NOT public.is_group_member(v_item.group_id) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  IF p_challenge_id IS NOT NULL THEN
    SELECT *
    INTO v_challenge
    FROM public.challenges
    WHERE id = p_challenge_id
      AND group_id = v_item.group_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Challenge not found';
    END IF;
  END IF;

  IF v_item.item_type = 'gilet_pare_balles' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Invalid challenge for bulletproof vest';
    END IF;
    UPDATE public.challenges
    SET points = GREATEST(1, CEIL(points / 2.0))
    WHERE id = v_challenge.id;

  ELSIF v_item.item_type = 'mode_fantome' THEN
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_item.group_id, auth.uid(), auth.uid(), 'ghost_mode', now() + interval '24 hours');

  ELSIF v_item.item_type = 'miroir_magique' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid challenge for magic mirror';
    END IF;
    UPDATE public.challenges
    SET creator_id = auth.uid(),
        target_id = v_challenge.creator_id,
        status = 'proposed'
    WHERE id = v_challenge.id;

  ELSIF v_item.item_type = 'patate_chaude' THEN
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

  ELSIF v_item.item_type = 'cinquante_cinquante' THEN
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
      group_id,
      creator_id,
      target_id,
      title,
      description,
      points,
      status,
      deadline,
      challenge_bundle_id,
      bundle_choice_required
    ) VALUES (
      v_challenge.group_id,
      v_challenge.creator_id,
      v_challenge.target_id,
      v_title,
      v_description,
      GREATEST(1, v_points),
      'proposed',
      v_deadline,
      v_bundle_id,
      true
    )
    RETURNING id INTO v_alt_challenge_id;

    UPDATE public.challenges
    SET challenge_bundle_id = v_bundle_id,
        bundle_choice_required = true
    WHERE id = v_challenge.id;

  ELSIF v_item.item_type = 'menottes' THEN
    IF p_target_profile_id IS NULL OR p_target_profile_id = auth.uid() THEN
      RAISE EXCEPTION 'Invalid target for handcuffs';
    END IF;
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_item.group_id, auth.uid(), p_target_profile_id, 'handcuffs', now() + interval '12 hours');

  ELSIF v_item.item_type = 'surcharge' THEN
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

  ELSIF v_item.item_type = 'sniper' THEN
    IF p_challenge_id IS NULL OR v_challenge.creator_id <> auth.uid() OR v_challenge.status <> 'proposed' THEN
      RAISE EXCEPTION 'Invalid challenge for sniper';
    END IF;
    UPDATE public.challenges
    SET no_negotiation = true
    WHERE id = v_challenge.id;

  ELSIF v_item.item_type = 'embargo' THEN
    IF p_target_profile_id IS NULL OR p_target_profile_id = auth.uid() THEN
      RAISE EXCEPTION 'Invalid target for embargo';
    END IF;
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_item.group_id, auth.uid(), p_target_profile_id, 'embargo', now() + interval '3 days');

  ELSIF v_item.item_type = 'roulette_russe' THEN
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
    WHERE m.group_id = v_item.group_id
      AND NOT public.is_profile_effect_active(v_item.group_id, m.profile_id, 'ghost_mode')
    ORDER BY random()
    LIMIT 1;
    IF v_random_target IS NULL THEN
      RAISE EXCEPTION 'No eligible target for roulette';
    END IF;
    INSERT INTO public.challenges (
      group_id,
      creator_id,
      target_id,
      title,
      description,
      points,
      status,
      deadline
    ) VALUES (
      v_item.group_id,
      auth.uid(),
      v_random_target,
      v_title,
      v_description,
      GREATEST(1, v_points),
      'proposed',
      v_deadline
    )
    RETURNING id INTO v_alt_challenge_id;

  ELSIF v_item.item_type = 'robin_des_bois' THEN
    SELECT m.profile_id, p.total_points
    INTO v_leader, v_leader_points
    FROM public.members m
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.group_id = v_item.group_id
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
      WHERE m.group_id = v_item.group_id
      ORDER BY p.total_points ASC
      LIMIT 3
    LOOP
      UPDATE public.profiles
      SET total_points = total_points + v_split + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END
      WHERE id = v_bottom.profile_id;
      INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, group_id)
      VALUES (
        v_bottom.profile_id,
        v_split + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END,
        'bonus',
        v_item.id,
        v_item.group_id
      );
      IF v_remainder > 0 THEN
        v_remainder := v_remainder - 1;
      END IF;
    END LOOP;

    INSERT INTO public.transactions (profile_id, amount, type, shop_item_id, group_id)
    VALUES (v_leader, -v_theft, 'challenge_penalty', v_item.id, v_item.group_id);

  ELSIF v_item.item_type = 'amnesie' THEN
    SELECT c.id
    INTO v_cancelled_id
    FROM public.challenges c
    WHERE c.group_id = v_item.group_id
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

  ELSIF v_item.item_type = 'mouchard' THEN
    INSERT INTO public.profile_effects (group_id, source_profile_id, target_profile_id, effect_type, active_until)
    VALUES (v_item.group_id, auth.uid(), auth.uid(), 'snitch', now() + interval '1 hour');

  ELSIF v_item.item_type = 'assurance' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Invalid challenge for insurance';
    END IF;
    UPDATE public.challenges
    SET insurance_enabled = true
    WHERE id = v_challenge.id;

  ELSIF v_item.item_type = 'quitte_ou_double' THEN
    IF p_challenge_id IS NULL OR v_challenge.target_id <> auth.uid() OR v_challenge.status NOT IN ('proposed', 'accepted') THEN
      RAISE EXCEPTION 'Invalid challenge for quitte ou double';
    END IF;
    UPDATE public.challenges
    SET double_or_nothing_requested = true,
        double_or_nothing_approved = false
    WHERE id = v_challenge.id;
    DELETE FROM public.quit_or_double_votes
    WHERE challenge_id = v_challenge.id;

  ELSE
    RAISE EXCEPTION 'Unsupported item type';
  END IF;

  UPDATE public.inventory
  SET used_at = now(),
      used_on_challenge_id = p_challenge_id
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'ok', true,
    'item_type', v_item.item_type,
    'challenge_id', p_challenge_id,
    'alt_challenge_id', v_alt_challenge_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_profile_effect_active(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_effect_active(UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.vote_quitte_ou_double(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_quitte_ou_double(UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.get_group_hidden_joker_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_hidden_joker_counts(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.use_inventory_item_effect(UUID, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_inventory_item_effect(UUID, UUID, UUID, JSONB) TO authenticated;
