-- ============================================================
-- Corrective migration: special item prices
-- ============================================================

UPDATE public.shop_items
SET price = 500
WHERE item_type = 'voleur';

UPDATE public.shop_items
SET price = 400
WHERE item_type = 'robin_des_bois';
