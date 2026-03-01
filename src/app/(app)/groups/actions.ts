"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  createGroupSchema,
  joinGroupSchema,
  leaveGroupSchema,
  updateGroupSchema,
  deleteGroupSchema,
  resetGroupSchema,
  transferGroupOwnershipSchema,
  updateMemberGroupPointsSchema,
  parseFormData,
} from "@/lib/validations";
import { awardBadges } from "@/lib/badges";

export async function createGroup(formData: FormData) {
  const parsed = parseFormData(createGroupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" };
  }

  const { data: groupId, error } = await supabase.rpc("create_group", {
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  if (!groupId) {
    return { error: "Impossible de créer le groupe" };
  }

  revalidatePath("/");
  redirect(`/g/${groupId}`);
}

export async function joinGroupByCode(formData: FormData) {
  const parsed = parseFormData(joinGroupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("join_group_by_invite_code", {
    code: parsed.data.code.trim(),
  });

  if (error) {
    if (error.message.includes("Invalid invite code")) {
      return { error: "Code d'invitation invalide" };
    }
    return { error: error.message };
  }

  if (user) {
    await awardBadges(user.id);
  }

  revalidatePath("/");
  redirect(`/g/${data}/manage`);
}

export async function leaveGroup(formData: FormData) {
  const parsed = parseFormData(leaveGroupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" };
  }

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", user.id)
    .single();

  if (member?.role === "owner") {
    return { error: "Le propriétaire ne peut pas quitter le groupe. Transfère la propriété d'abord." };
  }

  const { error } = await supabase
    .from("members")
    .delete()
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  redirect("/");
}

export async function updateGroup(formData: FormData) {
  const parsed = parseFormData(updateGroupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: membership } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", user.id)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { error: "Action non autorisée" };
  }

  const { error } = await supabase
    .from("groups")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
    })
    .eq("id", parsed.data.groupId);

  if (error) return { error: error.message };

  revalidatePath(`/g/${parsed.data.groupId}`);
  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  return { success: true };
}

export async function transferGroupOwnership(formData: FormData) {
  const parsed = parseFormData(transferGroupOwnershipSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: membership } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", user.id)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { error: "Action non autorisée" };
  }

  if (parsed.data.newOwnerId === user.id) {
    return { error: "Tu es déjà propriétaire" };
  }

  const { error } = await supabase.rpc("transfer_group_ownership", {
    p_group_id: parsed.data.groupId,
    p_new_owner_id: parsed.data.newOwnerId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/g/${parsed.data.groupId}`);
  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  return { success: true };
}

export async function deleteGroup(formData: FormData) {
  const parsed = parseFormData(deleteGroupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: membership } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", user.id)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return { error: "Action non autorisée" };
  }

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", parsed.data.groupId)
    .single();

  if (!group) {
    return { error: "Groupe introuvable" };
  }

  if (parsed.data.groupNameConfirmation.trim() !== group.name) {
    return { error: "Le nom du groupe ne correspond pas" };
  }

  const { error } = await supabase.rpc("delete_group_admin", {
    p_group_id: parsed.data.groupId,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  redirect("/");
}

export async function resetGroup(formData: FormData) {
  const parsed = parseFormData(resetGroupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { data: membership } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", parsed.data.groupId)
    .eq("profile_id", user.id)
    .single();

  if (!membership || membership.role !== "owner") {
    return { error: "Action non autorisée" };
  }

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", parsed.data.groupId)
    .single();

  if (!group) {
    return { error: "Groupe introuvable" };
  }

  if (parsed.data.groupNameConfirmation.trim() !== group.name) {
    return { error: "Le nom du groupe ne correspond pas" };
  }

  const { data: proofPaths, error } = await supabase.rpc("reset_group_data_admin", {
    p_group_id: parsed.data.groupId,
  });

  if (error) return { error: error.message };

  if (proofPaths && proofPaths.length > 0) {
    const adminSupabase = createServiceRoleClient();
    if (!adminSupabase) {
      return {
        error:
          "Configuration serveur manquante: ajoute SUPABASE_SERVICE_ROLE_KEY dans les variables d'environnement.",
      };
    }
    const { error: storageError } = await adminSupabase.storage
      .from("proofs")
      .remove(proofPaths);

    if (storageError) {
      return {
        error:
          "Le groupe a été remis à 0, mais certaines photos n'ont pas pu être supprimées du bucket.",
      };
    }
  }

  revalidatePath(`/g/${parsed.data.groupId}`);
  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  revalidatePath(`/g/${parsed.data.groupId}/challenges`);
  return { success: true };
}

export async function updateMemberGroupPoints(formData: FormData) {
  const parsed = parseFormData(updateMemberGroupPointsSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  }).rpc("adjust_member_group_points", {
    p_group_id: parsed.data.groupId,
    p_member_id: parsed.data.memberId,
    p_new_points: parsed.data.newPoints,
  });

  if (error) {
    if (error.message.includes("Not allowed")) return { error: "Action non autorisée" };
    if (error.message.includes("Target user is not a member")) {
      return { error: "Ce membre n'est plus dans le groupe" };
    }
    if (error.message.includes("Resulting total_points would be negative")) {
      return { error: "Impossible: le total global de points deviendrait négatif" };
    }
    return { error: error.message };
  }

  revalidatePath(`/g/${parsed.data.groupId}`);
  revalidatePath(`/g/${parsed.data.groupId}/manage`);
  return { success: true };
}

export async function getMyGroups() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("groups")
    .select("*, members(count)")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return data;
}
