"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function awardBadges(profileId: string) {
  const supabase = await createClient();
  await supabase.rpc("check_and_award_badges", { p_profile_id: profileId });
}

async function notify(
  profileId: string,
  type: string,
  title: string,
  body: string,
  metadata: Record<string, unknown> = {},
) {
  const supabase = await createClient();
  await supabase.rpc("create_notification", {
    p_profile_id: profileId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_metadata: metadata,
  });

  try {
    const { sendPushToUser } = await import(
      "@/app/(app)/notifications/push-actions"
    );
    await sendPushToUser(profileId, title, body);
  } catch {
    // Push not available
  }
}

export async function addShopItem(formData: FormData) {
  const supabase = await createClient();

  const groupId = formData.get("groupId") as string;
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const price = parseInt(formData.get("price") as string, 10);
  const stockRaw = formData.get("stock") as string;
  const stock = stockRaw ? parseInt(stockRaw, 10) : null;
  const itemType = (formData.get("itemType") as string) || "custom";

  const { error } = await supabase.from("shop_items").insert({
    group_id: groupId,
    name,
    description,
    price,
    stock,
    item_type: itemType,
  });

  if (error) return { error: error.message };

  revalidatePath(`/g/${groupId}/manage`);
  revalidatePath(`/g/${groupId}`);
  return { success: true };
}

export async function deleteShopItem(formData: FormData) {
  const supabase = await createClient();

  const itemId = formData.get("itemId") as string;
  const groupId = formData.get("groupId") as string;

  const { error } = await supabase
    .from("shop_items")
    .delete()
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath(`/g/${groupId}/manage`);
  revalidatePath(`/g/${groupId}`);
  return { success: true };
}

export async function updateShopItem(formData: FormData) {
  const supabase = await createClient();

  const itemId = formData.get("itemId") as string;
  const groupId = formData.get("groupId") as string;
  const price = parseInt(formData.get("price") as string, 10);
  const stockRaw = formData.get("stock") as string;
  const stock = stockRaw ? parseInt(stockRaw, 10) : null;

  if (isNaN(price) || price < 1) return { error: "Prix invalide" };

  const { error } = await supabase
    .from("shop_items")
    .update({ price, stock })
    .eq("id", itemId);

  if (error) return { error: error.message };

  revalidatePath(`/g/${groupId}/manage`);
  revalidatePath(`/g/${groupId}`);
  return { success: true };
}

export async function purchaseItem(formData: FormData) {
  const supabase = await createClient();

  const itemId = formData.get("itemId") as string;
  const groupId = formData.get("groupId") as string;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  // Check item type before purchasing
  const { data: shopItem } = await supabase
    .from("shop_items")
    .select("item_type")
    .eq("id", itemId)
    .single();

  const { error } = await supabase.rpc("purchase_item", {
    p_item_id: itemId,
  });

  if (error) {
    if (error.message.includes("Insufficient points"))
      return { error: "Points insuffisants" };
    if (error.message.includes("out of stock"))
      return { error: "Rupture de stock" };
    if (error.message.includes("Not a member"))
      return { error: "Tu n'es pas membre de ce groupe" };
    return { error: error.message };
  }

  await awardBadges(user.id);

  // Auto-use voleur immediately after purchase
  if (shopItem?.item_type === "voleur") {
    const { data: invItem } = await supabase
      .from("inventory")
      .select("id")
      .eq("profile_id", user.id)
      .eq("shop_item_id", itemId)
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
        revalidatePath(`/g/${groupId}`);
        revalidatePath("/profile");
        return { error: `Achat effectué mais vol échoué : ${voleurError.message}` };
      }

      const parsed = voleurResult as {
        stolen: number;
        victim_id: string;
        victim_username: string;
      };

      await notify(
        parsed.victim_id,
        "challenge_penalty",
        "Vol de points !",
        `${user.id} t'a volé ${parsed.stolen} points avec un Voleur !`,
        { group_id: groupId },
      );

      revalidatePath(`/g/${groupId}`);
      revalidatePath("/profile");
      return {
        success: true,
        voleur: {
          stolen: parsed.stolen,
          victimUsername: parsed.victim_username,
        },
      };
    }
  }

  revalidatePath(`/g/${groupId}`);
  revalidatePath("/profile");
  return { success: true };
}

export async function getShopItems(groupId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("shop_items")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  return data ?? [];
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
