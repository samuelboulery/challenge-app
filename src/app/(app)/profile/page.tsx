import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";
import { getMyInventory } from "@/app/(app)/groups/[id]/shop-actions";
import { getAllBadges, getMyBadges, getBadgeProgress } from "./badge-actions";
import { EditProfileDialog } from "./edit-profile-dialog";
import { PushToggle } from "@/app/(app)/notifications/push-toggle";
import { cookies } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BadgeGrid } from "./badge-grid";
import {
  Coins,
  Package,
  Award,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { StoreItemCategoryBadge } from "@/components/shared/store-item-category-badge";

type InventoryItem = Awaited<ReturnType<typeof getMyInventory>>[number];

function getItemUsageHint(itemType: string): { status: string; cta: "open-challenges" | null } {
  if (itemType === "voleur") {
    return { status: "Utilisation immédiate à l'achat", cta: null };
  }
  if (itemType === "custom") {
    return { status: "Item personnalisé (pas d'effet consommable standard)", cta: null };
  }
  if (itemType === "joker") {
    return { status: "Utilisable au refus/annulation d'un défi", cta: "open-challenges" };
  }
  if (itemType === "booster") {
    return { status: "Utilisable à l'acceptation d'un défi", cta: "open-challenges" };
  }
  if (itemType === "item_49_3") {
    return { status: "Utilisable après soumission de preuve", cta: "open-challenges" };
  }
  if (itemType === "surcharge") {
    return { status: "Utilisable pendant une contestation en cours", cta: "open-challenges" };
  }

  return { status: "Utilisable dans un contexte de défi", cta: "open-challenges" };
}

function getItemGroup(item: InventoryItem): { groupId: string | null; groupName: string | null } {
  const shopItem = item.shop_items as
    | {
        name: string;
        description: string | null;
        price: number;
        item_type: string;
        group_id: string;
        groups: { name: string } | null;
      }
    | null;

  return {
    groupId: shopItem?.group_id ?? null,
    groupName: shopItem?.groups?.name ?? null,
  };
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

  const cookieStore = await cookies();
  const selectedGroupId = cookieStore.get("lastGroupId")?.value?.trim() || null;

  const filteredInventory = selectedGroupId
    ? inventory.filter((item) => getItemGroup(item).groupId === selectedGroupId)
    : [];
  const firstFilteredItem = filteredInventory[0];
  const selectedGroupName = firstFilteredItem
    ? getItemGroup(firstFilteredItem).groupName
    : null;

  const earnedBadgeIds = new Set(myBadges.map((ub) => ub.badge_id));

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
              <Coins className="size-5 text-yellow-500" />
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
        <h2 className="mb-4 text-lg font-semibold">Notifications</h2>
        <PushToggle />
      </section>

      <Separator className="my-6" />

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Mon inventaire ({filteredInventory.length})
        </h2>
        {filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Package className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {!selectedGroupId
                ? "Aucun groupe actif sélectionné. Ouvre un groupe pour filtrer ton inventaire."
                : "Aucun item disponible pour le groupe sélectionné."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedGroupName && (
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                {selectedGroupName}
              </h3>
            )}
            {filteredInventory.map((item) => {
              const shopItem = item.shop_items as {
                name: string;
                description: string | null;
                price: number;
                item_type: string;
                group_id: string;
                groups: { name: string } | null;
              } | null;

              const isUsed = !!item.used_at;
              const itemType = shopItem?.item_type ?? "custom";
              const usageHint = getItemUsageHint(itemType);
              const groupId = shopItem?.group_id ?? null;

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
                        <StoreItemCategoryBadge itemType={itemType} className="text-xs" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isUsed && item.used_at
                          ? `Utilisé le ${new Date(item.used_at).toLocaleDateString("fr-FR")}`
                          : "Disponible"}
                      </p>
                      {!isUsed && (
                        <p className="text-xs text-muted-foreground">
                          {usageHint.status}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 ml-2 flex flex-col items-end gap-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.purchased_at).toLocaleDateString("fr-FR")}
                    </p>
                    {!isUsed && usageHint.cta === "open-challenges" && groupId && (
                      <Link
                        href={`/g/${groupId}/challenges`}
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Ouvrir les défis
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
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
