"use server";

import { createClient } from "@/lib/supabase/server";
import { getShopItems } from "@/app/(app)/groups/[id]/shop-actions";
import type { ChallengeStatus } from "@/types/database.types";

type ChallengeWithProfiles = {
  id: string;
  title: string;
  points: number;
  status: ChallengeStatus;
  group_id: string;
  creator_id: string;
  target_id: string;
  created_at: string;
  creator: { username: string } | null;
  target: { username: string } | null;
};

type PendingActionKind =
  | "challenge_received"
  | "proof_validation"
  | "price_validation";

type PendingAction = {
  kind: PendingActionKind;
  challenge: ChallengeWithProfiles;
};

export async function getGroupHomeData(groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      profile: null,
      currentGroupPoints: 0,
      pendingActions: [],
      recentActivity: [],
      leaderboard: [],
      shopItems: [],
      groupMembers: [],
      isAdmin: false,
      userId: null,
    };
  }

  const [
    profileResult,
    pendingReceivedResult,
    pendingValidationByCreatorResult,
    pendingNegotiatingCandidatesResult,
    pendingProofCandidatesResult,
    recentResult,
    ,
    { data: leaderboardData },
    { data: seasonRows },
    shopItems,
    { data: currentMember },
    { data: allMembers },
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
      .eq("status", "negotiating")
      .neq("creator_id", user.id)
      .neq("target_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("challenges")
      .select(
        "*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username)",
      )
      .eq("group_id", groupId)
      .eq("status", "proof_submitted")
      .neq("creator_id", user.id)
      .neq("target_id", user.id)
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

    supabase.rpc("ensure_group_current_season", {
      p_group_id: groupId,
    }),

    supabase.rpc("get_group_season_leaderboard", {
      p_group_id: groupId,
    }),

    supabase
      .from("group_seasons")
      .select("season_key, crown_holder_profile_id")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("starts_at", { ascending: false })
      .limit(1),

    getShopItems(groupId),

    supabase
      .from("members")
      .select("role")
      .eq("group_id", groupId)
      .eq("profile_id", user.id)
      .single(),
    supabase
      .from("members")
      .select("profile_id, profiles(username)")
      .eq("group_id", groupId),
  ]);

  const leaderboard = (leaderboardData ?? [])
    .map((entry) => ({
      profileId: entry.profile_id,
      username: entry.username ?? "Utilisateur",
      totalPoints: entry.group_points ?? 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const currentGroupPoints =
    leaderboard.find((entry) => entry.profileId === user.id)?.totalPoints ?? 0;
  const activeSeason = seasonRows?.[0] ?? null;

  const role = currentMember?.role;
  const isAdmin = role === "owner" || role === "admin";

  const pendingActions: PendingAction[] = [
    ...((pendingReceivedResult.data ?? []) as ChallengeWithProfiles[]).map(
      (challenge) => ({ kind: "challenge_received" as const, challenge }),
    ),
    ...((pendingValidationByCreatorResult.data ?? []) as ChallengeWithProfiles[]).map(
      (challenge) => ({ kind: "proof_validation" as const, challenge }),
    ),
  ];

  const isMember = !!currentMember;
  if (isMember) {
    const negotiatingCandidates =
      (pendingNegotiatingCandidatesResult.data ?? []) as ChallengeWithProfiles[];

    const negotiationChecks = await Promise.all(
      negotiatingCandidates.map(async (challenge) => {
        const { data, error } = await supabase.rpc("get_challenge_price_state", {
          p_challenge_id: challenge.id,
        });
        if (error) return false;

        const state = data as {
          challenge_status?: string;
          user_vote?: string | null;
        } | null;

        return (
          state?.challenge_status === "negotiating" &&
          !state.user_vote
        );
      }),
    );

    negotiatingCandidates.forEach((challenge, idx) => {
      if (negotiationChecks[idx]) {
        pendingActions.push({ kind: "price_validation", challenge });
      }
    });

    const proofCandidates =
      (pendingProofCandidatesResult.data ?? []) as ChallengeWithProfiles[];
    if (proofCandidates.length > 0) {
      const proofIds = proofCandidates.map((challenge) => challenge.id);
      const { data: existingVotes } = await supabase
        .from("challenge_votes")
        .select("challenge_id")
        .eq("voter_id", user.id)
        .in("challenge_id", proofIds);

      const votedChallengeIds = new Set(
        (existingVotes ?? []).map((vote) => vote.challenge_id),
      );

      proofCandidates.forEach((challenge) => {
        if (!votedChallengeIds.has(challenge.id)) {
          pendingActions.push({ kind: "proof_validation", challenge });
        }
      });
    }
  }

  pendingActions.sort(
    (a, b) =>
      new Date(b.challenge.created_at).getTime() -
      new Date(a.challenge.created_at).getTime(),
  );

  return {
    profile: profileResult.data,
    currentGroupPoints,
    pendingActions,
    recentActivity: recentResult.data ?? [],
    leaderboard,
    seasonKey: activeSeason?.season_key ?? null,
    crownHolderProfileId: activeSeason?.crown_holder_profile_id ?? null,
    shopItems,
    groupMembers: (allMembers ?? []).map((member) => ({
      id: member.profile_id,
      username:
        (member.profiles as { username: string } | null)?.username ?? "Utilisateur",
    })),
    isAdmin,
    userId: user.id,
  };
}
