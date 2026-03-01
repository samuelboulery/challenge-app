"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ChallengeStatus } from "@/types/database.types";
import {
  createChallengeSchema,
  submitProofSchema,
  voteOnChallengeSchema,
  voteChallengePriceSchema,
  contestChallengeSchema,
  creatorDecideCounterProposalSchema,
  cancelChallengeByCreatorSchema,
  parseFormData,
} from "@/lib/validations";
import { notify } from "@/lib/notifications";
import { awardBadges } from "@/lib/badges";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getEligibleValidatorIds(
  supabase: ServerClient,
  groupId: string,
  creatorId: string,
  targetId: string,
) {
  const { data, error } = await supabase
    .from("members")
    .select("profile_id")
    .eq("group_id", groupId)
    .neq("profile_id", creatorId)
    .neq("profile_id", targetId);

  if (error) {
    return { error: error.message, validatorIds: [] as string[] };
  }

  return {
    validatorIds: (data ?? []).map((m) => m.profile_id),
  };
}

async function notifyValidationRequest(
  validatorIds: string[],
  type: string,
  title: string,
  body: string,
  metadata: Record<string, unknown>,
) {
  const failures: string[] = [];

  await Promise.all(
    validatorIds.map(async (validatorId) => {
      const notifResult = await notify(validatorId, type, title, body, metadata);
      if ("error" in notifResult) {
        failures.push(notifResult.error ?? "Erreur de notification inconnue");
      }
    }),
  );

  return failures;
}

export async function createChallenge(formData: FormData) {
  const parsed = parseFormData(createChallengeSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  if (parsed.data.targetId === user.id) {
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
      group_id: parsed.data.groupId,
      creator_id: user.id,
      target_id: parsed.data.targetId,
      title: parsed.data.title,
      description: parsed.data.description,
      points: parsed.data.points,
      deadline: parsed.data.deadline,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const targetNotifResult = await notify(
    parsed.data.targetId,
    "challenge_received",
    "Nouveau défi !",
    `${profile?.username ?? "Quelqu'un"} t'a lancé le défi "${parsed.data.title}"`,
    { group_id: parsed.data.groupId, challenge_id: newChallenge.id },
  );
  if ("error" in targetNotifResult) {
    return { error: targetNotifResult.error ?? "Erreur de notification inconnue" };
  }

  revalidatePath(`/g/${parsed.data.groupId}`);
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
    if (challenge.status === "negotiating") {
      return { error: "Le tarif du défi doit d'abord être validé par le groupe" };
    }
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

export async function contestChallenge(challengeId: string) {
  const parsed = contestChallengeSchema.safeParse({ challengeId });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides";
    return { error: msg };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id, creator_id, target_id, title")
    .eq("id", challengeId)
    .single();
  if (!challenge) return { error: "Défi introuvable" };

  const { data, error } = await supabase.rpc("start_challenge_contestation", {
    p_challenge_id: challengeId,
  });
  if (error) {
    if (error.message.includes("Not allowed")) {
      return { error: "Seule la cible du défi peut contester" };
    }
    if (error.message.includes("Already contested")) {
      return {
        error:
          "Ce défi a déjà été contesté une fois. Tu peux seulement l'accepter ou le refuser.",
      };
    }
    if (error.message.includes("Invalid status")) {
      return { error: "Le défi doit être proposé pour être contesté" };
    }
    if (error.message.includes("No eligible voters")) {
      return {
        error:
          "Aucun membre disponible pour voter. Tu dois accepter ou refuser ce défi.",
      };
    }
    return { error: error.message };
  }

  const validatorsResult = await getEligibleValidatorIds(
    supabase,
    challenge.group_id,
    challenge.creator_id,
    challenge.target_id,
  );
  if ("error" in validatorsResult) {
    return { error: validatorsResult.error ?? "Erreur de notification inconnue" };
  }

  const validatorFailures = await notifyValidationRequest(
    validatorsResult.validatorIds,
    "challenge_contestation_requested",
    "Contestation de défi",
    `Le défi "${challenge.title}" est contesté. Vote: annulation ou contre-proposition.`,
    { group_id: challenge.group_id, challenge_id: challengeId },
  );
  if (validatorFailures.length > 0) {
    return { error: validatorFailures[0] };
  }

  revalidatePath(`/g/${challenge.group_id}`);
  revalidatePath(`/g/${challenge.group_id}/challenges/${challengeId}`);
  return { success: true, ...(data as Record<string, unknown>) };
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
      return { error: "Statut invalide pour cette action" };
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
    .select("group_id, points, target_id, status")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.target_id !== user.id) return { error: "Action non autorisée" };
  if (challenge.status !== "proposed" && challenge.status !== "accepted") {
    return { error: "Statut invalide pour cette action" };
  }

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
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

export async function submitProof(formData: FormData) {
  const parsed = parseFormData(submitProofSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", parsed.data.challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.target_id !== user.id) return { error: "Action non autorisée" };
  if (challenge.status !== "accepted") {
    return { error: "Le défi doit être accepté avant de soumettre une preuve" };
  }

  const { error: proofError } = await supabase.from("proofs").insert({
    challenge_id: parsed.data.challengeId,
    submitted_by: user.id,
    comment: parsed.data.comment,
    media_url: parsed.data.mediaUrl,
  });

  if (proofError) return { error: proofError.message };

  const { error: updateError } = await supabase
    .from("challenges")
    .update({ status: "proof_submitted" as ChallengeStatus })
    .eq("id", parsed.data.challengeId);

  if (updateError) return { error: updateError.message };

  const creatorNotifResult = await notify(
    challenge.creator_id,
    "proof_submitted",
    "Preuve soumise",
    `Une preuve a été soumise pour le défi "${challenge.title}"`,
    { challenge_id: parsed.data.challengeId, group_id: challenge.group_id },
  );
  if ("error" in creatorNotifResult) {
    return { error: creatorNotifResult.error ?? "Erreur de notification inconnue" };
  }

  const validatorsResult = await getEligibleValidatorIds(
    supabase,
    challenge.group_id,
    challenge.creator_id,
    challenge.target_id,
  );
  if ("error" in validatorsResult) {
    return { error: validatorsResult.error ?? "Erreur de notification inconnue" };
  }

  const validatorFailures = await notifyValidationRequest(
    validatorsResult.validatorIds,
    "proof_validation_requested",
    "Validation de preuve requise",
    `Le défi "${challenge.title}" attend ta validation de preuve.`,
    { challenge_id: parsed.data.challengeId, group_id: challenge.group_id },
  );
  if (validatorFailures.length > 0) {
    return { error: validatorFailures[0] };
  }

  revalidatePath(`/g/${challenge.group_id}`);
  return { success: true };
}

export async function voteOnChallenge(challengeId: string, vote: string) {
  const parsed = voteOnChallengeSchema.safeParse({ challengeId, vote });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides";
    return { error: msg };
  }

  const supabase = await createClient();

  const { data: challenge } = await supabase
    .from("challenges")
    .select("target_id, title, points, group_id, booster_inventory_id")
    .eq("id", challengeId)
    .single();

  const { data: result, error } = await supabase.rpc("vote_on_challenge", {
    p_challenge_id: challengeId,
    p_vote: parsed.data.vote,
  });

  if (error) {
    if (error.message.includes("Target cannot vote"))
      return { error: "La cible ne peut pas voter" };
    if (error.message.includes("Invalid status"))
      return { error: "Statut invalide" };
    if (error.message.includes("Not a group member"))
      return { error: "Tu ne fais pas partie de ce groupe" };
    return { error: error.message };
  }

  const voteResult = result as {
    status: string;
    approvals: number;
    rejections: number;
    threshold: number;
    reward?: number;
  };

  if (challenge) {
    if (voteResult.status === "validated") {
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
    } else if (voteResult.status === "rejected") {
      await notify(
        challenge.target_id,
        "challenge_rejected",
        "Preuve refusée",
        `Ta preuve pour le défi "${challenge.title}" a été refusée. Réessaie !`,
        { challenge_id: challengeId, group_id: challenge.group_id },
      );
    }

    revalidatePath(`/g/${challenge.group_id}`);
  }

  revalidatePath("/profile");
  return { success: true, ...voteResult };
}

export async function voteChallengePrice(
  challengeId: string,
  vote: "counter" | "cancel" | "keep",
  counterPoints?: number,
): Promise<
  | { error: string }
  | {
      success: true;
      status?: string;
      round?: number;
      proposed_points?: number;
      approvals?: number;
      rejections?: number;
      keeps?: number;
      threshold?: number;
    }
> {
  const parsed = voteChallengePriceSchema.safeParse({
    challengeId,
    vote,
    counterPoints: counterPoints ?? null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides";
    return { error: msg };
  }

  const supabase = await createClient();

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id, title, creator_id, target_id")
    .eq("id", challengeId)
    .single();

  const { data, error } = await supabase.rpc("vote_challenge_contestation", {
    p_challenge_id: challengeId,
    p_vote: parsed.data.vote,
    p_counter_points: parsed.data.counterPoints ?? null,
  });

  if (error) {
    if (error.message.includes("Not allowed to vote contestation")) {
      return {
        error:
          "Seuls les autres membres (hors lanceur/cible) peuvent voter la contestation",
      };
    }
    if (error.message.includes("Invalid status")) {
      return { error: "Le défi n'est pas en phase de contestation" };
    }
    if (error.message.includes("Not a group member")) {
      return { error: "Tu ne fais pas partie de ce groupe" };
    }
    if (error.message.includes("Invalid counter proposal")) {
      return { error: "La contre-proposition doit être supérieure à 0" };
    }
    return { error: error.message };
  }

  const payload = (data ?? {}) as {
    status?: string;
    round?: number;
    proposed_points?: number;
    approvals?: number;
    rejections?: number;
    keeps?: number;
    threshold?: number;
    points?: number;
  };

  if (challenge?.group_id && payload.status === "counter_applied") {
    const body = `Le tarif du défi "${challenge.title}" a été ajusté à ${payload.points ?? payload.proposed_points ?? "?"} pts après vote du groupe.`;
    await Promise.all([
      notify(
        challenge.creator_id,
        "challenge_counter_proposal_applied",
        "Contestation résolue",
        body,
        { group_id: challenge.group_id, challenge_id: challengeId },
      ),
      notify(
        challenge.target_id,
        "challenge_counter_proposal_applied",
        "Contestation résolue",
        body,
        { group_id: challenge.group_id, challenge_id: challengeId },
      ),
    ]);
  } else if (
    challenge?.group_id &&
    payload.status === "cancelled_by_contestation"
  ) {
    const body = `Le défi "${challenge.title}" a été annulé après vote du groupe.`;
    await Promise.all([
      notify(
        challenge.creator_id,
        "challenge_cancelled_by_contestation",
        "Défi annulé",
        body,
        { group_id: challenge.group_id, challenge_id: challengeId },
      ),
      notify(
        challenge.target_id,
        "challenge_cancelled_by_contestation",
        "Défi annulé",
        body,
        { group_id: challenge.group_id, challenge_id: challengeId },
      ),
    ]);
  } else if (challenge?.group_id && payload.status === "kept_by_contestation") {
    const body = `Le défi "${challenge.title}" est maintenu tel quel après vote du groupe (${payload.points ?? "?"} pts).`;
    await Promise.all([
      notify(
        challenge.creator_id,
        "challenge_kept_by_contestation",
        "Contestation résolue",
        body,
        { group_id: challenge.group_id, challenge_id: challengeId },
      ),
      notify(
        challenge.target_id,
        "challenge_kept_by_contestation",
        "Contestation résolue",
        body,
        { group_id: challenge.group_id, challenge_id: challengeId },
      ),
    ]);
  }

  if (challenge?.group_id) {
    revalidatePath(`/g/${challenge.group_id}`);
    revalidatePath(`/g/${challenge.group_id}/challenges/${challengeId}`);
  }

  return { success: true, ...payload };
}

export async function creatorDecideCounterProposal(
  challengeId: string,
  action: "accept" | "counter",
  counterPoints?: number,
): Promise<
  | { error: string }
  | {
      success: true;
      status?: string;
      round?: number;
      proposed_points?: number;
      approvals?: number;
      rejections?: number;
      threshold?: number;
    }
> {
  const parsed = creatorDecideCounterProposalSchema.safeParse({
    challengeId,
    action,
    counterPoints: counterPoints ?? null,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides";
    return { error: msg };
  }

  const supabase = await createClient();

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id")
    .eq("id", challengeId)
    .single();

  const { data, error } = await supabase.rpc("creator_decide_counter_proposal", {
    p_challenge_id: challengeId,
    p_action: parsed.data.action,
    p_counter_points: parsed.data.counterPoints ?? null,
  });

  if (error) {
    if (error.message.includes("Not allowed")) {
      return { error: "Seul le lanceur peut décider de la contre-proposition" };
    }
    if (error.message.includes("Invalid status")) {
      return { error: "Le défi n'est plus en phase de négociation" };
    }
    if (error.message.includes("Invalid action")) {
      return { error: "Action invalide" };
    }
    if (error.message.includes("No active negotiation round")) {
      return { error: "Aucun tour de négociation actif" };
    }
    if (error.message.includes("Invalid counter proposal")) {
      return { error: "La contre-proposition doit être supérieure à 0" };
    }
    return { error: error.message };
  }

  if (challenge?.group_id) {
    revalidatePath(`/g/${challenge.group_id}`);
    revalidatePath(`/g/${challenge.group_id}/challenges/${challengeId}`);
  }

  const payload = (data ?? {}) as {
    status?: string;
    round?: number;
    proposed_points?: number;
    approvals?: number;
    rejections?: number;
    threshold?: number;
  };

  return { success: true, ...payload };
}

export async function cancelChallengeByCreator(challengeId: string) {
  const parsed = cancelChallengeByCreatorSchema.safeParse({ challengeId });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Données invalides";
    return { error: msg };
  }

  const supabase = await createClient();

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id")
    .eq("id", challengeId)
    .single();

  const { data, error } = await supabase.rpc("cancel_challenge_by_creator", {
    p_challenge_id: challengeId,
  });

  if (error) {
    if (error.message.includes("Not allowed")) {
      return { error: "Seul le lanceur du défi peut annuler ce défi" };
    }
    if (error.message.includes("Proof validation pending")) {
      return {
        error:
          "Impossible d'annuler pendant la validation de preuve en cours.",
      };
    }
    if (error.message.includes("Invalid status")) {
      return { error: "Ce défi ne peut plus être annulé" };
    }
    return { error: error.message };
  }

  if (challenge?.group_id) {
    revalidatePath(`/g/${challenge.group_id}`);
    revalidatePath(`/g/${challenge.group_id}/challenges/${challengeId}`);
  }

  return { success: true, ...(data as Record<string, unknown>) };
}

export async function getChallengePriceState(challengeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data, error } = await supabase.rpc("get_challenge_price_state", {
    p_challenge_id: challengeId,
  });

  if (error) {
    if (error.message.includes("Not a group member")) {
      return { error: "Tu ne fais pas partie de ce groupe" };
    }
    return { error: error.message };
  }

  return data as {
    challenge_status?: string;
    round?: number;
    proposed_points?: number;
    proposed_by?: string;
    approvals?: number;
    rejections?: number;
    keeps?: number;
    threshold?: number;
    validators_count?: number;
    user_vote?: string | null;
    votes?: { voter_id: string; username: string; vote: string }[];
  };
}

export async function getChallengeVotes(challengeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id, target_id")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };

  const [{ data: votes }, { count: memberCount }] = await Promise.all([
    supabase
      .from("challenge_votes")
      .select("voter_id, vote, profiles!challenge_votes_voter_id_fkey(username)")
      .eq("challenge_id", challengeId),
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", challenge.group_id)
      .neq("profile_id", challenge.target_id),
  ]);

  const eligible = memberCount ?? 1;
  const threshold = Math.max(1, Math.ceil(eligible / 4));
  const allVotes = votes ?? [];

  const approvals = allVotes.filter((v) => v.vote === "approve").length;
  const rejections = allVotes.filter((v) => v.vote === "reject").length;
  const userVote = allVotes.find((v) => v.voter_id === user.id)?.vote ?? null;

  const voters = allVotes.map((v) => ({
    id: v.voter_id,
    username: (v.profiles as { username: string } | null)?.username ?? "?",
    vote: v.vote,
  }));

  return {
    approvals,
    rejections,
    threshold,
    eligible,
    userVote,
    voters,
  };
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
