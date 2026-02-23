import { createClient } from "@/lib/supabase/server";

export async function awardBadges(profileId: string) {
  const supabase = await createClient();
  await supabase.rpc("check_and_award_badges", { p_profile_id: profileId });
}
