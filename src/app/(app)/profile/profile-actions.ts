"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema, parseFormData } from "@/lib/validations";

export async function updateProfile(formData: FormData) {
  const parsed = parseFormData(updateProfileSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const updateData: { username: string; avatar_url?: string | null } = {
    username: parsed.data.username,
  };

  if (parsed.data.avatarUrl !== null) {
    updateData.avatar_url = parsed.data.avatarUrl;
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
