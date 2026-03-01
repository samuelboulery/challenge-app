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

export async function addShopItem(formData: FormData) {
  const parsed = parseFormData(addShopItemSchema, formData);
  if (!parsed.success) return { error: parsed.error };

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
    .single();

  const { error } = await supabase.rpc("purchase_item", {
    p_item_id: parsed.data.itemId,
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
    return { error: error.message };
  }

  await awardBadges(user.id);

  if (shopItem?.item_type === "voleur") {
    const { data: invItem } = await supabase
      .from("inventory")
      .select("id")
      .eq("profile_id", user.id)
      .eq("shop_item_id", parsed.data.itemId)
      .is("used_at", null)
      .order("purchased_at", { ascending: false })
      .limit(1)
      .single();

    if (invItem) {
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
  }

  revalidatePath(`/g/${parsed.data.groupId}`);
  revalidatePath("/profile");
  return { success: true };
}

export async function getShopItems(groupId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("shop_items")
    .select("*")
    .eq("group_id", groupId)
    .neq("item_type", "item_49_3")
    .order("created_at", { ascending: false });

  return data ?? [];
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

  const { data } = await supabase
    .from("inventory")
    .select("*, shop_items(name, description, price, item_type, group_id, groups(name))")
    .eq("profile_id", user.id)
    .order("purchased_at", { ascending: false });

  return data ?? [];
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

  return data ?? [];
}
