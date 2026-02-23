import { createClient } from "@/lib/supabase/server";

export async function notify(
  profileId: string,
  type: string,
  title: string,
  body: string,
  metadata: Record<string, unknown> = {},
) {
  const supabase = await createClient();
  await supabase.rpc("create_notification", {
    p_profile_id: profileId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_metadata: metadata,
  });

  try {
    const { sendPushToUser } = await import(
      "@/app/(app)/notifications/push-actions"
    );
    await sendPushToUser(profileId, title, body);
  } catch {
    // Push not available or failed silently
  }
}
