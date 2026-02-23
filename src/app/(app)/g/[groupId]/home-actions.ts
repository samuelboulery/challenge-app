"use server";

import { createClient } from "@/lib/supabase/server";
import { getShopItems } from "@/app/(app)/groups/[id]/shop-actions";

export async function getGroupHomeData(groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      profile: null,
      pendingActions: [],
      recentActivity: [],
      leaderboard: [],
      shopItems: [],
      isAdmin: false,
      userId: null,
    };
  }

  const [
    profileResult,
    pendingReceivedResult,
    pendingValidationResult,
    recentResult,
    { data: leaderboardData },
    shopItems,
    { data: currentMember },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),

    supabase
      .from("challenges")
      .select(
        "*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username)",
      )
      .eq("group_id", groupId)
      .eq("target_id", user.id)
      .eq("status", "proposed")
      .order("created_at", { ascending: false }),

    supabase
      .from("challenges")
      .select(
        "*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username)",
      )
      .eq("group_id", groupId)
      .eq("creator_id", user.id)
      .eq("status", "proof_submitted")
      .order("created_at", { ascending: false }),

    supabase
      .from("challenges")
      .select(
        "*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username)",
      )
      .eq("group_id", groupId)
      .or(`creator_id.eq.${user.id},target_id.eq.${user.id}`)
      .order("updated_at", { ascending: false })
      .limit(5),

    supabase
      .from("members")
      .select("profile_id, profiles(username, total_points)")
      .eq("group_id", groupId),

    getShopItems(groupId),

    supabase
      .from("members")
      .select("role")
      .eq("group_id", groupId)
      .eq("profile_id", user.id)
      .single(),
  ]);

  const leaderboard = (leaderboardData ?? [])
    .map((m) => {
      const profile = m.profiles as { username: string; total_points: number } | null;
      return {
        profileId: m.profile_id,
        username: profile?.username ?? "Utilisateur",
        totalPoints: profile?.total_points ?? 0,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const role = currentMember?.role;
  const isAdmin = role === "owner" || role === "admin";

  return {
    profile: profileResult.data,
    pendingActions: [
      ...(pendingReceivedResult.data ?? []),
      ...(pendingValidationResult.data ?? []),
    ],
    recentActivity: recentResult.data ?? [],
    leaderboard,
    shopItems,
    isAdmin,
    userId: user.id,
  };
}
