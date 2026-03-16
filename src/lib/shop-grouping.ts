import {
  getStoreItemCategory,
  STORE_ITEM_CATEGORY_LABELS,
  STORE_CATEGORY_ORDER,
  type StoreItemCategory,
} from "@/lib/store-item-types";

type ShopLikeItem = {
  item_type: string;
  [key: string]: unknown;
};

const CATEGORY_ORDER = (
  Object.entries(STORE_CATEGORY_ORDER) as [StoreItemCategory, number][]
)
  .sort(([, a], [, b]) => a - b)
  .map(([cat]) => cat);

export function groupShopItemsByCategory<T extends ShopLikeItem>(items: T[]) {
  const grouped = new Map<StoreItemCategory, T[]>();
  for (const item of items) {
    const category = getStoreItemCategory(item.item_type);
    const list = grouped.get(category);
    if (list) {
      list.push(item);
    } else {
      grouped.set(category, [item]);
    }
  }

  return CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0).map(
    (category) => ({
      category,
      label: STORE_ITEM_CATEGORY_LABELS[category],
      items: grouped.get(category) ?? [],
    }),
  );
}
