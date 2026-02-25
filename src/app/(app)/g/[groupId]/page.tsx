import { getGroupHomeData } from "./home-actions";
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

export default async function GroupHomePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const {
    profile,
    pendingActions,
    recentActivity,
    leaderboard,
    shopItems,
    isAdmin,
    userId,
  } = await getGroupHomeData(groupId);

  return (
    <main className="px-4 pt-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Salut, {profile?.username ?? "!"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quoi de neuf aujourd&apos;hui ?
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
          <Coins className="size-5 text-yellow-500" />
          <span className="text-2xl font-bold">
            {profile?.total_points ?? 0}
          </span>
          <span className="text-sm text-muted-foreground">pts</span>
        </div>
      </div>

      {/* En attente */}
      {pendingActions.length > 0 && (
        <>
          <Separator className="my-6" />
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="size-5" />
              <h2 className="text-lg font-semibold">
                En attente ({pendingActions.length})
              </h2>
            </div>
            <div className="space-y-2">
              {pendingActions.map((c) => (
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
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Classement */}
      <Separator className="my-6" />
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="size-5" />
          <h2 className="text-lg font-semibold">Classement</h2>
        </div>
        <Leaderboard entries={leaderboard} currentUserId={userId ?? undefined} />
      </section>

      {/* Onglets Activite / Boutique */}
      <Separator className="my-6" />
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

        <TabsContent value="activity" className="mt-4">
          {recentActivity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucune activité récente.
            </p>
          ) : (
            <div className="space-y-2">
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
                />
              ))}
              <Link
                href={`/g/${groupId}/challenges`}
                className="block text-center text-sm text-primary underline pt-1"
              >
                Voir tous les défis
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shop" className="mt-4">
          {(() => {
            const specialItems = shopItems.filter((i) => i.item_type !== "custom");
            const customItems = shopItems.filter((i) => i.item_type === "custom");
            return (
              <div className="space-y-4">
                {specialItems.length > 0 && (
                  <div className="space-y-3">
                    {specialItems.map((item) => (
                      <ShopItemCard
                        key={item.id}
                        id={item.id}
                        groupId={groupId}
                        name={item.name}
                        description={item.description}
                        price={item.price}
                        stock={item.stock}
                        itemType={item.item_type}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                )}
                {customItems.length > 0 && (
                  <>
                    {specialItems.length > 0 && (
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Items personnalisés
                      </p>
                    )}
                    <div className="space-y-3">
                      {customItems.map((item) => (
                        <ShopItemCard
                          key={item.id}
                          id={item.id}
                          groupId={groupId}
                          name={item.name}
                          description={item.description}
                          price={item.price}
                          stock={item.stock}
                          itemType={item.item_type}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  </>
                )}
                {isAdmin && (
                  <div className="flex justify-end">
                    <AddShopItemDialog groupId={groupId} />
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </main>
  );
}
