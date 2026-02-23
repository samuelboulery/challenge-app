"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const username = (formData.get("username") as string)?.trim();
  const avatarUrl = (formData.get("avatarUrl") as string) || null;

  if (!username || username.length < 3) {
    return { error: "Le nom d'utilisateur doit faire au moins 3 caractères" };
  }

  const updateData: { username: string; avatar_url?: string | null } = {
    username,
  };

  if (avatarUrl !== null) {
    updateData.avatar_url = avatarUrl;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id);

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return { error: "Ce nom d'utilisateur est déjà pris" };
    }
    return { error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { success: true };
}
