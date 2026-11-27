import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LevelBadge } from "@/components/level-badge";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { TIERS, XP_RULES, XP_SOURCE_LABEL } from "@/lib/level";
import { DIVISIONS } from "@/lib/level-tiers";
import { getLevels } from "@/lib/level-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Níveis" };

export default async function LevelsPage() {
  const { supabase, profile } = await requireUser();
  const [{ levels }, { data: users }] = await Promise.all([
    getLevels(),
    supabase.from("users").select("id, name, avatar_url").order("name"),
  ]);
  const rows = (users ?? [])
    .flatMap((u) => {
      const level = levels.get(u.id);
      return level ? [{ ...u, level }] : [];
    })
    .sort((a, b) => b.level.xp - a.level.xp || a.name.localeCompare(b.name));
  const perTier = TIERS.map((_, i) => rows.filter((r) => r.level.tier.index === i).length);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Classificação"
        title="Níveis"
        description="O XP sobe com tudo o que cada pessoa faz no Mesão e nunca cai. Vale todo o histórico."
      />

      <Card>
        <CardHeader>
          <CardTitle>Faixas</CardTitle>
          <CardDescription>
            Cada faixa tem 3 divisões: {DIVISIONS.join(", ").replace(/, ([^,]*)$/, " e $1")}. Abaixo, o XP mínimo de
            cada divisão e quantas pessoas estão na faixa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-5">
            {TIERS.map((t, i) => {
              const Icon = t.icon;
              return (
                <li key={t.name} className="flex items-center gap-3 rounded-lg border p-3 sm:flex-col sm:text-center">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full border bg-muted/40", t.color)}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("font-display font-bold", t.color)}>{t.name}</div>
                    <ul className="mt-1 space-y-0.5 text-xs tabular-nums">
                      {t.steps.map((min, d) => (
                        <li key={d} className="flex justify-between gap-2 sm:justify-center">
                          <span className="text-muted-foreground">{DIVISIONS[d]}</span> {min.toLocaleString("pt-BR")}
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-muted-foreground">
                      {perTier[i]} {perTier[i] === 1 ? "pessoa" : "pessoas"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Todo mundo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r, i) => {
              return (
                <Link
                  key={r.id}
                  href={`/players/${r.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/40",
                    r.id === profile.id && "border-primary/50 bg-primary/5",
                  )}
                >
                  <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                  <Avatar className="size-9 shrink-0">
                    {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
                    <AvatarFallback>{initials(r.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{r.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {r.level.xp.toLocaleString("pt-BR")} XP
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <LevelBadge index={r.level.tier.index} division={r.level.tier.division} className="sm:w-44" />
                      <div
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={r.level.tier.nextLabel ? `Progresso até ${r.level.tier.nextLabel}` : "Nível máximo"}
                        aria-valuenow={r.level.tier.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${r.level.tier.progress}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Como ganhar XP</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {XP_RULES.map(({ source, rule }) => (
                <li key={source}>
                  <div className="font-medium">{XP_SOURCE_LABEL[source]}</div>
                  <div className="text-xs text-muted-foreground">{rule}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
