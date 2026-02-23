import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChallengeRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: challenge } = await supabase
    .from("challenges")
    .select("group_id")
    .eq("id", id)
    .single();

  if (!challenge) notFound();

  redirect(`/g/${challenge.group_id}/challenges/${id}`);
}
