export const STORE_ITEM_TYPES = [
  "custom",
  "joker",
  "booster",
  "voleur",
  "item_49_3",
  "gilet_pare_balles",
  "mode_fantome",
  "miroir_magique",
  "patate_chaude",
  "cinquante_cinquante",
  "menottes",
  "surcharge",
  "sniper",
  "embargo",
  "roulette_russe",
  "robin_des_bois",
  "amnesie",
  "mouchard",
  "assurance",
  "quitte_ou_double",
] as const;

export type StoreItemType = (typeof STORE_ITEM_TYPES)[number];

export const SYSTEM_STORE_ITEM_TYPES = STORE_ITEM_TYPES.filter(
  (itemType): itemType is Exclude<StoreItemType, "custom"> => itemType !== "custom",
);

export const SYSTEM_ITEM_TYPES_SET = new Set<string>(SYSTEM_STORE_ITEM_TYPES);

// Items that show "Effet immédiat à l'achat" label (auto-apply on purchase)
export const IMMEDIATE_AUTO_EFFECT_ITEM_TYPES = ["voleur", "robin_des_bois", "mouchard"] as const;

// Items that apply their effect immediately on purchase (auto-use at buy)
export const IMMEDIATE_EFFECT_ITEM_TYPES = [
  "voleur",
  "robin_des_bois",
  "mouchard",
  "mode_fantome",
] as const;

// Items that require choosing a target immediately on purchase
export const IMMEDIATE_TARGET_ITEM_TYPES = ["menottes", "embargo"] as const;

// Item types excluded from the usable-effects inventory panel.
// Includes economy/misc items (joker, booster, item_49_3, custom) AND voleur,
// because voleur auto-applies immediately at purchase and never sits as a usable inventory item.
export const EFFECT_PANEL_EXCLUDED_ITEM_TYPES = [
  "custom",
  "joker",
  "booster",
  "voleur",
  "item_49_3",
] as const;

export const STORE_ITEM_LABELS: Record<StoreItemType, string> = {
  custom: "Personnalisé",
  joker: "Joker",
  booster: "Booster",
  voleur: "Voleur",
  item_49_3: "49.3",
  gilet_pare_balles: "Gilet Pare-Balles",
  mode_fantome: "Mode Fantôme",
  miroir_magique: "Miroir Magique",
  patate_chaude: "Patate Chaude",
  cinquante_cinquante: "50/50",
  menottes: "Menottes",
  surcharge: "Surcharge",
  sniper: "Sniper",
  embargo: "Embargo",
  roulette_russe: "Roulette Russe",
  robin_des_bois: "Robin des Bois",
  amnesie: "Amnésie",
  mouchard: "Mouchard",
  assurance: "Assurance",
  quitte_ou_double: "Quitte ou Double",
};

export type StoreItemCategory =
  | "defense"
  | "attaque"
  | "chaos"
  | "economie"
  | "special"
  | "custom";

export const STORE_ITEM_CATEGORY_LABELS: Record<StoreItemCategory, string> = {
  defense: "Défense",
  attaque: "Attaque",
  chaos: "Chaos",
  economie: "Économie",
  special: "Spécial",
  custom: "Personnalisé",
};

export const STORE_ITEM_CATEGORY_BY_TYPE: Record<StoreItemType, StoreItemCategory> = {
  joker: "defense",
  booster: "economie",
  voleur: "attaque",
  gilet_pare_balles: "defense",
  mode_fantome: "defense",
  miroir_magique: "defense",
  patate_chaude: "defense",
  cinquante_cinquante: "attaque",
  menottes: "attaque",
  surcharge: "attaque",
  sniper: "attaque",
  embargo: "attaque",
  roulette_russe: "chaos",
  robin_des_bois: "chaos",
  amnesie: "chaos",
  mouchard: "chaos",
  assurance: "economie",
  quitte_ou_double: "economie",
  item_49_3: "special",
  custom: "custom",
};

export const STORE_CATEGORY_ORDER: Record<StoreItemCategory, number> = {
  defense: 0,
  attaque: 1,
  chaos: 2,
  economie: 3,
  special: 4,
  custom: 5,
};

export function getStoreItemCategory(itemType: string): StoreItemCategory {
  return STORE_ITEM_CATEGORY_BY_TYPE[itemType as StoreItemType] ?? "special";
}

export function getStoreItemCategoryLabel(itemType: string): string {
  return STORE_ITEM_CATEGORY_LABELS[getStoreItemCategory(itemType)];
}

export function sortShopItemsByCategoryAndPrice<
  T extends { item_type: string; price: number; name?: string | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const categoryDiff =
      STORE_CATEGORY_ORDER[getStoreItemCategory(a.item_type)] -
      STORE_CATEGORY_ORDER[getStoreItemCategory(b.item_type)];
    if (categoryDiff !== 0) return categoryDiff;

    const priceDiff = a.price - b.price;
    if (priceDiff !== 0) return priceDiff;

    return (a.name ?? "").localeCompare(b.name ?? "", "fr");
  });
}
