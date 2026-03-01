-- ============================================================
-- Deduplicate shop_items and prevent future system duplicates
-- ============================================================

-- 1) Build canonical item per (group_id, item_type) for system items.
WITH ranked AS (
  SELECT
    si.id,
    si.group_id,
    si.item_type,
    si.stock,
    ROW_NUMBER() OVER (
      PARTITION BY si.group_id, si.item_type
      ORDER BY si.updated_at DESC NULLS LAST, si.created_at DESC NULLS LAST, si.id DESC
    ) AS rn
  FROM public.shop_items si
  WHERE si.item_type <> 'custom'
),
canonical AS (
  SELECT
    r.group_id,
    r.item_type,
    r.id AS canonical_id
  FROM ranked r
  WHERE r.rn = 1
),
dups AS (
  SELECT
    r.id AS duplicate_id,
    c.canonical_id,
    r.group_id,
    r.item_type
  FROM ranked r
  JOIN canonical c
    ON c.group_id = r.group_id
   AND c.item_type = r.item_type
  WHERE r.rn > 1
)
UPDATE public.inventory i
SET shop_item_id = d.canonical_id
FROM dups d
WHERE i.shop_item_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    si.id,
    si.group_id,
    si.item_type,
    ROW_NUMBER() OVER (
      PARTITION BY si.group_id, si.item_type
      ORDER BY si.updated_at DESC NULLS LAST, si.created_at DESC NULLS LAST, si.id DESC
    ) AS rn
  FROM public.shop_items si
  WHERE si.item_type <> 'custom'
),
canonical AS (
  SELECT
    r.group_id,
    r.item_type,
    r.id AS canonical_id
  FROM ranked r
  WHERE r.rn = 1
),
dups AS (
  SELECT
    r.id AS duplicate_id,
    c.canonical_id,
    r.group_id,
    r.item_type
  FROM ranked r
  JOIN canonical c
    ON c.group_id = r.group_id
   AND c.item_type = r.item_type
  WHERE r.rn > 1
)
UPDATE public.transactions t
SET shop_item_id = d.canonical_id
FROM dups d
WHERE t.shop_item_id = d.duplicate_id;

-- Optional stock merge:
-- If any item in the duplicate set has NULL stock (unlimited), canonical becomes NULL.
-- Otherwise canonical stock becomes the sum of all stocks in the set.
WITH grouped AS (
  SELECT
    si.group_id,
    si.item_type,
    COUNT(*) AS item_count,
    BOOL_OR(si.stock IS NULL) AS has_unlimited,
    COALESCE(SUM(si.stock), 0) AS total_stock
  FROM public.shop_items si
  WHERE si.item_type <> 'custom'
  GROUP BY si.group_id, si.item_type
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT
    si.id,
    si.group_id,
    si.item_type,
    ROW_NUMBER() OVER (
      PARTITION BY si.group_id, si.item_type
      ORDER BY si.updated_at DESC NULLS LAST, si.created_at DESC NULLS LAST, si.id DESC
    ) AS rn
  FROM public.shop_items si
  WHERE si.item_type <> 'custom'
)
UPDATE public.shop_items canon
SET stock = CASE WHEN g.has_unlimited THEN NULL ELSE g.total_stock END
FROM grouped g
JOIN ranked r
  ON r.group_id = g.group_id
 AND r.item_type = g.item_type
 AND r.rn = 1
WHERE canon.id = r.id;

-- 2) Delete duplicate rows (keep canonical).
WITH ranked AS (
  SELECT
    si.id,
    ROW_NUMBER() OVER (
      PARTITION BY si.group_id, si.item_type
      ORDER BY si.updated_at DESC NULLS LAST, si.created_at DESC NULLS LAST, si.id DESC
    ) AS rn
  FROM public.shop_items si
  WHERE si.item_type <> 'custom'
)
DELETE FROM public.shop_items si
USING ranked r
WHERE si.id = r.id
  AND r.rn > 1;

-- 3) Prevent future duplicates for system items.
CREATE UNIQUE INDEX IF NOT EXISTS ux_shop_items_group_type_system
  ON public.shop_items(group_id, item_type)
  WHERE item_type <> 'custom';
