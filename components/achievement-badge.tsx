import { Lock } from "lucide-react";
import type { AchievementDef, Rarity } from "@/lib/achievements";
import { cn } from "@/lib/utils";

/**
 * Cores das raridades, como nos símbolos de expansão: comum em grafite fosco,
 * incomum em prata azulada, rara em dourado e mítica em laranja com brilho.
 */
export const RARITY_STYLE: Record<Rarity, { ring: string; text: string; chip: string }> = {
  common: {
    ring: "bg-stone-900 text-stone-300 ring-stone-600",
    text: "text-stone-400",
    chip: "border-stone-600/70 bg-stone-800/60 text-stone-300",
  },
  uncommon: {
    ring: "bg-gradient-to-br from-sky-100/40 via-slate-300/25 to-sky-700/30 text-sky-50 ring-sky-200/90 shadow-[0_0_10px_-4px] shadow-sky-200/70",
    text: "text-sky-200",
    chip: "border-sky-200/50 bg-sky-200/10 text-sky-100",
  },
  rare: {
    ring: "bg-gradient-to-br from-amber-300/30 to-amber-700/25 text-amber-200 ring-amber-400/80",
    text: "text-amber-300",
    chip: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  },
  mythic: {
    ring: "bg-gradient-to-br from-orange-400/35 to-red-700/30 text-orange-200 ring-orange-500/90 shadow-[0_0_14px_-4px] shadow-orange-500/70",
    text: "text-orange-400",
    chip: "border-orange-500/50 bg-orange-500/10 text-orange-200",
  },
};

const SECRET_STYLE = {
  ring: "bg-violet-500/15 text-violet-200 ring-violet-400/60",
  chip: "border-violet-400/40 bg-violet-500/10 text-violet-200",
};

/** Ícone redondo da conquista. `locked`: ainda não liberada (cinza); `hidden`: secreta escondida. */
export function AchievementIcon({
  achievement,
  locked = false,
  hidden = false,
  className,
}: {
  achievement: AchievementDef;
  locked?: boolean;
  hidden?: boolean;
  className?: string;
}) {
  const Icon = hidden ? Lock : achievement.icon;
  const style = achievement.secret ? SECRET_STYLE.ring : RARITY_STYLE[achievement.rarity].ring;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full ring-2",
        locked || hidden ? "bg-muted/40 text-muted-foreground/60 ring-border" : style,
        className,
      )}
    >
      <Icon className="size-[45%]" />
    </span>
  );
}

/** Selinho compacto (card da partida, histórico). */
export function AchievementChip({ achievement }: { achievement: AchievementDef }) {
  const Icon = achievement.icon;
  return (
    <span
      title={`${achievement.name} — ${achievement.description}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
        achievement.secret ? SECRET_STYLE.chip : RARITY_STYLE[achievement.rarity].chip,
      )}
    >
      <Icon className="size-3" />
      {achievement.name}
    </span>
  );
}
