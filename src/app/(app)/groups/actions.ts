"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function awardBadges(profileId: string) {
  const supabase = await createClient();
  await supabase.rpc("check_and_award_badges", { p_profile_id: profileId });
}

export async function createGroup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" };
  }

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;

  const { data: newGroup, error } = await supabase
    .from("groups")
    .insert({
      name,
      description,
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
  const supabase = await createClient();

  const code = (formData.get("code") as string).trim();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("join_group_by_invite_code", {
    code,
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" };
  }

  const groupId = formData.get("groupId") as string;

  const { error } = await supabase
    .from("members")
    .delete()
    .eq("group_id", groupId)
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
