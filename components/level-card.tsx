import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XP_RULES, XP_SOURCE_LABEL, type Level } from "@/lib/level";
import { cn } from "@/lib/utils";

/** Card do perfil: faixa atual, barra até a próxima e de onde veio o XP. */
export function LevelCard({ name, level }: { name: string; level: Level }) {
  const { tier, xp, bySource } = level;
  const Icon = tier.icon;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-5" /> Nível
        </CardTitle>
        <CardDescription>
          Sobe com tudo o que {name} faz no Mesão: partidas, vitórias, abates, conquistas, temporadas e decks jogados.
          Nunca cai.{" "}
          <Link href="/levels" className="text-foreground hover:underline">
            Ver o nível de todo mundo →
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-full border bg-muted/40", tier.color)}>
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className={cn("font-display text-xl font-bold", tier.color)}>{tier.label}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{xp.toLocaleString("pt-BR")} XP</span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={tier.nextLabel ? `Progresso até ${tier.nextLabel}` : "Nível máximo"}
              aria-valuenow={tier.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${tier.progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {tier.next !== null
                ? `Faltam ${(tier.next - xp).toLocaleString("pt-BR")} XP para ${tier.nextLabel}.`
                : "Nível máximo."}
            </p>
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          {XP_RULES.map(({ source, rule }) => (
            <li key={source} className="flex items-baseline gap-3">
              <span className="w-28 shrink-0">{XP_SOURCE_LABEL[source]}</span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">{rule}</span>
              <span className="shrink-0 font-semibold tabular-nums">{bySource[source].toLocaleString("pt-BR")}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
