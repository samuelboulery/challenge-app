-- ============================================================
-- Monthly seasons + crown + one-shot 49.3 item
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'transaction_type'
      AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'transaction_type enum not found';
  END IF;
END;
$$;

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'season_reset';

ALTER TABLE public.shop_items
  DROP CONSTRAINT IF EXISTS shop_items_item_type_check;

ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_item_type_check
  CHECK (item_type IN ('custom', 'joker', 'booster', 'voleur', 'item_49_3'));

CREATE TABLE IF NOT EXISTS public.group_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  season_key TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  winner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_points INT NOT NULL DEFAULT 0,
  crown_holder_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, season_key),
  UNIQUE (group_id, starts_at),
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_group_seasons_group_status
  ON public.group_seasons(group_id, status);

CREATE INDEX IF NOT EXISTS idx_group_seasons_group_starts
  ON public.group_seasons(group_id, starts_at DESC);

CREATE TRIGGER trg_group_seasons_updated_at
  BEFORE UPDATE ON public.group_seasons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.group_seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group seasons are viewable by group members" ON public.group_seasons;
CREATE POLICY "Group seasons are viewable by group members"
  ON public.group_seasons FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id));

CREATE OR REPLACE FUNCTION public.get_paris_month_bounds(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  season_key TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH local_now AS (
    SELECT p_now AT TIME ZONE 'Europe/Paris' AS ts
  ),
  local_start AS (
    SELECT date_trunc('month', ts) AS month_start
    FROM local_now
  )
  SELECT
    to_char(local_start.month_start, 'YYYY-MM')::TEXT AS season_key,
    (local_start.month_start AT TIME ZONE 'Europe/Paris')::TIMESTAMPTZ AS starts_at,
    ((local_start.month_start + interval '1 month') AT TIME ZONE 'Europe/Paris')::TIMESTAMPTZ AS ends_at
  FROM local_start;
$$;

CREATE OR REPLACE FUNCTION public.ensure_group_current_season(p_group_id UUID)
RETURNS TABLE (
  season_id UUID,
  season_key TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  crown_holder_profile_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active public.group_seasons%ROWTYPE;
  v_current_key TEXT;
  v_current_start TIMESTAMPTZ;
  v_current_end TIMESTAMPTZ;
  v_next_start TIMESTAMPTZ;
  v_next_end TIMESTAMPTZ;
  v_next_key TEXT;
  v_winner UUID;
  v_winner_points INT;
  v_49_item_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT b.season_key, b.starts_at, b.ends_at
    INTO v_current_key, v_current_start, v_current_end
  FROM public.get_paris_month_bounds(now()) b;

  SELECT *
    INTO v_active
  FROM public.group_seasons gs
  WHERE gs.group_id = p_group_id
    AND gs.status = 'active'
  ORDER BY gs.starts_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.group_seasons (
      group_id,
      season_key,
      starts_at,
      ends_at,
      status
    )
    VALUES (
      p_group_id,
      v_current_key,
      v_current_start,
      v_current_end,
      'active'
    )
    RETURNING *
    INTO v_active;
  END IF;

  WHILE v_active.starts_at < v_current_start LOOP
    WITH season_points AS (
      SELECT
        m.profile_id,
        COALESCE(SUM(t.amount), 0)::INT AS points
      FROM public.members m
      LEFT JOIN public.transactions t
        ON t.profile_id = m.profile_id
       AND t.type <> 'season_reset'
       AND t.created_at >= v_active.starts_at
       AND t.created_at < v_active.ends_at
       AND (
         t.group_id = p_group_id
         OR EXISTS (
           SELECT 1
           FROM public.challenges c
           WHERE c.id = t.challenge_id
             AND c.group_id = p_group_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.shop_items si
           WHERE si.id = t.shop_item_id
             AND si.group_id = p_group_id
         )
       )
      WHERE m.group_id = p_group_id
      GROUP BY m.profile_id
    ),
    ranked AS (
      SELECT sp.profile_id, sp.points
      FROM season_points sp
      ORDER BY sp.points DESC
      LIMIT 1
    )
    SELECT r.profile_id, r.points
      INTO v_winner, v_winner_points
    FROM ranked r;

    IF v_winner IS NOT NULL THEN
      WITH top_points AS (
        SELECT COALESCE(MAX(sp.points), 0)::INT AS max_points
        FROM (
          SELECT
            m.profile_id,
            COALESCE(SUM(t.amount), 0)::INT AS points
          FROM public.members m
          LEFT JOIN public.transactions t
            ON t.profile_id = m.profile_id
           AND t.type <> 'season_reset'
           AND t.created_at >= v_active.starts_at
           AND t.created_at < v_active.ends_at
           AND (
             t.group_id = p_group_id
             OR EXISTS (
               SELECT 1
               FROM public.challenges c
               WHERE c.id = t.challenge_id
                 AND c.group_id = p_group_id
             )
             OR EXISTS (
               SELECT 1
               FROM public.shop_items si
               WHERE si.id = t.shop_item_id
                 AND si.group_id = p_group_id
             )
           )
          WHERE m.group_id = p_group_id
          GROUP BY m.profile_id
        ) sp
      ),
      candidates AS (
        SELECT
          sp.profile_id,
          sp.points
        FROM (
          SELECT
            m.profile_id,
            COALESCE(SUM(t.amount), 0)::INT AS points
          FROM public.members m
          LEFT JOIN public.transactions t
            ON t.profile_id = m.profile_id
           AND t.type <> 'season_reset'
           AND t.created_at >= v_active.starts_at
           AND t.created_at < v_active.ends_at
           AND (
             t.group_id = p_group_id
             OR EXISTS (
               SELECT 1
               FROM public.challenges c
               WHERE c.id = t.challenge_id
                 AND c.group_id = p_group_id
             )
             OR EXISTS (
               SELECT 1
               FROM public.shop_items si
               WHERE si.id = t.shop_item_id
                 AND si.group_id = p_group_id
             )
           )
          WHERE m.group_id = p_group_id
          GROUP BY m.profile_id
        ) sp
        CROSS JOIN top_points tp
        WHERE sp.points = tp.max_points
      ),
      candidate_count AS (
        SELECT COUNT(*) AS cnt
        FROM candidates
      ),
      running AS (
        SELECT
          t.profile_id,
          t.created_at,
          t.id,
          SUM(t.amount) OVER (
            PARTITION BY t.profile_id
            ORDER BY t.created_at ASC, t.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_points
        FROM public.transactions t
        JOIN candidates c ON c.profile_id = t.profile_id
        WHERE t.type <> 'season_reset'
          AND t.created_at >= v_active.starts_at
          AND t.created_at < v_active.ends_at
          AND (
            t.group_id = p_group_id
            OR EXISTS (
              SELECT 1
              FROM public.challenges ch
              WHERE ch.id = t.challenge_id
                AND ch.group_id = p_group_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.shop_items si
              WHERE si.id = t.shop_item_id
                AND si.group_id = p_group_id
            )
          )
      ),
      reached AS (
        SELECT
          r.profile_id,
          MIN(r.created_at) AS reached_at
        FROM running r
        CROSS JOIN top_points tp
        WHERE r.running_points >= tp.max_points
        GROUP BY r.profile_id
      )
      SELECT
        CASE
          WHEN cc.cnt = 1 THEN c.profile_id
          ELSE COALESCE(
            (
              SELECT rr.profile_id
              FROM reached rr
              ORDER BY rr.reached_at ASC, rr.profile_id ASC
              LIMIT 1
            ),
            (
              SELECT c2.profile_id
              FROM candidates c2
              ORDER BY c2.profile_id ASC
              LIMIT 1
            )
          )
        END AS winner_profile_id,
        tp.max_points
      INTO v_winner, v_winner_points
      FROM top_points tp
      CROSS JOIN candidate_count cc
      LEFT JOIN candidates c ON cc.cnt = 1
      LIMIT 1;
    ELSE
      v_winner_points := 0;
    END IF;

    UPDATE public.group_seasons
    SET
      status = 'closed',
      winner_profile_id = v_winner,
      winner_points = COALESCE(v_winner_points, 0),
      finalized_at = now()
    WHERE id = v_active.id;

    -- Expire all unused 49.3 from the season that just ended.
    UPDATE public.inventory i
    SET used_at = now()
    FROM public.shop_items si
    WHERE i.shop_item_id = si.id
      AND si.group_id = p_group_id
      AND si.item_type = 'item_49_3'
      AND i.used_at IS NULL;

    -- Zero the previous season contribution for all current members.
    WITH member_points AS (
      SELECT
        m.profile_id,
        COALESCE(SUM(t.amount), 0)::INT AS season_points
      FROM public.members m
      LEFT JOIN public.transactions t
        ON t.profile_id = m.profile_id
       AND t.type <> 'season_reset'
       AND t.created_at >= v_active.starts_at
       AND t.created_at < v_active.ends_at
       AND (
         t.group_id = p_group_id
         OR EXISTS (
           SELECT 1
           FROM public.challenges c
           WHERE c.id = t.challenge_id
             AND c.group_id = p_group_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.shop_items si
           WHERE si.id = t.shop_item_id
             AND si.group_id = p_group_id
         )
       )
      WHERE m.group_id = p_group_id
      GROUP BY m.profile_id
    ),
    deltas AS (
      SELECT
        mp.profile_id,
        (0 - mp.season_points) AS delta
      FROM member_points mp
      WHERE mp.season_points <> 0
    )
    UPDATE public.profiles p
    SET total_points = GREATEST(0, p.total_points + d.delta)
    FROM deltas d
    WHERE p.id = d.profile_id;

    INSERT INTO public.transactions (profile_id, amount, type, group_id)
    SELECT
      mp.profile_id,
      (0 - mp.season_points) AS amount,
      'season_reset'::public.transaction_type,
      p_group_id
    FROM (
      SELECT
        m.profile_id,
        COALESCE(SUM(t.amount), 0)::INT AS season_points
      FROM public.members m
      LEFT JOIN public.transactions t
        ON t.profile_id = m.profile_id
       AND t.type <> 'season_reset'
       AND t.created_at >= v_active.starts_at
       AND t.created_at < v_active.ends_at
       AND (
         t.group_id = p_group_id
         OR EXISTS (
           SELECT 1
           FROM public.challenges c
           WHERE c.id = t.challenge_id
             AND c.group_id = p_group_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.shop_items si
           WHERE si.id = t.shop_item_id
             AND si.group_id = p_group_id
         )
       )
      WHERE m.group_id = p_group_id
      GROUP BY m.profile_id
    ) mp
    WHERE mp.season_points <> 0;

    -- Next season starts exactly at previous season end.
    v_next_start := v_active.ends_at;
    SELECT b.season_key, b.ends_at
      INTO v_next_key, v_next_end
    FROM public.get_paris_month_bounds(v_next_start + interval '1 minute') b;

    INSERT INTO public.group_seasons (
      group_id,
      season_key,
      starts_at,
      ends_at,
      status,
      crown_holder_profile_id
    )
    VALUES (
      p_group_id,
      v_next_key,
      v_next_start,
      v_next_end,
      'active',
      v_winner
    )
    ON CONFLICT (group_id, season_key) DO UPDATE
      SET
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        status = 'active',
        crown_holder_profile_id = EXCLUDED.crown_holder_profile_id
    RETURNING *
    INTO v_active;

    IF v_winner IS NOT NULL THEN
      SELECT si.id
        INTO v_49_item_id
      FROM public.shop_items si
      WHERE si.group_id = p_group_id
        AND si.item_type = 'item_49_3'
      ORDER BY si.created_at ASC
      LIMIT 1;

      IF v_49_item_id IS NULL THEN
        INSERT INTO public.shop_items (
          group_id,
          name,
          description,
          price,
          stock,
          item_type
        )
        VALUES (
          p_group_id,
          '49.3',
          'Validation automatique de ta propre preuve sans vote du tribunal (usage unique)',
          999999,
          0,
          'item_49_3'
        )
        RETURNING id
        INTO v_49_item_id;
      END IF;

      INSERT INTO public.inventory (profile_id, shop_item_id)
      VALUES (v_winner, v_49_item_id);
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    v_active.id,
    v_active.season_key,
    v_active.starts_at,
    v_active.ends_at,
    v_active.crown_holder_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_season_leaderboard(p_group_id UUID)
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  group_points INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active public.group_seasons%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM public.ensure_group_current_season(p_group_id);

  SELECT *
    INTO v_active
  FROM public.group_seasons
  WHERE group_id = p_group_id
    AND status = 'active'
  ORDER BY starts_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT
    m.profile_id,
    COALESCE(p.username, 'Utilisateur') AS username,
    COALESCE(SUM(t.amount), 0)::INT AS group_points
  FROM public.members m
  LEFT JOIN public.profiles p
    ON p.id = m.profile_id
  LEFT JOIN public.transactions t
    ON t.profile_id = m.profile_id
   AND t.type <> 'season_reset'
   AND t.created_at >= v_active.starts_at
   AND t.created_at < v_active.ends_at
   AND (
     t.group_id = p_group_id
     OR EXISTS (
       SELECT 1
       FROM public.challenges c
       WHERE c.id = t.challenge_id
         AND c.group_id = p_group_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.shop_items si
       WHERE si.id = t.shop_item_id
         AND si.group_id = p_group_id
     )
   )
  WHERE m.group_id = p_group_id
  GROUP BY m.profile_id, p.username
  ORDER BY group_points DESC, username ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_all_time_leaderboard(p_group_id UUID)
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  group_points INT
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
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  SELECT
    m.profile_id,
    COALESCE(p.username, 'Utilisateur') AS username,
    COALESCE(SUM(t.amount), 0)::INT AS group_points
  FROM public.members m
  LEFT JOIN public.profiles p
    ON p.id = m.profile_id
  LEFT JOIN public.transactions t
    ON t.profile_id = m.profile_id
   AND t.type <> 'season_reset'
   AND (
     t.group_id = p_group_id
     OR EXISTS (
       SELECT 1
       FROM public.challenges c
       WHERE c.id = t.challenge_id
         AND c.group_id = p_group_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.shop_items si
       WHERE si.id = t.shop_item_id
         AND si.group_id = p_group_id
     )
   )
  WHERE m.group_id = p_group_id
  GROUP BY m.profile_id, p.username
  ORDER BY group_points DESC, username ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_profile_titles(p_group_id UUID)
RETURNS TABLE (
  title_key TEXT,
  title_label TEXT,
  profile_id UUID,
  username TEXT,
  metric_value INT
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
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  WITH members_scope AS (
    SELECT m.profile_id, COALESCE(p.username, 'Utilisateur') AS username
    FROM public.members m
    LEFT JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.group_id = p_group_id
  ),
  courageux AS (
    SELECT
      ms.profile_id,
      ms.username,
      COALESCE(COUNT(c.id), 0)::INT AS value
    FROM members_scope ms
    LEFT JOIN public.challenges c
      ON c.group_id = p_group_id
     AND c.target_id = ms.profile_id
     AND c.status = 'validated'
    GROUP BY ms.profile_id, ms.username
    ORDER BY value DESC, ms.username ASC
    LIMIT 1
  ),
  victime AS (
    SELECT
      ms.profile_id,
      ms.username,
      COALESCE(COUNT(t.id), 0)::INT AS value
    FROM members_scope ms
    LEFT JOIN public.transactions t
      ON t.profile_id = ms.profile_id
     AND t.type = 'challenge_penalty'
     AND (
       t.group_id = p_group_id
       OR EXISTS (
         SELECT 1
         FROM public.challenges c
         WHERE c.id = t.challenge_id
           AND c.group_id = p_group_id
       )
       OR EXISTS (
         SELECT 1
         FROM public.shop_items si
         WHERE si.id = t.shop_item_id
           AND si.group_id = p_group_id
       )
     )
    GROUP BY ms.profile_id, ms.username
    ORDER BY value DESC, ms.username ASC
    LIMIT 1
  ),
  riche AS (
    SELECT
      ms.profile_id,
      ms.username,
      COALESCE(SUM(t.amount), 0)::INT AS value
    FROM members_scope ms
    LEFT JOIN public.transactions t
      ON t.profile_id = ms.profile_id
     AND t.type <> 'season_reset'
     AND (
       t.group_id = p_group_id
       OR EXISTS (
         SELECT 1
         FROM public.challenges c
         WHERE c.id = t.challenge_id
           AND c.group_id = p_group_id
       )
       OR EXISTS (
         SELECT 1
         FROM public.shop_items si
         WHERE si.id = t.shop_item_id
           AND si.group_id = p_group_id
       )
     )
    GROUP BY ms.profile_id, ms.username
    ORDER BY value DESC, ms.username ASC
    LIMIT 1
  )
  SELECT
    'courageux'::TEXT,
    'Le plus courageux'::TEXT,
    c.profile_id,
    c.username,
    c.value
  FROM courageux c
  UNION ALL
  SELECT
    'victime'::TEXT,
    'La victime'::TEXT,
    v.profile_id,
    v.username,
    v.value
  FROM victime v
  UNION ALL
  SELECT
    'riche'::TEXT,
    'Le riche'::TEXT,
    r.profile_id,
    r.username,
    r.value
  FROM riche r;
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
  JOIN public.shop_items si ON si.id = i.shop_item_id
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
  FROM public.shop_items si
  WHERE si.group_id = p_group_id
    AND si.item_type <> 'item_49_3';
END;
$$;

CREATE OR REPLACE FUNCTION public.use_item_49_3_on_challenge(p_challenge_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
  v_inv public.inventory%ROWTYPE;
  v_shop_item public.shop_items%ROWTYPE;
  v_reward INT;
BEGIN
  SELECT *
    INTO v_challenge
  FROM public.challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.target_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not the target';
  END IF;

  IF v_challenge.status <> 'proof_submitted' THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT i.*
    INTO v_inv
  FROM public.inventory i
  JOIN public.shop_items si ON si.id = i.shop_item_id
  WHERE i.profile_id = auth.uid()
    AND i.used_at IS NULL
    AND si.group_id = v_challenge.group_id
    AND si.item_type = 'item_49_3'
  ORDER BY i.purchased_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item 49.3 not available';
  END IF;

  SELECT *
    INTO v_shop_item
  FROM public.shop_items
  WHERE id = v_inv.shop_item_id;

  IF NOT FOUND OR v_shop_item.item_type <> 'item_49_3' THEN
    RAISE EXCEPTION 'Invalid 49.3 item';
  END IF;

  v_reward := v_challenge.points;
  IF v_challenge.booster_inventory_id IS NOT NULL THEN
    v_reward := v_reward * 2;
  END IF;

  UPDATE public.inventory
  SET used_at = now(),
      used_on_challenge_id = p_challenge_id
  WHERE id = v_inv.id;

  UPDATE public.challenges
  SET status = 'validated'
  WHERE id = p_challenge_id;

  DELETE FROM public.challenge_votes
  WHERE challenge_id = p_challenge_id;

  UPDATE public.profiles
  SET total_points = total_points + v_reward
  WHERE id = v_challenge.target_id;

  INSERT INTO public.transactions (profile_id, amount, type, challenge_id, group_id)
  VALUES (
    v_challenge.target_id,
    v_reward,
    'challenge_reward',
    p_challenge_id,
    v_challenge.group_id
  );

  RETURN jsonb_build_object(
    'status', 'validated',
    'reward', v_reward,
    'inventory_id', v_inv.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_group_current_season(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_group_current_season(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_group_season_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_season_leaderboard(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_group_all_time_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_all_time_leaderboard(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_group_profile_titles(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_profile_titles(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.use_item_49_3_on_challenge(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_item_49_3_on_challenge(UUID) TO authenticated;
