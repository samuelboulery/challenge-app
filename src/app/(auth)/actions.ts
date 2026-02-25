"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema, parseFormData } from "@/lib/validations";

function getAuthRedirectUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.URL;

  if (!configuredUrl) return undefined;

  const baseUrl = configuredUrl.replace(/\/+$/, "");
  return `${baseUrl}/callback`;
}

export async function login(formData: FormData) {
  const parsed = parseFormData(loginSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signup(formData: FormData) {
  const parsed = parseFormData(signupSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const supabase = await createClient();
  const emailRedirectTo = getAuthRedirectUrl();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { username: parsed.data.username },
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
