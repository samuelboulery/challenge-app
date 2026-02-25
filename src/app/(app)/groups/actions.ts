"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createGroupSchema,
  joinGroupSchema,
  leaveGroupSchema,
  updateGroupSchema,
  deleteGroupSchema,
  transferGroupOwnershipSchema,
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

  const { error } = await supabase.rpc("delete_group_admin", {
    p_group_id: parsed.data.groupId,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  redirect("/");
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
