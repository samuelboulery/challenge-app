-- ============================================================
-- Challenge Social App - Database Schema
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE challenge_status AS ENUM (
  'proposed',
  'negotiating',
  'accepted',
  'in_progress',
  'proof_submitted',
  'validated',
  'rejected',
  'expired',
  'cancelled'
);

CREATE TYPE transaction_type AS ENUM (
  'challenge_reward',
  'challenge_penalty',
  'shop_purchase',
  'bonus',
  'refund'
);

CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (linked to Supabase Auth)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  avatar_url  TEXT,
  total_points INT NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Members (composite PK: one membership per user per group)
CREATE TABLE members (
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);

-- Challenges
CREATE TABLE challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  points      INT NOT NULL CHECK (points > 0),
  status      challenge_status NOT NULL DEFAULT 'proposed',
  deadline    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proofs (media submissions for challenge validation)
CREATE TABLE proofs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  submitted_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url     TEXT,
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions (point ledger)
CREATE TABLE transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount        INT NOT NULL,
  type          transaction_type NOT NULL,
  challenge_id  UUID REFERENCES challenges(id) ON DELETE SET NULL,
  shop_item_id  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shop items (per-group store)
CREATE TABLE shop_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       INT NOT NULL CHECK (price > 0),
  stock       INT CHECK (stock IS NULL OR stock >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK constraint on transactions.shop_item_id now that shop_items exists
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_shop_item
  FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE SET NULL;

-- Inventory (purchased items)
CREATE TABLE inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shop_item_id  UUID NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_members_profile    ON members(profile_id);
CREATE INDEX idx_challenges_group   ON challenges(group_id);
CREATE INDEX idx_challenges_target  ON challenges(target_id);
CREATE INDEX idx_challenges_status  ON challenges(status);
CREATE INDEX idx_proofs_challenge   ON proofs(challenge_id);
CREATE INDEX idx_transactions_profile ON transactions(profile_id);
CREATE INDEX idx_shop_items_group   ON shop_items(group_id);
CREATE INDEX idx_inventory_profile  ON inventory(profile_id);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_challenges_updated_at
  BEFORE UPDATE ON challenges FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_shop_items_updated_at
  BEFORE UPDATE ON shop_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- HELPER FUNCTION: Check group membership
-- ============================================================

CREATE OR REPLACE FUNCTION is_group_member(group_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM members
    WHERE group_id = group_uuid AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_group_admin(group_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM members
    WHERE group_id = group_uuid
      AND profile_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- groups
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groups are viewable by members"
  ON groups FOR SELECT
  USING (is_group_member(id));

CREATE POLICY "Authenticated users can create groups"
  ON groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update group"
  ON groups FOR UPDATE
  USING (is_group_admin(id))
  WITH CHECK (is_group_admin(id));

-- members
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members are viewable by group members"
  ON members FOR SELECT
  USING (is_group_member(group_id));

CREATE POLICY "Group admins can add members"
  ON members FOR INSERT
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "Users can leave groups (delete own membership)"
  ON members FOR DELETE
  USING (profile_id = auth.uid());

CREATE POLICY "Group admins can remove members"
  ON members FOR DELETE
  USING (is_group_admin(group_id));

-- challenges
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challenges are viewable by group members"
  ON challenges FOR SELECT
  USING (is_group_member(group_id));

CREATE POLICY "Group members can create challenges"
  ON challenges FOR INSERT
  WITH CHECK (
    is_group_member(group_id)
    AND creator_id = auth.uid()
  );

CREATE POLICY "Challenge participants can update"
  ON challenges FOR UPDATE
  USING (
    is_group_member(group_id)
    AND (creator_id = auth.uid() OR target_id = auth.uid())
  );

-- proofs
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proofs are viewable by challenge group members"
  ON proofs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = proofs.challenge_id
        AND is_group_member(c.group_id)
    )
  );

CREATE POLICY "Challenge target can submit proof"
  ON proofs FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = challenge_id
        AND c.target_id = auth.uid()
    )
  );

-- transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (profile_id = auth.uid());

-- shop_items
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop items are viewable by group members"
  ON shop_items FOR SELECT
  USING (is_group_member(group_id));

CREATE POLICY "Group admins can manage shop items"
  ON shop_items FOR INSERT
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "Group admins can update shop items"
  ON shop_items FOR UPDATE
  USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "Group admins can delete shop items"
  ON shop_items FOR DELETE
  USING (is_group_admin(group_id));

-- inventory
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory"
  ON inventory FOR SELECT
  USING (profile_id = auth.uid());

-- ============================================================
-- RPC: Atomic item purchase
-- ============================================================

CREATE OR REPLACE FUNCTION purchase_item(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price    INT;
  v_stock    INT;
  v_group_id UUID;
  v_balance  INT;
BEGIN
  -- Lock the item row and read price/stock
  SELECT price, stock, group_id
    INTO v_price, v_stock, v_group_id
    FROM shop_items
    WHERE id = p_item_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- Verify the buyer is a member of the item's group
  IF NOT is_group_member(v_group_id) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  -- Check stock
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'Item out of stock';
  END IF;

  -- Lock the buyer's profile and check balance
  SELECT total_points INTO v_balance
    FROM profiles
    WHERE id = auth.uid()
    FOR UPDATE;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  -- Deduct points
  UPDATE profiles
    SET total_points = total_points - v_price
    WHERE id = auth.uid();

  -- Decrement stock (only if stock is tracked)
  UPDATE shop_items
    SET stock = stock - 1
    WHERE id = p_item_id AND stock IS NOT NULL;

  -- Add to inventory
  INSERT INTO inventory (profile_id, shop_item_id)
    VALUES (auth.uid(), p_item_id);

  -- Record transaction
  INSERT INTO transactions (profile_id, amount, type, shop_item_id)
    VALUES (auth.uid(), -v_price, 'shop_purchase', p_item_id);
END;
$$;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP (trigger on auth.users)
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- AUTO-ADD CREATOR AS OWNER when group is created
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_group()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO members (group_id, profile_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_group_created
  AFTER INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION handle_new_group();
