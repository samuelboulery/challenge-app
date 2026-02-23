-- ========================================
-- Table: badges
-- ========================================
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  condition_type TEXT NOT NULL,
  condition_value INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view badges"
  ON public.badges FOR SELECT
  TO authenticated
  USING (true);

-- ========================================
-- Table: user_badges
-- ========================================
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, badge_id)
);

CREATE INDEX idx_user_badges_profile ON public.user_badges(profile_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view user badges"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (true);

-- ========================================
-- Table: notifications
-- ========================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_profile ON public.notifications(profile_id);
CREATE INDEX idx_notifications_unread ON public.notifications(profile_id, read) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ========================================
-- Seed badges
-- ========================================
INSERT INTO public.badges (slug, name, description, icon, condition_type, condition_value) VALUES
  ('first_challenge', 'Premier Défi', 'Gagner ton premier défi', 'trophy', 'challenges_won', 1),
  ('5_wins', 'Quintuple', 'Gagner 5 défis', 'flame', 'challenges_won', 5),
  ('10_wins', 'Décathlon', 'Gagner 10 défis', 'zap', 'challenges_won', 10),
  ('first_purchase', 'Shopping !', 'Acheter ton premier item', 'shopping-bag', 'items_purchased', 1),
  ('social_butterfly', 'Papillon Social', 'Rejoindre 3 groupes', 'users', 'groups_joined', 3)
ON CONFLICT (slug) DO NOTHING;

-- ========================================
-- RPC: check_and_award_badges
-- ========================================
CREATE OR REPLACE FUNCTION public.check_and_award_badges(p_profile_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenges_won INT;
  v_items_purchased INT;
  v_groups_joined INT;
  v_badge RECORD;
  v_awarded INT := 0;
  v_stat_value INT;
BEGIN
  SELECT COUNT(*) INTO v_challenges_won
    FROM challenges
    WHERE target_id = p_profile_id AND status = 'validated';

  SELECT COUNT(*) INTO v_items_purchased
    FROM inventory
    WHERE profile_id = p_profile_id;

  SELECT COUNT(*) INTO v_groups_joined
    FROM members
    WHERE profile_id = p_profile_id;

  FOR v_badge IN
    SELECT b.*
    FROM badges b
    WHERE NOT EXISTS (
      SELECT 1 FROM user_badges ub
      WHERE ub.badge_id = b.id AND ub.profile_id = p_profile_id
    )
  LOOP
    CASE v_badge.condition_type
      WHEN 'challenges_won' THEN v_stat_value := v_challenges_won;
      WHEN 'items_purchased' THEN v_stat_value := v_items_purchased;
      WHEN 'groups_joined' THEN v_stat_value := v_groups_joined;
      ELSE v_stat_value := 0;
    END CASE;

    IF v_stat_value >= v_badge.condition_value THEN
      INSERT INTO user_badges (profile_id, badge_id)
        VALUES (p_profile_id, v_badge.id)
        ON CONFLICT DO NOTHING;

      INSERT INTO notifications (profile_id, type, title, body, metadata)
        VALUES (
          p_profile_id,
          'badge_earned',
          'Nouveau badge !',
          'Tu as débloqué le badge "' || v_badge.name || '"',
          jsonb_build_object('badge_id', v_badge.id, 'badge_slug', v_badge.slug)
        );

      v_awarded := v_awarded + 1;
    END IF;
  END LOOP;

  RETURN v_awarded;
END;
$$;
