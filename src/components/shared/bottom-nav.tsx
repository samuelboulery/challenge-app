"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Swords, Users, UserCircle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/hooks/use-supabase";
import { useGroup } from "./group-context";

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1];
}

export function BottomNav() {
  const pathname = usePathname();
  const group = useGroup();
  const supabase = useSupabase();
  const [unreadCount, setUnreadCount] = useState(0);
  const [cookieGroupId, setCookieGroupId] = useState<string | undefined>();
  const userIdRef = useRef<string | null>(null);

  const pathnameGroupId = useMemo(() => {
    const match = pathname.match(/^\/g\/([^/]+)/);
    return match?.[1];
  }, [pathname]);

  useEffect(() => {
    if (!pathnameGroupId) {
      setCookieGroupId(getCookie("lastGroupId"));
    }
  }, [pathnameGroupId]);

  const resolvedGroupId = group?.groupId ?? pathnameGroupId ?? cookieGroupId;
  const groupPrefix = resolvedGroupId ? `/g/${resolvedGroupId}` : "";

  const navItems = useMemo(() => {
    const items: { key: string; href: string; label: string; icon: typeof Home }[] = [];

    if (groupPrefix) {
      items.push(
        { key: "home", href: groupPrefix, label: "Accueil", icon: Home },
        { key: "challenges", href: `${groupPrefix}/challenges`, label: "Défis", icon: Swords },
        {
          key: "group",
          href: `${groupPrefix}/manage`,
          label: group?.groupName ?? "Groupe",
          icon: Users,
        },
      );
    }

    items.push(
      { key: "notifs", href: "/notifications", label: "Notifs", icon: Bell },
      { key: "profile", href: "/profile", label: "Profil", icon: UserCircle },
    );

    return items;
  }, [groupPrefix, group?.groupName]);

  const fetchUnread = useCallback(async () => {
    if (!userIdRef.current) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;
    }

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", userIdRef.current)
      .eq("read", false);

    setUnreadCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  return (
    <nav aria-label="Navigation principale" className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-safe">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around">
        {navItems.map(({ key, href, label, icon: Icon }) => {
          const isActive =
            href === groupPrefix
              ? pathname === groupPrefix
              : pathname.startsWith(href);
          const showBadge = key === "notifs" && unreadCount > 0;

          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground",
              )}
            >
              <div className="relative">
                <Icon className="size-5" />
                {showBadge && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="max-w-[4rem] truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
