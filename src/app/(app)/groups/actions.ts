"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createGroupSchema,
  joinGroupSchema,
  leaveGroupSchema,
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

  const { data: newGroup, error } = await supabase
    .from("groups")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  redirect(`/g/${newGroup.id}`);
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
