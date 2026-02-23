import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateGroupDialog } from "@/components/shared/create-group-dialog";
import { JoinGroupDialog } from "@/components/shared/join-group-dialog";
import { Users } from "lucide-react";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("members")
    .select("group_id")
    .eq("profile_id", user.id)
    .limit(1);

  const firstGroupId = memberships?.[0]?.group_id;

  if (firstGroupId) {
    const cookieStore = await cookies();
    const lastGroupId = cookieStore.get("lastGroupId")?.value;

    if (lastGroupId) {
      const { data: stillMember } = await supabase
        .from("members")
        .select("group_id")
        .eq("group_id", lastGroupId)
        .eq("profile_id", user.id)
        .single();

      if (stillMember) {
        redirect(`/g/${lastGroupId}`);
      }
    }

    redirect(`/g/${firstGroupId}`);
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-muted p-6">
          <Users className="size-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Bienvenue !</h1>
        <p className="max-w-sm text-muted-foreground">
          Pour commencer, crée un groupe ou rejoins-en un avec un code
          d&apos;invitation.
        </p>
        <div className="flex gap-3 mt-4">
          <CreateGroupDialog />
          <JoinGroupDialog />
        </div>
      </div>
    </main>
  );
}
