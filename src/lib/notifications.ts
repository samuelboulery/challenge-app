import { createClient } from "@/lib/supabase/server";

export async function notify(
  profileId: string,
  type: string,
  title: string,
  body: string,
  metadata: Record<string, unknown> = {},
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_notification", {
    p_profile_id: profileId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_metadata: metadata,
  });
  if (error) {
    const message = `Erreur création notification (${type}) pour ${profileId}: ${error.message}`;
    console.error(message);
    return { error: message };
  }

  try {
    const { sendPushToUser } = await import(
      "@/app/(app)/notifications/push-actions"
    );
    await sendPushToUser(profileId, title, body);
  } catch (pushError) {
    console.error("Push notification non envoyée", pushError);
  }

  return { success: true as const };
}
