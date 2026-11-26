import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Coroa do Rei da Mesa: o líder da temporada em andamento (ou o Rei de uma partida). */
export function KingBadge({ label = "Rei da Mesa", compact, className }: { label?: string; compact?: boolean; className?: string }) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/10 text-amber-300",
        compact ? "px-1 py-0.5" : "px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
    >
      <Crown className={compact ? "size-3" : "size-3.5"} aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
