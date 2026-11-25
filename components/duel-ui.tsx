import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import type { RivalPlayer } from "@/lib/rivalries";
import { cn } from "@/lib/utils";

export function PlayerAvatar({ player, className }: { player: RivalPlayer | undefined; className?: string }) {
  return (
    <Avatar className={cn("size-10 ring-1 ring-primary/40", className)}>
      {player?.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
      <AvatarFallback>{initials(player?.name ?? "?")}</AvatarFallback>
    </Avatar>
  );
}

/** Placar "3 × 1": quem está na frente fica destacado (verde para o lado de quem lê). */
export function Score({ mine, theirs, className }: { mine: number; theirs: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 tabular-nums", className)}>
      <span className={cn(mine > theirs ? "font-bold text-emerald-300" : "text-foreground/80")}>{mine}</span>
      <span className="text-xs text-muted-foreground">×</span>
      <span className={cn(theirs > mine ? "font-bold text-rose-300" : "text-foreground/80")}>{theirs}</span>
    </span>
  );
}

/** Barra dividida entre os dois lados (proporção de um placar). */
export function SplitBar({ left, right }: { left: number; right: number }) {
  const total = left + right;
  const pct = total ? (left / total) * 100 : 50;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full", total ? "bg-emerald-400/80" : "bg-muted")} style={{ width: `${pct}%` }} />
      <div className={cn("h-full flex-1", total ? "bg-rose-400/70" : "bg-muted")} />
    </div>
  );
}
