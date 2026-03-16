import { getGroupHomeData } from "./home-actions";
import { getEffectiveShopPrices } from "@/app/(app)/groups/[id]/shop-actions";
import { getGroupJokerIntel } from "@/app/(app)/groups/[id]/shop-actions";
import { ChallengeCard } from "@/components/shared/challenge-card";
import { Leaderboard } from "@/components/shared/leaderboard";
import { ShopItemCard } from "@/components/shared/shop-item-card";
import { AddShopItemDialog } from "@/components/shared/add-shop-item-dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Coins,
  Bell,
  Activity,
  Trophy,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { groupShopItemsByCategory } from "@/lib/shop-grouping";

export default async function GroupHomePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const [groupHomeData, effectiveShopPrices, jokerIntel] = await Promise.all([
    getGroupHomeData(groupId),
    getEffectiveShopPrices(groupId),
    getGroupJokerIntel(groupId),
  ]);
  const {
    profile,
    currentGroupPoints,
    pendingActions,
    recentActivity,
    leaderboard,
    seasonKey,
    crownHolderProfileId,
    shopItems,
    groupMembers,
    isAdmin,
    userId,
  } = groupHomeData;

  const groupedShopItems = groupShopItemsByCategory(shopItems);

  return (
    <main className="px-4 pt-5 sm:pt-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">
            Salut, {profile?.username ?? "!"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quoi de neuf aujourd&apos;hui ?
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-muted px-3 py-2 sm:px-4">
          <div className="flex items-center gap-1.5">
            <Coins className="size-4 text-yellow-500 sm:size-5" />
            <span className="text-lg font-bold sm:text-2xl">
              {currentGroupPoints}
            </span>
          </div>
          <span className="text-xs text-muted-foreground sm:text-sm"></span>
        </div>
      </div>

      {pendingActions.length === 0 && (
        <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Rien en attente pour le moment.
        </div>
      )}

      {/* En attente */}
      {pendingActions.length > 0 && (
        <>
          <Separator className="my-4 sm:my-6" />
          <section>
            <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
              <div className="flex items-center gap-2">
                <Bell className="size-5" />
                <h2 className="text-base font-semibold sm:text-lg">
                  En attente
                </h2>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {pendingActions.length}
              </span>
            </div>
            <div className="space-y-1 sm:space-y-1.5">
              {pendingActions.map(({ kind, challenge }) => {
                const pendingLabel =
                  kind === "price_validation"
                    ? "Vote de contestation requis"
                    : kind === "proof_validation"
                      ? "Validation preuve requise"
                      : "Défi reçu";

                return (
                  <div key={challenge.id} className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide sm:text-xs">
                      {pendingLabel}
                    </p>
                    <ChallengeCard
                      id={challenge.id}
                      title={challenge.title}
                      points={challenge.points}
                      status={challenge.status}
                      creatorName={
                        (challenge.creator as { username: string })?.username ?? "?"
                      }
                      targetName={
                        (challenge.target as { username: string })?.username ?? "?"
                      }
                      groupId={groupId}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Classement */}
      <Separator className="my-4 sm:my-6" />
      <section>
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          <Trophy className="size-5" />
          <h2 className="text-base font-semibold sm:text-lg">
            Classement de saison
            {seasonKey ? ` (${seasonKey})` : ""}
          </h2>
        </div>
        <Leaderboard
          entries={leaderboard}
          currentUserId={userId ?? undefined}
          crownHolderProfileId={crownHolderProfileId}
        />
      </section>

      {/* Onglets Activite / Boutique */}
      <Separator className="my-4 sm:my-6" />
      <Tabs defaultValue="activity">
        <TabsList className="w-full">
          <TabsTrigger value="activity" className="flex-1 gap-1.5">
            <Activity className="size-4" />
            Activité
          </TabsTrigger>
          <TabsTrigger value="shop" className="flex-1 gap-1.5">
            <ShoppingBag className="size-4" />
            Boutique ({shopItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-3 sm:mt-4">
          {recentActivity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucune activité récente.
            </p>
          ) : (
            <div className="space-y-1 sm:space-y-1.5">
              {recentActivity.slice(0, 3).map((c) => (
                <ChallengeCard
                  key={c.id}
                  id={c.id}
                  title={c.title}
                  points={c.points}
                  status={c.status}
                  creatorName={
                    (c.creator as { username: string })?.username ?? "?"
                  }
                  targetName={
                    (c.target as { username: string })?.username ?? "?"
                  }
                  groupId={groupId}
                  compact
                />
              ))}
              <Link
                href={`/g/${groupId}/challenges`}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md border text-sm font-medium text-primary hover:bg-muted/50"
              >
                Voir tous les défis
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shop" className="mt-3 sm:mt-4">
          <div className="space-y-3">
            {groupedShopItems.map((group) => (
              <div key={group.category} className="space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide sm:text-xs">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <ShopItemCard
                    key={item.id}
                    id={item.id}
                    groupId={groupId}
                    name={item.name}
                    description={item.description}
                    price={effectiveShopPrices[item.id] ?? item.price}
                    stock={item.stock}
                    itemType={item.item_type}
                    isAdmin={isAdmin}
                    groupMembers={groupMembers}
                    currentUserId={userId ?? undefined}
                  />
                ))}
              </div>
            ))}
            {isAdmin && (
              <div className="pt-1">
                <AddShopItemDialog groupId={groupId} />
              </div>
            )}
            {"success" in jokerIntel && jokerIntel.success && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Mouchard actif (1h)
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  {jokerIntel.rows.map((row) => (
                    <div key={row.profile_id} className="flex items-center justify-between">
                      <span>{row.username}</span>
                      <span className="font-medium">{row.jokers_available} joker(s)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
