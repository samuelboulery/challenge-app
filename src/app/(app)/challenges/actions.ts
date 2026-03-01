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
  applyInventoryItemEffectSchema,
  creatorDecideCounterProposalSchema,
  cancelChallengeByCreatorSchema,
  parseFormData,
} from "@/lib/validations";
import { notify } from "@/lib/notifications";
import { awardBadges } from "@/lib/badges";
import type { StoreItemType } from "@/lib/store-item-types";

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
  const titleRaw = formData.get("title");
  const descriptionRaw = formData.get("description");
  const deadlineRaw = formData.get("deadline");

  const raw = {
    groupId: formData.get("groupId"),
    targetIds: formData
      .getAll("targetIds")
      .filter((value): value is string => typeof value === "string" && value.length > 0),
    title: typeof titleRaw === "string" ? titleRaw : "",
    description: typeof descriptionRaw === "string" && descriptionRaw !== "" ? descriptionRaw : null,
    points: Number(formData.get("points")),
    deadline: typeof deadlineRaw === "string" && deadlineRaw !== "" ? deadlineRaw : null,
    selectedItemInventoryId:
      typeof formData.get("selectedItemInventoryId") === "string" &&
      formData.get("selectedItemInventoryId") !== ""
        ? String(formData.get("selectedItemInventoryId"))
        : null,
    selectedItemType:
      typeof formData.get("selectedItemType") === "string" &&
      formData.get("selectedItemType") !== ""
        ? String(formData.get("selectedItemType"))
        : null,
    fiftyFiftyTitle:
      typeof formData.get("fiftyFiftyTitle") === "string" &&
      formData.get("fiftyFiftyTitle") !== ""
        ? String(formData.get("fiftyFiftyTitle"))
        : null,
    fiftyFiftyDescription:
      typeof formData.get("fiftyFiftyDescription") === "string" &&
      formData.get("fiftyFiftyDescription") !== ""
        ? String(formData.get("fiftyFiftyDescription"))
        : null,
    fiftyFiftyPoints:
      typeof formData.get("fiftyFiftyPoints") === "string" &&
      formData.get("fiftyFiftyPoints") !== ""
        ? Number(formData.get("fiftyFiftyPoints"))
        : null,
    fiftyFiftyDeadline:
      typeof formData.get("fiftyFiftyDeadline") === "string" &&
      formData.get("fiftyFiftyDeadline") !== ""
        ? String(formData.get("fiftyFiftyDeadline"))
        : null,
  };
  const parsed = createChallengeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const selectedItemType = parsed.data.selectedItemType ?? null;
  const selectedItemInventoryId = parsed.data.selectedItemInventoryId ?? null;
  const useQuitOrDouble = selectedItemType === "quitte_ou_double";

  if (useQuitOrDouble) {
    if (parsed.data.targetIds.length !== 1 || parsed.data.targetIds[0] !== user.id) {
      return { error: "Quitte ou Double nécessite un auto-défi (toi comme cible unique)" };
    }
  } else if (parsed.data.targetIds.some((targetId) => targetId === user.id)) {
    return { error: "Tu ne peux pas te défier toi-même sans Quitte ou Double" };
  }

  if (selectedItemType && !selectedItemInventoryId) {
    return { error: "Item sélectionné invalide" };
  }

  let resolvedItemType: string | null = null;
  if (selectedItemInventoryId) {
    const { data: selectedInventory } = await supabase
      .from("inventory")
      .select("id, purchased_group_id, shop_items(item_type, group_id), global_shop_items(item_type)")
      .eq("id", selectedItemInventoryId)
      .eq("profile_id", user.id)
      .is("used_at", null)
      .maybeSingle();

    const localShopItem = selectedInventory?.shop_items as {
      item_type: string;
      group_id: string;
    } | null;
    const globalShopItem = selectedInventory?.global_shop_items as { item_type: string } | null;
    const localType = localShopItem?.item_type ?? null;
    const globalType = globalShopItem?.item_type ?? null;
    resolvedItemType = localType ?? globalType;

    const isValidForGroup =
      (localType && localShopItem?.group_id === parsed.data.groupId) ||
      (globalType && selectedInventory?.purchased_group_id === parsed.data.groupId);
    if (!selectedInventory || !resolvedItemType || !isValidForGroup) {
      return { error: "Item de création introuvable ou invalide pour ce groupe" };
    }
    if (selectedItemType && resolvedItemType !== selectedItemType) {
      return { error: "L'item sélectionné ne correspond pas à l'inventaire choisi" };
    }
  }

  const effectiveItemType = selectedItemType ?? resolvedItemType;
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  let createdChallenges: { challenge_id: string; target_id: string }[] = [];
  if (effectiveItemType === "roulette_russe") {
    if (!selectedItemInventoryId) {
      return { error: "Item Roulette Russe introuvable" };
    }
    const { data: roulettePayload, error: rouletteError } = await supabase.rpc(
      "use_inventory_item_effect",
      {
        p_inventory_id: selectedItemInventoryId,
        p_payload: {
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          points: parsed.data.points,
          deadline: parsed.data.deadline,
        },
      },
    );
    if (rouletteError) {
      if (rouletteError.message.includes("Roulette challenge title required")) {
        return { error: "Titre requis pour Roulette Russe" };
      }
      if (rouletteError.message.includes("No eligible target for roulette")) {
        return { error: "Aucune cible éligible pour Roulette Russe" };
      }
      return { error: rouletteError.message };
    }
    const altChallengeId = (roulettePayload as { alt_challenge_id?: string } | null)
      ?.alt_challenge_id;
    if (!altChallengeId) {
      return { error: "Impossible de créer le défi Roulette Russe" };
    }
    const { data: rouletteChallenge } = await supabase
      .from("challenges")
      .select("id, target_id")
      .eq("id", altChallengeId)
      .maybeSingle();
    if (!rouletteChallenge) {
      return { error: "Défi Roulette Russe créé mais introuvable" };
    }
    createdChallenges = [
      { challenge_id: rouletteChallenge.id, target_id: rouletteChallenge.target_id },
    ];
  } else if (useQuitOrDouble) {
    const [{ data: membership }, { data: handcuffs }] = await Promise.all([
      supabase
        .from("members")
        .select("profile_id")
        .eq("group_id", parsed.data.groupId)
        .eq("profile_id", user.id)
        .maybeSingle(),
      supabase
        .from("profile_effects")
        .select("id")
        .eq("group_id", parsed.data.groupId)
        .eq("target_profile_id", user.id)
        .eq("effect_type", "handcuffs")
        .gt("active_until", new Date().toISOString())
        .limit(1),
    ]);

    if (!membership) {
      return { error: "Tu ne fais pas partie de ce groupe" };
    }
    if ((handcuffs ?? []).length > 0) {
      return { error: "Tu es sous l'effet des menottes et ne peux pas lancer de défi" };
    }

    const { data: createdSelfChallenge, error: createSelfError } = await supabase
      .from("challenges")
      .insert({
        group_id: parsed.data.groupId,
        creator_id: user.id,
        target_id: user.id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        points: parsed.data.points,
        deadline: parsed.data.deadline ?? null,
      })
      .select("id, target_id")
      .single();

    if (createSelfError || !createdSelfChallenge) {
      return { error: createSelfError?.message ?? "Impossible de créer le défi auto-ciblé" };
    }

    createdChallenges = [{
      challenge_id: createdSelfChallenge.id,
      target_id: createdSelfChallenge.target_id,
    }];
  } else {
    const { data, error } = await supabase.rpc("create_challenges_bulk", {
      p_group_id: parsed.data.groupId,
      p_target_ids: parsed.data.targetIds,
      p_title: parsed.data.title,
      p_description: parsed.data.description ?? null,
      p_points: parsed.data.points,
      p_deadline: parsed.data.deadline ?? null,
    });
    if (error) {
      if (error.message.includes("Non-member target")) {
        return { error: "Une ou plusieurs cibles ne sont pas membres du groupe" };
      }
      if (error.message.includes("Cannot target yourself")) {
        return { error: "Tu ne peux pas te défier toi-même sans Quitte ou Double" };
      }
      if (error.message.includes("Not a group member")) {
        return { error: "Tu ne fais pas partie de ce groupe" };
      }
      if (error.message.includes("Creator is handcuffed")) {
        return { error: "Tu es sous l'effet des menottes et ne peux pas lancer de défi" };
      }
      if (error.message.includes("Target in ghost mode")) {
        return { error: "Une cible est en mode fantôme et ne peut pas être défiée" };
      }
      return { error: error.message };
    }
    createdChallenges = (data ?? []) as { challenge_id: string; target_id: string }[];
  }

  if (effectiveItemType === "quitte_ou_double") {
    const createdChallengeId = createdChallenges[0]?.challenge_id;

    if (!createdChallengeId) {
      return { error: "Impossible d'activer Quitte ou Double sur ce défi" };
    }
    if (!selectedItemInventoryId) {
      return { error: "Aucun item Quitte ou Double disponible pour ce groupe" };
    }
    const { error: effectError } = await supabase.rpc("use_inventory_item_effect", {
      p_inventory_id: selectedItemInventoryId,
      p_challenge_id: createdChallengeId,
      p_payload: {},
    });
    if (effectError) {
      return { error: `Défi créé, mais activation de Quitte ou Double impossible: ${effectError.message}` };
    }
  }

  if (effectiveItemType === "sniper" || effectiveItemType === "cinquante_cinquante") {
    const createdChallengeId = createdChallenges[0]?.challenge_id;
    if (!createdChallengeId) {
      return { error: "Impossible d'appliquer l'item sélectionné sur ce défi" };
    }
    if (!selectedItemInventoryId) {
      return { error: "Item sélectionné introuvable" };
    }
    const payload =
      effectiveItemType === "cinquante_cinquante"
        ? {
            title: parsed.data.fiftyFiftyTitle ?? `${parsed.data.title} (Option 2)`,
            description: parsed.data.fiftyFiftyDescription ?? parsed.data.description,
            points: parsed.data.fiftyFiftyPoints ?? parsed.data.points,
            deadline: parsed.data.fiftyFiftyDeadline ?? parsed.data.deadline,
          }
        : {};
    const { error: itemEffectError } = await supabase.rpc("use_inventory_item_effect", {
      p_inventory_id: selectedItemInventoryId,
      p_challenge_id: createdChallengeId,
      p_payload: payload,
    });
    if (itemEffectError) {
      if (itemEffectError.message.includes("Invalid challenge for 50/50")) {
        return { error: "Défi créé, mais activation du 50/50 impossible dans ce contexte" };
      }
      if (itemEffectError.message.includes("50/50 already active")) {
        return { error: "Défi créé, mais 50/50 est déjà actif sur ce défi" };
      }
      if (itemEffectError.message.includes("Invalid challenge for sniper")) {
        return { error: "Défi créé, mais activation du Sniper impossible dans ce contexte" };
      }
      return { error: `Défi créé, mais activation de l'item échouée: ${itemEffectError.message}` };
    }
  }

  await awardBadges(user.id);

  const { sendPushToUser } = await import("@/app/(app)/notifications/push-actions");
  const pushBody = `${profile?.username ?? "Quelqu'un"} t'a lancé le défi "${parsed.data.title}"`;
  await Promise.allSettled(
    createdChallenges.map((item) =>
      sendPushToUser(item.target_id, "Nouveau défi !", pushBody),
    ),
  );

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
  if (challenge.double_or_nothing_requested && !challenge.double_or_nothing_approved) {
    return {
      error: "Quitte ou Double en attente: il faut 2 validations de membres avant l'acceptation",
    };
  }

  if (boosterInventoryId) {
    const { data: booster } = await supabase
      .from("inventory")
      .select("id, purchased_group_id, shop_items(item_type, group_id), global_shop_items(item_type)")
      .eq("id", boosterInventoryId)
      .eq("profile_id", user.id)
      .is("used_at", null)
      .single();

    const localShopItem = booster?.shop_items as {
      item_type: string;
      group_id: string;
    } | null;
    const globalShopItem = booster?.global_shop_items as { item_type: string } | null;
    const isLocalBooster =
      localShopItem?.item_type === "booster" &&
      localShopItem.group_id === challenge.group_id;
    const isGlobalBooster =
      globalShopItem?.item_type === "booster" &&
      booster?.purchased_group_id === challenge.group_id;

    if (!booster || (!isLocalBooster && !isGlobalBooster)) {
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

  if (challenge.bundle_choice_required && challenge.challenge_bundle_id) {
    await supabase
      .from("challenges")
      .update({ status: "cancelled" as ChallengeStatus })
      .eq("challenge_bundle_id", challenge.challenge_bundle_id)
      .neq("id", challengeId)
      .eq("status", "proposed");
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
    .select("group_id, creator_id, target_id, title, no_negotiation")
    .eq("id", challengeId)
    .single();
  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.no_negotiation) {
    return { error: "Ce défi est en mode Sniper et ne peut pas être contesté" };
  }

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
    .select("group_id, creator_id, title, points, challenge_bundle_id, bundle_choice_required")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };

  if (challenge.bundle_choice_required && challenge.challenge_bundle_id) {
    const { count } = await supabase
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("challenge_bundle_id", challenge.challenge_bundle_id)
      .eq("status", "proposed");
    if ((count ?? 0) > 1) {
      return {
        error:
          "Défi 50/50 actif: tu dois accepter l'une des options, pas refuser globalement",
      };
    }
  }

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

  const [{ count: weeklyDeclines }, { data: localJokers }, { data: globalJokers }] = await Promise.all([
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
    supabase
      .from("inventory")
      .select("id, global_shop_items!inner(item_type), purchased_group_id")
      .eq("profile_id", user.id)
      .is("used_at", null)
      .eq("purchased_group_id", challenge.group_id)
      .eq("global_shop_items.item_type", "joker"),
  ]);

  const declines = weeklyDeclines ?? 0;
  const availableJokers = [...(localJokers ?? []), ...(globalJokers ?? [])];
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
  if ((challenge.proof_rejections_count ?? 0) >= 2) {
    return { error: "Ce défi est perdu, tu ne peux plus soumettre de preuve." };
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

export async function validateOwnProofWith493(challengeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("id, group_id, creator_id, title, points, booster_inventory_id, target_id")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.target_id !== user.id) return { error: "Action non autorisée" };

  const { data, error } = await supabase.rpc("use_item_49_3_on_challenge", {
    p_challenge_id: challengeId,
  });

  if (error) {
    if (error.message.includes("Item 49.3 not available")) {
      return { error: "Tu n'as pas de 49.3 disponible" };
    }
    if (error.message.includes("Invalid status")) {
      return { error: "Le défi doit être en attente de validation de preuve" };
    }
    if (error.message.includes("Not the target")) {
      return { error: "Action non autorisée" };
    }
    return { error: error.message };
  }

  const payload = (data ?? {}) as { reward?: number };
  const reward =
    payload.reward ??
    (challenge.booster_inventory_id ? challenge.points * 2 : challenge.points);

  await notify(
    challenge.creator_id,
    "challenge_validated",
    "Preuve validée via 49.3",
    `La cible a validé automatiquement sa preuve pour "${challenge.title}" avec un 49.3.`,
    { challenge_id: challengeId, group_id: challenge.group_id },
  );

  await awardBadges(challenge.target_id);

  revalidatePath(`/g/${challenge.group_id}`);
  revalidatePath(`/g/${challenge.group_id}/challenges/${challengeId}`);
  revalidatePath("/profile");
  return { success: true, reward };
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
    .select("target_id, creator_id, title, points, group_id, booster_inventory_id")
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
    penalty?: number;
    retries_left?: number;
    proof_rejections_count?: number;
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
    } else if (voteResult.status === "retry_allowed") {
      await notify(
        challenge.target_id,
        "challenge_rejected",
        "Preuve refusée",
        `Ta preuve pour le défi "${challenge.title}" a été refusée. Dernière tentative disponible.`,
        { challenge_id: challengeId, group_id: challenge.group_id },
      );
    } else if (voteResult.status === "rejected") {
      await notify(
        challenge.target_id,
        "challenge_lost",
        "Pari perdu",
        `Ton défi "${challenge.title}" est perdu. -${voteResult.penalty ?? Math.max(1, Math.floor(challenge.points / 2))} points.`,
        { challenge_id: challengeId, group_id: challenge.group_id },
      );
      await notify(
        challenge.creator_id,
        "challenge_lost",
        "Défi perdu par la cible",
        `Le défi "${challenge.title}" est perdu par la cible.`,
        { challenge_id: challengeId, group_id: challenge.group_id },
      );
    }

    revalidatePath(`/g/${challenge.group_id}`);
  }

  revalidatePath("/profile");
  return { success: true, ...voteResult };
}

export async function abandonChallengeAfterFailedProof(challengeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id, creator_id, target_id, title, points")
    .eq("id", challengeId)
    .single();

  if (!challenge) return { error: "Défi introuvable" };
  if (challenge.target_id !== user.id) return { error: "Action non autorisée" };

  const { data, error } = await supabase.rpc("abandon_challenge_after_failed_proof", {
    p_challenge_id: challengeId,
  });

  if (error) {
    if (error.message.includes("Not the target")) return { error: "Action non autorisée" };
    if (error.message.includes("Invalid status")) {
      return { error: "Le défi doit être en attente d'une nouvelle preuve" };
    }
    if (error.message.includes("No failed proof yet")) {
      return { error: "Tu dois d'abord avoir un refus de preuve avant d'abandonner" };
    }
    return { error: error.message };
  }

  const payload = (data ?? {}) as { penalty?: number; status?: string };
  const penalty = payload.penalty ?? Math.max(1, Math.floor(challenge.points / 2));

  await notify(
    challenge.creator_id,
    "challenge_lost",
    "Défi perdu par la cible",
    `La cible a abandonné après refus de preuve sur "${challenge.title}".`,
    { challenge_id: challengeId, group_id: challenge.group_id },
  );

  await notify(
    challenge.target_id,
    "challenge_lost",
    "Pari perdu",
    `Tu as abandonné le défi "${challenge.title}". -${penalty} points.`,
    { challenge_id: challengeId, group_id: challenge.group_id },
  );

  revalidatePath(`/g/${challenge.group_id}`);
  revalidatePath(`/g/${challenge.group_id}/challenges/${challengeId}`);
  revalidatePath("/profile");
  return { success: true, penalty, status: payload.status ?? "rejected" };
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

export async function applyInventoryItemEffect(args: {
  inventoryId: string;
  challengeId?: string;
  targetProfileId?: string;
  payload?: Record<string, unknown>;
}) {
  const parsed = applyInventoryItemEffectSchema.safeParse(args);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_inventory_item_effect", {
    p_inventory_id: parsed.data.inventoryId,
    p_challenge_id: parsed.data.challengeId,
    p_target_profile_id: parsed.data.targetProfileId,
    p_payload: parsed.data.payload ?? {},
  });

  if (error) {
    if (error.message.includes("Invalid challenge")) {
      return { error: "Cet item n'est pas applicable dans ce contexte de défi" };
    }
    if (error.message.includes("already active")) {
      return { error: "Cet effet est déjà actif" };
    }
    if (error.message.includes("No transfer target found")) {
      return { error: "Aucune cible valide disponible pour transférer le défi" };
    }
    if (error.message.includes("No active challenge to cancel")) {
      return { error: "Aucun défi actif à annuler actuellement" };
    }
    if (error.message.includes("Roulette challenge title required")) {
      return { error: "Titre requis pour Roulette Russe" };
    }
    return { error: error.message };
  }

  const payload = (data ?? {}) as { challenge_id?: string; alt_challenge_id?: string; item_type?: string };
  if (parsed.data.challengeId) {
    revalidatePath(`/g/*/challenges/${parsed.data.challengeId}`);
  }
  revalidatePath("/profile");
  return {
    success: true,
    itemType: (payload.item_type ?? "custom") as StoreItemType,
    altChallengeId: payload.alt_challenge_id,
  };
}

export async function voteQuitteOuDouble(challengeId: string, approve = true) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vote_quitte_ou_double", {
    p_challenge_id: challengeId,
    p_approve: approve,
  });
  if (error) {
    if (error.message.includes("Not allowed to vote")) {
      return { error: "Seuls les autres membres peuvent valider Quitte ou Double" };
    }
    if (error.message.includes("not requested")) {
      return { error: "Quitte ou Double n'est pas activé sur ce défi" };
    }
    return { error: error.message };
  }
  const payload = (data ?? {}) as { approved?: boolean; approvals?: number; threshold?: number };
  revalidatePath("/g");
  return {
    success: true,
    approved: !!payload.approved,
    approvals: payload.approvals ?? 0,
    threshold: payload.threshold ?? 2,
  };
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
