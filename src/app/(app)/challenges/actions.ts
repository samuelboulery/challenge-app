"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ChallengeStatus } from "@/types/database.types";

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
    // Push not available or failed silently
  }
}

async function awardBadges(profileId: string) {
  const supabase = await createClient();
  await supabase.rpc("check_and_award_badges", { p_profile_id: profileId });
}

export async function createChallenge(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const groupId = formData.get("groupId") as string;
  const targetId = formData.get("targetId") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const points = parseInt(formData.get("points") as string, 10);
  const deadlineRaw = formData.get("deadline") as string;
  const deadline = deadlineRaw || null;

  if (targetId === user.id) {
    return { error: "Tu ne peux pas te défier toi-même" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  const { data: newChallenge, error } = await supabase
    .from("challenges")
    .insert({
      group_id: groupId,
      creator_id: user.id,
      target_id: targetId,
      title,
      description,
      points,
      deadline,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await notify(
    targetId,
    "challenge_received",
    "Nouveau défi !",
    `${profile?.username ?? "Quelqu'un"} t'a lancé le défi "${title}"`,
    { group_id: groupId, challenge_id: newChallenge.id },
  );

  revalidatePath(`/g/${groupId}`);
  return { success: true };
}

async function updateChallengeStatus(
  challengeId: string,
  expectedStatus: ChallengeStatus,
  newStatus: ChallengeStatus,
  role: "creator" | "target",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };

  const allowedUser =
    role === "creator" ? challenge.creator_id : challenge.target_id;
  if (allowedUser !== user.id) return { error: "Action non autorisée" };

  if (challenge.status !== expectedStatus) {
    return { error: "Statut invalide pour cette action" };
  }

  const { error } = await supabase
    .from("challenges")
    .update({ status: newStatus })
    .eq("id", challengeId);

  if (error) return { error: error.message };

  revalidatePath(`/g/${challenge.group_id}`);
  return { success: true };
}

export async function acceptChallenge(
  challengeId: string,
  boosterInventoryId?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.target_id !== user.id) return { error: "Action non autorisée" };
  if (challenge.status !== "proposed") {
    return { error: "Statut invalide pour cette action" };
  }

  if (boosterInventoryId) {
    const { data: booster } = await supabase
      .from("inventory")
      .select("*, shop_items(item_type, group_id)")
      .eq("id", boosterInventoryId)
      .eq("profile_id", user.id)
      .is("used_at", null)
      .single();

    const shopItem = booster?.shop_items as {
      item_type: string;
      group_id: string;
    } | null;

    if (!booster || shopItem?.item_type !== "booster" || shopItem?.group_id !== challenge.group_id) {
      return { error: "Booster invalide" };
    }

    await supabase
      .from("inventory")
      .update({ used_at: new Date().toISOString(), used_on_challenge_id: challengeId })
      .eq("id", boosterInventoryId);

    await supabase
      .from("challenges")
      .update({ status: "accepted" as ChallengeStatus, booster_inventory_id: boosterInventoryId })
      .eq("id", challengeId);
  } else {
    await supabase
      .from("challenges")
      .update({ status: "accepted" as ChallengeStatus })
      .eq("id", challengeId);
  }

  revalidatePath(`/g/${challenge.group_id}`);
  return { success: true, boosted: !!boosterInventoryId };
}

export async function declineChallenge(
  challengeId: string,
  jokerInventoryId?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id, creator_id, title, points")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };

  const { data: result, error } = await supabase.rpc("decline_with_penalty", {
    p_challenge_id: challengeId,
    p_joker_inventory_id: jokerInventoryId ?? undefined,
  });

  if (error) {
    if (error.message.includes("Not the target"))
      return { error: "Action non autorisée" };
    if (error.message.includes("Invalid status"))
      return { error: "Statut invalide" };
    if (error.message.includes("Joker not found"))
      return { error: "Joker introuvable ou déjà utilisé" };
    return { error: error.message };
  }

  const parsed = result as { penalty: number; joker_used: boolean; free_declines_remaining: number };

  await notify(
    challenge.creator_id,
    "challenge_rejected",
    "Défi refusé",
    `Ton défi "${challenge.title}" a été refusé.`,
    { challenge_id: challengeId, group_id: challenge.group_id },
  );

  revalidatePath(`/g/${challenge.group_id}`);
  return {
    success: true,
    penalty: parsed.penalty,
    jokerUsed: parsed.joker_used,
    freeDeclines: parsed.free_declines_remaining,
  };
}

export async function getDeclineInfo(challengeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id, points")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };

  const weekStart = getWeekStart();

  const [{ count: weeklyDeclines }, { data: jokers }] = await Promise.all([
    supabase
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("target_id", user.id)
      .eq("group_id", challenge.group_id)
      .eq("status", "cancelled")
      .gte("updated_at", weekStart),
    supabase
      .from("inventory")
      .select("id, shop_items!inner(item_type, group_id)")
      .eq("profile_id", user.id)
      .is("used_at", null)
      .eq("shop_items.item_type", "joker")
      .eq("shop_items.group_id", challenge.group_id),
  ]);

  const declines = weeklyDeclines ?? 0;
  const availableJokers = jokers ?? [];
  const isFree = declines < 2;
  const penalty = isFree ? 0 : Math.max(1, Math.floor(challenge.points / 2));

  return {
    weeklyDeclines: declines,
    freeRemaining: Math.max(0, 2 - declines),
    isFree,
    penalty,
    availableJokers: availableJokers.map((j) => j.id),
    challengePoints: challenge.points,
  };
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

export async function rejectProof(challengeId: string) {
  const supabase = await createClient();
  const { data: challenge } = await supabase
    .from("challenges")
    .select("target_id, title, group_id")
    .eq("id", challengeId)
    .single();

  const result = await updateChallengeStatus(
    challengeId,
    "proof_submitted",
    "accepted",
    "creator",
  );

  if ("success" in result && challenge) {
    await notify(
      challenge.target_id,
      "challenge_rejected",
      "Preuve refusée",
      `Ta preuve pour le défi "${challenge.title}" a été refusée. Réessaie !`,
      { challenge_id: challengeId, group_id: challenge.group_id },
    );
  }

  return result;
}

export async function submitProof(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const challengeId = formData.get("challengeId") as string;
  const comment = (formData.get("comment") as string) || null;
  const mediaUrl = (formData.get("mediaUrl") as string) || null;

  const { data: challenge } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.target_id !== user.id) return { error: "Action non autorisée" };
  if (challenge.status !== "accepted") {
    return { error: "Le défi doit être accepté avant de soumettre une preuve" };
  }

  const { error: proofError } = await supabase.from("proofs").insert({
    challenge_id: challengeId,
    submitted_by: user.id,
    comment,
    media_url: mediaUrl,
  });

  if (proofError) return { error: proofError.message };

  const { error: updateError } = await supabase
    .from("challenges")
    .update({ status: "proof_submitted" as ChallengeStatus })
    .eq("id", challengeId);

  if (updateError) return { error: updateError.message };

  await notify(
    challenge.creator_id,
    "proof_submitted",
    "Preuve soumise",
    `Une preuve a été soumise pour le défi "${challenge.title}"`,
    { challenge_id: challengeId, group_id: challenge.group_id },
  );

  revalidatePath(`/g/${challenge.group_id}`);
  return { success: true };
}

export async function validateChallenge(challengeId: string) {
  const supabase = await createClient();

  const { data: challenge } = await supabase
    .from("challenges")
    .select("target_id, title, points, group_id, booster_inventory_id")
    .eq("id", challengeId)
    .single();

  const { error } = await supabase.rpc("validate_challenge", {
    p_challenge_id: challengeId,
  });

  if (error) {
    if (error.message.includes("Not the creator"))
      return { error: "Seul le créateur peut valider" };
    if (error.message.includes("Invalid status"))
      return { error: "Statut invalide" };
    return { error: error.message };
  }

  if (challenge) {
    const reward = challenge.booster_inventory_id
      ? challenge.points * 2
      : challenge.points;

    await notify(
      challenge.target_id,
      "challenge_validated",
      "Défi validé !",
      `Ton défi "${challenge.title}" a été validé. +${reward} points !${challenge.booster_inventory_id ? " (x2 Booster)" : ""}`,
      { challenge_id: challengeId, group_id: challenge.group_id },
    );

    await awardBadges(challenge.target_id);
  }

  if (challenge) {
    revalidatePath(`/g/${challenge.group_id}`);
  }
  revalidatePath("/profile");
  return { success: true };
}

export async function getMyGroupChallenges(groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { received: [], sent: [] };

  const selectQuery =
    "*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username)";

  const [{ data: received }, { data: sent }] = await Promise.all([
    supabase
      .from("challenges")
      .select(selectQuery)
      .eq("group_id", groupId)
      .eq("target_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("challenges")
      .select(selectQuery)
      .eq("group_id", groupId)
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    received: received ?? [],
    sent: sent ?? [],
  };
}

export async function getGroupChallenges(groupId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("challenges")
    .select("*, creator:profiles!challenges_creator_id_fkey(username), target:profiles!challenges_target_id_fkey(username)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(10);

  return data ?? [];
}
