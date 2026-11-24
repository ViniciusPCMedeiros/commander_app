import { ChevronDown, ChevronUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Variação de posição: ▲ verde (subiu), ▼ vermelho (caiu), = (manteve), NOVO (estreante). */
export function RankMovement({ delta, className }: { delta: number | null | undefined; className?: string }) {
  if (delta === undefined) return null;
  if (delta === null) {
    return (
      <span
        title="Estreou no ranking na última sessão"
        className={cn(
          "inline-flex items-center rounded bg-amber-400 px-1 py-px text-[9px] font-black tracking-wide text-amber-950 italic motion-safe:animate-rank-new",
          className,
        )}
      >
        NOVO
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span title="Manteve a posição" className={cn("inline-flex items-center text-muted-foreground", className)}>
        <Minus className="size-3.5" />
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      title={`${up ? "Subiu" : "Caiu"} ${Math.abs(delta)} posição(ões) desde a última sessão`}
      className={cn(
        "inline-flex items-center text-xs font-black tabular-nums",
        up ? "text-emerald-400 motion-safe:animate-rank-up" : "text-red-400 motion-safe:animate-rank-down",
        className,
      )}
    >
      {up ? <ChevronUp className="-mr-0.5 size-4 stroke-[3]" /> : <ChevronDown className="-mr-0.5 size-4 stroke-[3]" />}
      {Math.abs(delta)}
    </span>
  );
}

const POSITION_STYLE = [
  "from-yellow-200 via-amber-400 to-amber-600", // 1º ouro
  "from-zinc-50 via-zinc-300 to-zinc-500", // 2º prata
  "from-orange-200 via-orange-400 to-orange-700", // 3º bronze
];

/** Número de posição grande, itálico e com gradiente (ouro/prata/bronze, demais em azul). */
export function RankPosition({ position, className }: { position: number | null; className?: string }) {
  if (position === null) return <span className={cn("text-xl font-black text-muted-foreground italic", className)}>–</span>;
  return (
    <span
      className={cn(
        "font-display bg-gradient-to-b bg-clip-text pr-0.5 text-2xl leading-none font-bold text-transparent drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]",
        POSITION_STYLE[position - 1] ?? "from-sky-200 via-sky-400 to-blue-600",
        className,
      )}
    >
      {position}
    </span>
  );
}
