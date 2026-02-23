"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:contact@challenge-app.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

export async function saveSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "profile_id,endpoint" },
  );

  if (error) return { error: error.message };

  revalidatePath("/notifications");
  return { success: true };
}

export async function removeSubscription() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/notifications");
  return { success: true };
}

export async function sendPushToUser(
  profileId: string,
  title: string,
  body: string,
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const supabase = await createClient();
  const { data: subscriptions } = await supabase.rpc(
    "get_push_subscriptions",
    { p_profile_id: profileId },
  );

  if (!subscriptions || subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url: "/notifications" });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      ),
    ),
  );

  const failedEndpoints = results
    .map((r, i) => {
      const sub = subscriptions[i];
      return r.status === "rejected" && sub ? sub.endpoint : null;
    })
    .filter(Boolean);

  if (failedEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", profileId)
      .in("endpoint", failedEndpoints as string[]);
  }
}
