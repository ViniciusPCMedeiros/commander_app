import { Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPips } from "@/components/color-pips";
import {
  COLOR_NAME,
  IDENTITY_MIN_GAMES,
  IDENTITY_THRESHOLD,
  type ColorShare,
} from "@/lib/color-profile";
import { cn } from "@/lib/utils";

const BAR: Record<string, string> = {
  W: "bg-amber-100",
  U: "bg-sky-500",
  B: "bg-zinc-400",
  R: "bg-red-500",
  G: "bg-emerald-500",
  C: "bg-stone-400",
};

/** Cores mais jogadas: barra por cor (% das partidas) e a identidade (cores acima de 50%). */
export function ColorProfileCard({
  name,
  games,
  shares,
  identity,
}: {
  name: string;
  games: number;
  shares: ColorShare[];
  identity: { colors: string[]; name: string } | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5" /> Cores
        </CardTitle>
        <CardDescription>
          Em quantas das {games} partidas de {name} cada cor estava no deck. Acima de {IDENTITY_THRESHOLD}%, a cor entra
          na identidade (o incolor só quando nenhuma cor passa).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {games === 0 && <p className="text-sm text-muted-foreground">Nenhuma partida aprovada.</p>}
        {identity ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <ColorPips colors={identity.colors} className="text-lg" />
            <span className="font-display text-lg font-bold text-primary">{identity.name}</span>
            <span className="text-xs text-muted-foreground">identidade de {name}</span>
          </div>
        ) : (
          games > 0 && (
            <p className="text-xs text-muted-foreground">
              {games < IDENTITY_MIN_GAMES
                ? `A identidade aparece a partir de ${IDENTITY_MIN_GAMES} partidas.`
                : `Nenhuma cor em mais da metade das partidas: ${name} varia bastante.`}
            </p>
          )
        )}
        <div className="space-y-2">
          {shares.map((s) => (
            <div key={s.color} className="flex items-center gap-3 text-sm">
              <ColorPips colors={[s.color]} />
              <span className={cn("w-20 shrink-0", s.core ? "font-semibold" : "text-muted-foreground")}>
                {COLOR_NAME[s.color]}
              </span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", BAR[s.color], !s.core && "opacity-45")}
                  style={{ width: `${s.pct}%` }}
                />
                {/* Linha dos 50% */}
                <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" />
              </div>
              <span className={cn("w-10 text-right tabular-nums", s.core && "font-semibold text-primary")}>{s.pct}%</span>
              <span className="hidden w-16 text-right text-xs text-muted-foreground tabular-nums sm:inline">
                {s.wins}V/{s.games}J
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
