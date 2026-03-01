import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InviteCodeSection } from "@/app/(app)/groups/[id]/invite-code-section";
import { LeaveGroupButton } from "@/app/(app)/groups/[id]/leave-group-button";
import { ShopItemCard } from "@/components/shared/shop-item-card";
import { AddShopItemDialog } from "@/components/shared/add-shop-item-dialog";
import { getShopItems } from "@/app/(app)/groups/[id]/shop-actions";
import { Leaderboard } from "@/components/shared/leaderboard";
import { GroupSwitcher } from "@/components/shared/group-switcher";
import { getMyGroups } from "@/app/(app)/groups/actions";
import { GroupAdminActions } from "@/app/(app)/groups/[id]/group-admin-actions";
import { ShoppingBag, Trophy, Users } from "lucide-react";

const ROLE_CONFIG = {
  owner: { label: "Fondateur", variant: "default" as const },
  admin: { label: "Admin", variant: "secondary" as const },
  member: { label: "Membre", variant: "outline" as const },
};

export default async function GroupManagePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  const [{ data: members }, shopItems, allGroups, { data: leaderboardData }] =
    await Promise.all([
      supabase
        .from("members")
        .select("*, profiles(username, avatar_url)")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true }),
      getShopItems(groupId),
      getMyGroups(),
      supabase.rpc("get_group_points_leaderboard", {
        p_group_id: groupId,
      }),
    ]);

  const leaderboardEntries = (leaderboardData ?? [])
    .map((m) => {
      return {
        profileId: m.profile_id,
        username: m.username ?? "Utilisateur",
        totalPoints: m.group_points ?? 0,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const currentMember = members?.find((m) => m.profile_id === user?.id);
  const isOwner = currentMember?.role === "owner";
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

  const switcherGroups = allGroups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount:
      (g.members as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return (
    <main className="px-4 pt-8">
      <div>
        <h1 className="text-2xl font-bold">{group.name}</h1>
        {group.description && (
          <p className="mt-1 text-muted-foreground">{group.description}</p>
        )}
      </div>

      <Separator className="my-6" />

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-5" />
          <h2 className="text-lg font-semibold">Changer de groupe</h2>
        </div>
        <GroupSwitcher groups={switcherGroups} currentGroupId={groupId} />
      </section>

      <Separator className="my-6" />

      <InviteCodeSection inviteCode={group.invite_code} />

      <Separator className="my-6" />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Boutique ({shopItems.length})
          </h2>
          {isAdmin && <AddShopItemDialog groupId={groupId} />}
        </div>
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
              {specialItems.length === 0 && customItems.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ShoppingBag className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Aucun item en vente.
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      <Separator className="my-6" />

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="size-5" />
          <h2 className="text-lg font-semibold">Classement</h2>
        </div>
        <Leaderboard entries={leaderboardEntries} currentUserId={user?.id} />
      </section>

      <Separator className="my-6" />

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          Membres ({members?.length ?? 0})
        </h2>
        <div className="space-y-3">
          {members?.map((member) => {
            const config = ROLE_CONFIG[member.role];
            const profile = member.profiles as {
              username: string;
              avatar_url: string | null;
            } | null;
            const username = profile?.username ?? "Utilisateur";
            const fallbackInitial = username.charAt(0).toUpperCase();

            return (
              <div
                key={member.profile_id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage
                      src={profile?.avatar_url ?? undefined}
                      alt={username}
                    />
                    <AvatarFallback>{fallbackInitial}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{username}</p>
                    <p className="text-xs text-muted-foreground">
                      Rejoint le{" "}
                      {new Date(member.joined_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <Badge variant={config.variant}>{config.label}</Badge>
              </div>
            );
          })}
        </div>
      </section>

      {isAdmin && (
        <>
          <Separator className="my-6" />
          <GroupAdminActions
            groupId={groupId}
            name={group.name}
            description={group.description}
            isOwner={isOwner}
            members={(members ?? []).map((member) => ({
              profileId: member.profile_id,
              username:
                (member.profiles as { username: string } | null)?.username ??
                "Utilisateur",
              role: member.role,
            }))}
          />
        </>
      )}

      {!isOwner && (
        <>
          <Separator className="my-6" />
          <LeaveGroupButton groupId={groupId} />
        </>
      )}
    </main>
  );
}
