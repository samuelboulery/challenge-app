"use server";

import { createClient } from "@/lib/supabase/server";

export async function getMyBadges() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("user_badges")
    .select("*, badges(*)")
    .eq("profile_id", user.id)
    .order("earned_at", { ascending: false });

  return data ?? [];
}

export async function getAllBadges() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("badges")
    .select("*")
    .order("condition_value", { ascending: true });

  return data ?? [];
}

export async function getBadgeProgress() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { challenges_won: 0, items_purchased: 0, groups_joined: 0 };

  const [challengesResult, inventoryResult, groupsResult] = await Promise.all([
    supabase
      .from("challenges")
      .select("*", { count: "exact", head: true })
      .eq("target_id", user.id)
      .eq("status", "validated"),
    supabase
      .from("inventory")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", user.id),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", user.id),
  ]);

  return {
    challenges_won: challengesResult.count ?? 0,
    items_purchased: inventoryResult.count ?? 0,
    groups_joined: groupsResult.count ?? 0,
  };
}
