-- ========================================
-- RPC: create_notification
-- Bypasses RLS to allow cross-user notification inserts
-- ========================================
CREATE OR REPLACE FUNCTION public.create_notification(
  p_profile_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT '',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (profile_id, type, title, body, metadata)
    VALUES (p_profile_id, p_type, p_title, p_body, p_metadata);
END;
$$;

-- ========================================
-- Table: push_subscriptions
-- ========================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_profile ON public.push_subscriptions(profile_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

-- RPC to get push subscriptions for sending (bypasses RLS for cross-user reads)
CREATE OR REPLACE FUNCTION public.get_push_subscriptions(p_profile_id UUID)
RETURNS TABLE(endpoint TEXT, p256dh TEXT, auth TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    WHERE ps.profile_id = p_profile_id;
END;
$$;
