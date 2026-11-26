import { Crown, Sparkles } from "lucide-react";
import { themeColor, type DisplayTitle } from "@/lib/seasons";
import { cn } from "@/lib/utils";

/**
 * Título de temporada exibido ao lado do nome (Lenda ou Coroa). O texto tem um
 * brilho que passa por ele — nenhum outro selo do app tem isso.
 */
export function PlayerTitle({ title, className }: { title: DisplayTitle | null | undefined; className?: string }) {
  if (!title?.label) return null;
  const Icon = title.kind === "coroa" ? Crown : Sparkles;
  const color = themeColor(title.color);
  return (
    <span
      title={
        title.kind === "coroa" ? "Coroa: 1º lugar da temporada" : "Lenda: completou todas as conquistas da temporada"
      }
      className={cn("inline-flex min-w-0 items-center gap-1 text-xs font-semibold", color.text, className)}
    >
      <Icon className="size-3 shrink-0" />
      <span
        className="truncate bg-[length:200%_100%] bg-clip-text text-transparent motion-safe:animate-title-shine"
        style={{ backgroundImage: `linear-gradient(110deg, ${color.hex} 40%, #fff7d6 50%, ${color.hex} 60%)` }}
      >
        {title.label}
      </span>
    </span>
  );
}
