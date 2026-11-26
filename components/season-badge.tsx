import { RARITY_STYLE } from "@/components/achievement-badge";
import { SEASON_ICONS, type SeasonAchievement } from "@/lib/seasons";
import { cn } from "@/lib/utils";

/** Ícone redondo de uma conquista de temporada (cinza enquanto não liberada). */
export function SeasonAchievementIcon({
  achievement,
  locked = false,
  className,
}: {
  achievement: Pick<SeasonAchievement, "icon" | "rarity">;
  locked?: boolean;
  className?: string;
}) {
  const Icon = SEASON_ICONS[achievement.icon] ?? SEASON_ICONS.star;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full ring-2",
        locked ? "bg-muted/40 text-muted-foreground/60 ring-border" : RARITY_STYLE[achievement.rarity].ring,
        className,
      )}
    >
      <Icon className="size-[45%]" />
    </span>
  );
}
