-- ============================================================
-- Auto-seed special shop items for every group
-- ============================================================

-- Function to create the 3 special items in a group
CREATE OR REPLACE FUNCTION seed_special_shop_items(p_group_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO shop_items (group_id, name, description, price, stock, item_type)
  VALUES
    (p_group_id, 'Joker', 'Esquive un défi sans perdre de points (après tes 2 refus gratuits par semaine)', 100, NULL, 'joker'),
    (p_group_id, 'Booster x2', 'Double les points gagnés sur le prochain défi accepté', 150, NULL, 'booster'),
    (p_group_id, 'Voleur', 'Vole 30% des points du leader du groupe (effet immédiat)', 200, NULL, 'voleur')
  ON CONFLICT DO NOTHING;
END;
$$;

-- Trigger: auto-create special items when a new group is created
CREATE OR REPLACE FUNCTION handle_new_group_items()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_special_shop_items(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_group_created_seed_items
  AFTER INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION handle_new_group_items();

-- Seed special items for all existing groups that don't have them yet
DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN SELECT id FROM groups LOOP
    -- Only insert if the group doesn't already have a joker
    IF NOT EXISTS (
      SELECT 1 FROM shop_items WHERE group_id = g.id AND item_type = 'joker'
    ) THEN
      INSERT INTO shop_items (group_id, name, description, price, stock, item_type)
      VALUES (g.id, 'Joker', 'Esquive un défi sans perdre de points (après tes 2 refus gratuits par semaine)', 100, NULL, 'joker');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM shop_items WHERE group_id = g.id AND item_type = 'booster'
    ) THEN
      INSERT INTO shop_items (group_id, name, description, price, stock, item_type)
      VALUES (g.id, 'Booster x2', 'Double les points gagnés sur le prochain défi accepté', 150, NULL, 'booster');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM shop_items WHERE group_id = g.id AND item_type = 'voleur'
    ) THEN
      INSERT INTO shop_items (group_id, name, description, price, stock, item_type)
      VALUES (g.id, 'Voleur', 'Vole 30% des points du leader du groupe (effet immédiat)', 200, NULL, 'voleur');
    END IF;
  END LOOP;
END;
$$;
