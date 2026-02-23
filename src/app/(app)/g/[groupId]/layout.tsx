import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupProvider } from "@/components/shared/group-context";

export default async function GroupLayout({
  params,
  children,
}: {
  params: Promise<{ groupId: string }>;
  children: React.ReactNode;
}) {
  const { groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  const { data: membership } = await supabase
    .from("members")
    .select("profile_id")
    .eq("group_id", groupId)
    .eq("profile_id", user.id)
    .single();

  if (!membership) notFound();

  return (
    <GroupProvider groupId={group.id} groupName={group.name}>
      {children}
    </GroupProvider>
  );
}
