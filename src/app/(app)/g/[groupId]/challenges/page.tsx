import { Swords } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChallengeCard } from "@/components/shared/challenge-card";
import { CreateChallengeDialog } from "@/components/shared/create-challenge-dialog";
import { getMyGroupChallenges } from "@/app/(app)/challenges/actions";
import { createClient } from "@/lib/supabase/server";

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-muted p-4">
        <Swords className="size-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">Aucun défi</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Lance un défi avec le bouton ci-dessus !
        </p>
      </div>
    </div>
  );
}

export default async function GroupChallengesPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ received, sent }, { data: members }] = await Promise.all([
    getMyGroupChallenges(groupId),
    supabase
      .from("members")
      .select("profile_id, profiles(username)")
      .eq("group_id", groupId),
  ]);

  const otherMembers = (members ?? [])
    .filter((m) => m.profile_id !== user?.id)
    .map((m) => ({
      profile_id: m.profile_id,
      username:
        (m.profiles as { username: string } | null)?.username ?? "Utilisateur",
    }));

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Défis du groupe</h1>
        {otherMembers.length > 0 && (
          <CreateChallengeDialog groupId={groupId} members={otherMembers} />
        )}
      </div>

      <Tabs defaultValue="received" className="mt-6">
        <TabsList className="w-full">
          <TabsTrigger value="received" className="flex-1">
            Reçus ({received.length})
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1">
            Lancés ({sent.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-4 space-y-3">
          {received.length === 0 ? (
            <EmptyState />
          ) : (
            received.map((c) => (
              <ChallengeCard
                key={c.id}
                id={c.id}
                title={c.title}
                points={c.points}
                status={c.status}
                creatorName={(c.creator as { username: string })?.username ?? "?"}
                targetName={(c.target as { username: string })?.username ?? "?"}
                groupId={groupId}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-4 space-y-3">
          {sent.length === 0 ? (
            <EmptyState />
          ) : (
            sent.map((c) => (
              <ChallengeCard
                key={c.id}
                id={c.id}
                title={c.title}
                points={c.points}
                status={c.status}
                creatorName={(c.creator as { username: string })?.username ?? "?"}
                targetName={(c.target as { username: string })?.username ?? "?"}
                groupId={groupId}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
