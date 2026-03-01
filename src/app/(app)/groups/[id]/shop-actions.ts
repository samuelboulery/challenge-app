"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  addShopItemSchema,
  deleteShopItemSchema,
  updateShopItemSchema,
  purchaseItemSchema,
  getEffectiveShopPricesSchema,
  parseFormData,
} from "@/lib/validations";
import { notify } from "@/lib/notifications";
import { awardBadges } from "@/lib/badges";
import type { StoreItemType } from "@/lib/store-item-types";
import { SYSTEM_STORE_ITEM_TYPES, sortShopItemsByCategoryAndPrice } from "@/lib/store-item-types";

const SYSTEM_ITEM_TYPES = new Set<string>(SYSTEM_STORE_ITEM_TYPES);

type ShopItemView = {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  item_type: string;
  source: "custom" | "global";
};

export async function addShopItem(formData: FormData) {
  const parsed = parseFormData(addShopItemSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  if (parsed.data.itemType !== "custom") {
    return { error: "Seuls les items personnalisés peuvent être créés manuellement" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("shop_items").insert({
    group_id: parsed.data.groupId,
    name: parsed.data.name,
    description: parsed.data.description,
    price: parsed.data.price,
    stock: parsed.data.stock,
    item_type: parsed.data.itemType,
  });

  if (error) return { error: error.message };

  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  revalidatePath(`/g/${parsed.data.groupId}`);
  return { success: true };
}

export async function deleteShopItem(formData: FormData) {
  const parsed = parseFormData(deleteShopItemSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_items")
    .delete()
    .eq("id", parsed.data.itemId);

  if (error) return { error: error.message };

  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  revalidatePath(`/g/${parsed.data.groupId}`);
  return { success: true };
}

export async function updateShopItem(formData: FormData) {
  const parsed = parseFormData(updateShopItemSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_items")
    .update({ price: parsed.data.price, stock: parsed.data.stock })
    .eq("id", parsed.data.itemId);

  if (error) return { error: error.message };

  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  revalidatePath(`/g/${parsed.data.groupId}`);
  return { success: true };
}

export async function purchaseItem(formData: FormData) {
  const parsed = parseFormData(purchaseItemSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: shopItem } = await supabase
    .from("shop_items")
    .select("item_type")
    .eq("id", parsed.data.itemId)
    .maybeSingle();

  const { data: globalItem } = shopItem
    ? ({ data: null } as { data: { item_type: string } | null })
    : await supabase
        .from("global_shop_items")
        .select("item_type")
        .eq("id", parsed.data.itemId)
        .maybeSingle();

  const purchasedItemType = shopItem?.item_type ?? globalItem?.item_type ?? null;

  if (purchasedItemType === "menottes" || purchasedItemType === "embargo") {
    return { error: "Choisis une cible avant l'achat de cet item" };
  }

  const { error } = await supabase.rpc("purchase_item", {
    p_item_id: parsed.data.itemId,
    p_group_id: parsed.data.groupId,
  });

  if (error) {
    if (error.message.includes("Insufficient points"))
      return { error: "Points insuffisants" };
    if (error.message.includes("out of stock"))
      return { error: "Rupture de stock" };
    if (error.message.includes("Not a member"))
      return { error: "Tu n'es pas membre de ce groupe" };
    if (error.message.includes("Item not purchasable")) {
      return { error: "Cet item n'est pas disponible à l'achat" };
    }
    if (error.message.includes("disabled for this group")) {
      return { error: "Cet item est désactivé dans ce groupe" };
    }
    if (error.message.includes("handcuffed")) {
      return { error: "Tu es sous l'effet des menottes pendant 12h" };
    }
    if (error.message.includes("embargoed")) {
      return { error: "Tu es sous embargo et ne peux pas accéder au store" };
    }
    return { error: error.message };
  }

  await awardBadges(user.id);

  if (
    purchasedItemType === "voleur" ||
    purchasedItemType === "robin_des_bois" ||
    purchasedItemType === "mouchard" ||
    purchasedItemType === "mode_fantome"
  ) {
    const { data: invItem } = await supabase
      .from("inventory")
      .select("id")
      .eq("profile_id", user.id)
      .eq(shopItem ? "shop_item_id" : "global_shop_item_id", parsed.data.itemId)
      .eq("purchased_group_id", parsed.data.groupId)
      .is("used_at", null)
      .order("purchased_at", { ascending: false })
      .limit(1)
      .single();

    if (invItem) {
      if (purchasedItemType === "voleur") {
        const { data: voleurResult, error: voleurError } = await supabase.rpc(
          "use_voleur",
          { p_inventory_id: invItem.id },
        );

        if (voleurError) {
          revalidatePath(`/g/${parsed.data.groupId}`);
          revalidatePath("/profile");
          return { error: `Achat effectué mais vol échoué : ${voleurError.message}` };
        }

        const voleur = voleurResult as {
          stolen: number;
          victim_id: string;
          victim_username: string;
        };

        const { data: buyerProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        await notify(
          voleur.victim_id,
          "challenge_penalty",
          "Vol de points !",
          `${buyerProfile?.username ?? "Quelqu'un"} t'a volé ${voleur.stolen} points avec un Voleur !`,
          { group_id: parsed.data.groupId },
        );

        revalidatePath(`/g/${parsed.data.groupId}`);
        revalidatePath("/profile");
        return {
          success: true,
          voleur: {
            stolen: voleur.stolen,
            victimUsername: voleur.victim_username,
          },
        };
      }

      const { error: immediateEffectError } = await supabase.rpc(
        "use_inventory_item_effect",
        { p_inventory_id: invItem.id },
      );

      if (immediateEffectError) {
        revalidatePath(`/g/${parsed.data.groupId}`);
        revalidatePath("/profile");
        return {
          error:
            purchasedItemType === "mouchard"
              ? `Achat effectué mais activation du Mouchard échouée : ${immediateEffectError.message}`
              : purchasedItemType === "mode_fantome"
                ? `Achat effectué mais activation du Mode Fantôme échouée : ${immediateEffectError.message}`
              : `Achat effectué mais effet Robin des Bois échoué : ${immediateEffectError.message}`,
        };
      }

      revalidatePath(`/g/${parsed.data.groupId}`);
      revalidatePath("/profile");
      return {
        success: true,
        immediateItemType: purchasedItemType,
      };
    }
  }

  revalidatePath(`/g/${parsed.data.groupId}`);
  revalidatePath("/profile");
  return { success: true };
}

export async function purchaseImmediateMalusWithTarget(args: {
  itemId: string;
  groupId: string;
  targetProfileId: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  if (args.targetProfileId === user.id) {
    return { error: "Tu ne peux pas te cibler toi-même" };
  }

  const { data: targetMembership } = await supabase
    .from("members")
    .select("profile_id")
    .eq("group_id", args.groupId)
    .eq("profile_id", args.targetProfileId)
    .maybeSingle();

  if (!targetMembership) {
    return { error: "Cible invalide pour ce groupe" };
  }

  const { data: shopItem } = await supabase
    .from("shop_items")
    .select("item_type")
    .eq("id", args.itemId)
    .maybeSingle();
  const { data: globalItem } = shopItem
    ? ({ data: null } as { data: { item_type: string } | null })
    : await supabase
        .from("global_shop_items")
        .select("item_type")
        .eq("id", args.itemId)
        .maybeSingle();

  const itemType = shopItem?.item_type ?? globalItem?.item_type ?? null;
  const isLocalItem = !!shopItem;
  if (itemType !== "menottes" && itemType !== "embargo") {
    return { error: "Cet item ne supporte pas l'application immédiate ciblée" };
  }

  const { error: purchaseError } = await supabase.rpc("purchase_item", {
    p_item_id: args.itemId,
    p_group_id: args.groupId,
  });

  if (purchaseError) {
    if (purchaseError.message.includes("Insufficient points"))
      return { error: "Points insuffisants" };
    if (purchaseError.message.includes("out of stock"))
      return { error: "Rupture de stock" };
    if (purchaseError.message.includes("Not a member"))
      return { error: "Tu n'es pas membre de ce groupe" };
    if (purchaseError.message.includes("Item not purchasable")) {
      return { error: "Cet item n'est pas disponible à l'achat" };
    }
    if (purchaseError.message.includes("disabled for this group")) {
      return { error: "Cet item est désactivé dans ce groupe" };
    }
    if (purchaseError.message.includes("handcuffed")) {
      return { error: "Tu es sous l'effet des menottes pendant 12h" };
    }
    if (purchaseError.message.includes("embargoed")) {
      return { error: "Tu es sous embargo et ne peux pas accéder au store" };
    }
    return { error: purchaseError.message };
  }

  const { data: invItem } = await supabase
    .from("inventory")
    .select("id")
    .eq("profile_id", user.id)
    .eq(isLocalItem ? "shop_item_id" : "global_shop_item_id", args.itemId)
    .eq("purchased_group_id", args.groupId)
    .is("used_at", null)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invItem) {
    return { error: "Achat effectué, mais item introuvable pour appliquer l'effet" };
  }

  const { data, error } = await supabase.rpc("use_inventory_item_effect", {
    p_inventory_id: invItem.id,
    p_target_profile_id: args.targetProfileId,
    p_payload: {},
  });

  if (error) {
    if (error.message.includes("already used")) {
      return { error: "Item déjà utilisé" };
    }
    if (error.message.includes("Invalid target")) {
      return { error: "Cible invalide pour cet item" };
    }
    return { error: error.message };
  }

  await awardBadges(user.id);
  revalidatePath(`/g/${args.groupId}`);
  revalidatePath(`/g/${args.groupId}/manage`);
  revalidatePath("/profile");

  const payload = (data ?? {}) as { item_type?: string };
  return {
    success: true,
    itemType: payload.item_type ?? itemType,
  };
}

export async function getShopItems(groupId: string) {
  const supabase = await createClient();

  const [{ data: customItems }, { data: globalItems }] = await Promise.all([
    supabase
      .from("shop_items")
      .select("*")
      .eq("group_id", groupId)
      .neq("item_type", "item_49_3")
      .order("created_at", { ascending: false }),
    supabase
      .from("group_enabled_items")
      .select(
        "enabled, global_shop_items!inner(id, item_type, name, description, price, stock, is_active_global)",
      )
      .eq("group_id", groupId)
      .eq("enabled", true),
  ]);

  const customRows: ShopItemView[] = (customItems ?? []).map((item) => ({
    ...item,
    source: "custom",
  }));

  const globalRows = (globalItems ?? [])
    .map((row): ShopItemView | null => {
      const item = row.global_shop_items as {
        id: string;
        item_type: string;
        name: string;
        description: string | null;
        price: number;
        stock: number | null;
        is_active_global: boolean;
      } | null;
      if (!item || !item.is_active_global) return null;
      return {
        id: item.id,
        group_id: groupId,
        name: item.name,
        description: item.description,
        price: item.price,
        stock: item.stock,
        item_type: item.item_type,
        source: "global" as const,
      };
    })
    .filter((v): v is ShopItemView => v !== null);

  const rows = [...customRows, ...globalRows];
  const deduped: ShopItemView[] = [];
  const seenSystemTypes = new Set<string>();

  for (const item of rows) {
    if (!SYSTEM_ITEM_TYPES.has(item.item_type)) {
      deduped.push(item);
      continue;
    }
    if (seenSystemTypes.has(item.item_type)) continue;
    seenSystemTypes.add(item.item_type);
    deduped.push(item);
  }

  return sortShopItemsByCategoryAndPrice(deduped);
}

export async function getGlobalItemsWithGroupState(groupId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_enabled_items")
    .select("enabled, global_shop_items!inner(id, item_type, name, price, is_active_global)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  return (data ?? [])
    .map((row) => {
      const item = row.global_shop_items as {
        id: string;
        item_type: string;
        name: string;
        price: number;
        is_active_global: boolean;
      } | null;
      if (!item || !item.is_active_global) return null;
      return {
        id: item.id,
        itemType: item.item_type,
        name: item.name,
        price: item.price,
        enabled: row.enabled,
      };
    })
    .filter((v): v is { id: string; itemType: string; name: string; price: number; enabled: boolean } => v !== null);
}

export async function toggleGlobalItemForGroup(formData: FormData): Promise<void> {
  const groupId = String(formData.get("groupId") ?? "");
  const globalItemId = String(formData.get("globalItemId") ?? "");
  const enabled = String(formData.get("enabled") ?? "true") === "true";
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", groupId)
    .eq("profile_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return;
  }

  const { error } = await supabase.from("group_enabled_items").upsert({
    group_id: groupId,
    global_item_id: globalItemId,
    enabled,
  });

  if (error) return;

  revalidatePath(`/g/${groupId}/manage`);
  revalidatePath(`/g/${groupId}`);
}

export async function getEffectiveShopPrices(groupId: string) {
  const parsed = getEffectiveShopPricesSchema.safeParse({ groupId });
  if (!parsed.success) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_group_shop_effective_prices", {
    p_group_id: parsed.data.groupId,
  });

  if (error || !data) return {};

  return (data as { item_id: string; effective_price: number }[]).reduce(
    (acc, row) => {
      acc[row.item_id] = row.effective_price;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export async function getMyInventory() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: customInventory } = await supabase
    .from("inventory")
    .select("*, shop_items(name, description, price, item_type, group_id, groups(name))")
    .eq("profile_id", user.id)
    .not("shop_item_id", "is", null)
    .order("purchased_at", { ascending: false });

  const { data: globalInventory } = await supabase
    .from("inventory")
    .select("id, profile_id, purchased_at, used_at, used_on_challenge_id, purchased_group_id, global_shop_items(name, description, price, item_type)")
    .eq("profile_id", user.id)
    .not("global_shop_item_id", "is", null)
    .order("purchased_at", { ascending: false });

  const groupIds = [
    ...new Set(
      (globalInventory ?? [])
        .map((row) => row.purchased_group_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const groupMap = new Map<string, string>();
  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from("groups")
      .select("id, name")
      .in("id", groupIds);
    for (const group of groups ?? []) {
      groupMap.set(group.id, group.name);
    }
  }

  const mappedGlobal = (globalInventory ?? []).map((row) => {
    const item = row.global_shop_items as {
      name: string;
      description: string | null;
      price: number;
      item_type: string;
    } | null;
    return {
      id: row.id,
      profile_id: row.profile_id,
      purchased_at: row.purchased_at,
      used_at: row.used_at,
      used_on_challenge_id: row.used_on_challenge_id,
      shop_items: item
        ? {
            ...item,
            group_id: row.purchased_group_id,
            groups: row.purchased_group_id
              ? { name: groupMap.get(row.purchased_group_id) ?? "Inconnu" }
              : null,
          }
        : null,
    };
  });

  return [...(customInventory ?? []), ...mappedGlobal].sort(
    (a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime(),
  );
}

export async function getUserItemsByType(groupId: string, itemType: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("inventory")
    .select("id, purchased_at, shop_items!inner(name, item_type, group_id)")
    .eq("profile_id", user.id)
    .is("used_at", null)
    .eq("shop_items.item_type", itemType)
    .eq("shop_items.group_id", groupId);

  const { data: globalData } = await supabase
    .from("inventory")
    .select("id, purchased_at, global_shop_items!inner(name, item_type), purchased_group_id")
    .eq("profile_id", user.id)
    .is("used_at", null)
    .eq("purchased_group_id", groupId)
    .eq("global_shop_items.item_type", itemType);

  const mappedGlobal = (globalData ?? []).map((row) => {
    const item = row.global_shop_items as { name: string; item_type: string } | null;
    return {
      id: row.id,
      purchased_at: row.purchased_at,
      shop_items: {
        name: item?.name ?? "Item",
        item_type: item?.item_type ?? "custom",
        group_id: groupId,
      },
    };
  });

  return [...(data ?? []), ...mappedGlobal];
}

export async function getMyEffectItems(groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("inventory")
    .select("id, purchased_at, shop_items!inner(name, item_type, group_id)")
    .eq("profile_id", user.id)
    .is("used_at", null)
    .eq("shop_items.group_id", groupId)
    .neq("shop_items.item_type", "custom")
    .neq("shop_items.item_type", "joker")
    .neq("shop_items.item_type", "booster")
    .neq("shop_items.item_type", "voleur")
    .neq("shop_items.item_type", "item_49_3");

  const { data: globalData } = await supabase
    .from("inventory")
    .select("id, purchased_at, global_shop_items!inner(name, item_type), purchased_group_id")
    .eq("profile_id", user.id)
    .is("used_at", null)
    .eq("purchased_group_id", groupId);

  const mappedLocal = (data ?? []).map((row) => {
    const shop = row.shop_items as { name: string; item_type: string } | null;
    return {
      id: row.id,
      purchasedAt: row.purchased_at,
      itemType: (shop?.item_type ?? "custom") as StoreItemType,
      name: shop?.name ?? "Item",
    };
  });

  const mappedGlobal = (globalData ?? [])
    .map((row) => {
      const item = row.global_shop_items as { name: string; item_type: string } | null;
      if (!item) return null;
      if (["joker", "booster", "voleur", "item_49_3", "custom"].includes(item.item_type)) {
        return null;
      }
      return {
        id: row.id,
        purchasedAt: row.purchased_at,
        itemType: item.item_type as StoreItemType,
        name: item.name,
      };
    })
    .filter((v): v is { id: string; purchasedAt: string; itemType: StoreItemType; name: string } => v !== null);

  return [...mappedLocal, ...mappedGlobal];
}

export async function getGroupJokerIntel(groupId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_group_hidden_joker_counts", {
    p_group_id: groupId,
  });
  if (error) {
    if (error.message.includes("Snitch effect not active")) {
      return { error: "Mouchard inactif (active-le d'abord)" };
    }
    return { error: error.message };
  }
  return {
    success: true,
    rows: (data ?? []) as { profile_id: string; username: string; jokers_available: number }[],
  };
}
