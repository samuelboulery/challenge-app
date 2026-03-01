import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getStoreItemCategory,
  getStoreItemCategoryLabel,
  type StoreItemCategory,
} from "@/lib/store-item-types";
import { Coins, Crown, Flame, Shield, Swords, Wrench } from "lucide-react";

const CATEGORY_BADGE_CONFIG: Record<
  StoreItemCategory,
  { icon: typeof Shield; className: string }
> = {
  defense: {
    icon: Shield,
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
  attaque: {
    icon: Swords,
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  chaos: {
    icon: Flame,
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
  },
  economie: {
    icon: Coins,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  special: {
    icon: Crown,
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  custom: {
    icon: Wrench,
    className: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
};

interface StoreItemCategoryBadgeProps {
  itemType: string;
  className?: string;
}

export function StoreItemCategoryBadge({
  itemType,
  className,
}: StoreItemCategoryBadgeProps) {
  const category = getStoreItemCategory(itemType);
  const label = getStoreItemCategoryLabel(itemType);
  const config = CATEGORY_BADGE_CONFIG[category];
  const Icon = config.icon;

  return (
    <Badge
      variant="secondary"
      className={cn("shrink-0 text-[11px] sm:text-xs", config.className, className)}
    >
      <Icon className="mr-1 size-3" />
      {label}
    </Badge>
  );
}
