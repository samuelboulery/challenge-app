import { Swords } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChallengeCard } from "@/components/shared/challenge-card";
import { CreateChallengeDialog } from "@/components/shared/create-challenge-dialog";
import { getMyGroupChallenges } from "@/app/(app)/challenges/actions";
import { getUserItemsByType } from "@/app/(app)/groups/[id]/shop-actions";
import { createClient } from "@/lib/supabase/server";

type CreationItemType =
  | "quitte_ou_double"
  | "cinquante_cinquante"
  | "sniper"
  | "roulette_russe";

type CreationItemOption = {
  inventoryId: string;
  itemType: CreationItemType;
  name: string;
  purchasedAt: string;
};

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

  const [{ received, sent }, { data: members }, qodItems, fiftyItems, sniperItems, rouletteItems] =
    await Promise.all([
    getMyGroupChallenges(groupId),
    supabase
      .from("members")
      .select("profile_id, profiles(username)")
      .eq("group_id", groupId),
    getUserItemsByType(groupId, "quitte_ou_double"),
    getUserItemsByType(groupId, "cinquante_cinquante"),
    getUserItemsByType(groupId, "sniper"),
    getUserItemsByType(groupId, "roulette_russe"),
  ]);

  const otherMembers = (members ?? [])
    .filter((m) => m.profile_id !== user?.id)
    .map((m) => ({
      profile_id: m.profile_id,
      username:
        (m.profiles as { username: string } | null)?.username ?? "Utilisateur",
    }));

  const buildCreationItems = (
    rows: Awaited<ReturnType<typeof getUserItemsByType>>,
    itemType: CreationItemType,
  ): CreationItemOption[] =>
    rows.map((row) => ({
      inventoryId: row.id,
      itemType,
      name: (row.shop_items as { name?: string } | null)?.name ?? itemType,
      purchasedAt: row.purchased_at,
    }));

  const availableCreationItems = [
    ...buildCreationItems(qodItems, "quitte_ou_double"),
    ...buildCreationItems(fiftyItems, "cinquante_cinquante"),
    ...buildCreationItems(sniperItems, "sniper"),
    ...buildCreationItems(rouletteItems, "roulette_russe"),
  ].sort(
    (a, b) =>
      new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime(),
  );

  const currentUserId = user?.id ?? null;
  const canOpenCreateDialog =
    !!currentUserId &&
    (otherMembers.length > 0 ||
      availableCreationItems.some(
        (item) => item.itemType === "quitte_ou_double" || item.itemType === "roulette_russe",
      ));

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Défis du groupe</h1>
        {canOpenCreateDialog && (
          <CreateChallengeDialog
            groupId={groupId}
            members={otherMembers}
            currentUserId={currentUserId}
            availableCreationItems={availableCreationItems}
          />
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

        <TabsContent value="received" className="mt-4 space-y-2">
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

        <TabsContent value="sent" className="mt-4 space-y-2">
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
