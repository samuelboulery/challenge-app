import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";
import { getMyInventory } from "@/app/(app)/groups/[id]/shop-actions";
import { getAllBadges, getMyBadges, getBadgeProgress } from "./badge-actions";
import { EditProfileDialog } from "./edit-profile-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BadgeGrid } from "./badge-grid";
import {
  Flame,
  Package,
  Award,
  Shield,
  Zap,
  Skull,
  CheckCircle2,
  Circle,
} from "lucide-react";

const ITEM_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Shield; className: string }
> = {
  joker: {
    label: "Joker",
    icon: Shield,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  booster: {
    label: "Booster",
    icon: Zap,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  voleur: {
    label: "Voleur",
    icon: Skull,
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

type InventoryItem = Awaited<ReturnType<typeof getMyInventory>>[number];

function groupByGroupName(items: InventoryItem[]) {
  const groups: Record<string, { groupName: string; items: InventoryItem[] }> = {};

  for (const item of items) {
    const shopItem = item.shop_items as {
      name: string;
      description: string | null;
      price: number;
      item_type: string;
      group_id: string;
      groups: { name: string } | null;
    } | null;

    const groupName = shopItem?.groups?.name ?? "Inconnu";
    const groupId = shopItem?.group_id ?? "unknown";

    if (!groups[groupId]) {
      groups[groupId] = { groupName, items: [] };
    }
    groups[groupId].items.push(item);
  }

  return Object.values(groups);
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id ?? "")
    .single();

  const [inventory, allBadges, myBadges, progress] = await Promise.all([
    getMyInventory(),
    getAllBadges(),
    getMyBadges(),
    getBadgeProgress(),
  ]);

  const earnedBadgeIds = new Set(myBadges.map((ub) => ub.badge_id));
  const groupedInventory = groupByGroupName(inventory);

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mon Profil</h1>
        {profile && (
          <EditProfileDialog
            userId={user?.id ?? ""}
            currentUsername={profile.username}
            currentAvatarUrl={profile.avatar_url}
          />
        )}
      </div>

      {profile && (
        <Card className="mt-6">
          <CardContent className="flex items-center gap-4 py-6">
            <Avatar className="size-14">
              <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.username} />
              <AvatarFallback className="text-lg">
                {profile.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{profile.username}</p>
              <p className="text-sm text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
              <Flame className="size-5 text-orange-500" />
              <span className="text-2xl font-bold">{profile.total_points}</span>
              <span className="text-sm text-muted-foreground">pts</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-6" />

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Award className="size-5" />
          <h2 className="text-lg font-semibold">
            Badges ({myBadges.length}/{allBadges.length})
          </h2>
        </div>
        <BadgeGrid
          allBadges={allBadges}
          earnedBadgeIds={earnedBadgeIds}
          myBadges={myBadges}
          progress={progress}
        />
      </section>

      <Separator className="my-6" />

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Mon inventaire ({inventory.length})
        </h2>
        {inventory.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Package className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun item acheté pour le moment.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedInventory.map((group) => (
              <div key={group.groupName}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {group.groupName}
                </h3>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const shopItem = item.shop_items as {
                      name: string;
                      description: string | null;
                      price: number;
                      item_type: string;
                      group_id: string;
                      groups: { name: string } | null;
                    } | null;

                    const typeConfig = shopItem
                      ? ITEM_TYPE_CONFIG[shopItem.item_type]
                      : undefined;
                    const isUsed = !!item.used_at;
                    const TypeIcon = typeConfig?.icon;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between rounded-lg border p-3 ${isUsed ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">
                            {isUsed ? (
                              <CheckCircle2 className="size-4 text-muted-foreground" />
                            ) : (
                              <Circle className="size-4 text-green-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">
                                {shopItem?.name ?? "Item inconnu"}
                              </p>
                              {typeConfig && TypeIcon && (
                                <Badge
                                  variant="secondary"
                                  className={`text-xs shrink-0 ${typeConfig.className}`}
                                >
                                  <TypeIcon className="mr-0.5 size-3" />
                                  {typeConfig.label}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {isUsed
                                ? `Utilisé le ${new Date(item.used_at!).toLocaleDateString("fr-FR")}`
                                : "Disponible"}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0 ml-2">
                          {new Date(item.purchased_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-6" />

      <form action={logout}>
        <Button variant="destructive" type="submit">
          Se déconnecter
        </Button>
      </form>
    </main>
  );
}
