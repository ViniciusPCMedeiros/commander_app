import { TIERS, tierLabel } from "@/lib/level-tiers";
import { cn } from "@/lib/utils";

/** Faixa e divisão de nível ao lado do nome ("Arcano Adepto"). `compact`: só o ícone. */
export function LevelBadge({
  index,
  division,
  compact,
  className,
}: {
  index: number;
  division: number;
  compact?: boolean;
  className?: string;
}) {
  const tier = TIERS[index];
  if (!tier) return null;
  const Icon = tier.icon;
  const label = tierLabel(index, division);
  return (
    <span
      title={`Nível: ${label}`}
      className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-semibold", tier.color, className)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {compact ? <span className="sr-only">Nível {label}</span> : label}
    </span>
  );
}
