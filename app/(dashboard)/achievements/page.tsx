import type { Metadata } from "next";
import Link from "next/link";
import { Crown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AchievementChip, AchievementIcon, RARITY_STYLE } from "@/components/achievement-badge";
import { PageHeader } from "@/components/page-header";
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENTS,
  CATEGORY_LABEL,
  isHidden,
  loadAchievements,
  RARITY_LABEL,
  type Category,
  type Rarity,
} from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conquistas" };

const CATEGORIES: Category[] = ["abates", "vitorias", "jornada", "colecao", "secretas"];
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "mythic"];

export default async function AchievementsPage() {
  const { supabase } = await requireUser();
  const data = await loadAchievements(supabase);
  const byId = new Map(data.players.map((p) => [p.id, p]));
  // Quem já jogou (base do "% do grupo")
  const active = data.progress.size;
  const recent = data.unlocks.slice(-8).reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Selos"
        title="Conquistas"
        description="Liberadas automaticamente pelas partidas aprovadas. Valem para todo o histórico, inclusive partidas antigas."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
          {RARITIES.map((r) => (
            <span key={r} className={cn("font-semibold", RARITY_STYLE[r].text)}>
              ● {RARITY_LABEL[r]}
            </span>
          ))}
          <span className="font-semibold text-violet-300">● Secreta</span>
        </div>
      </PageHeader>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Últimas liberadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.map((u) => {
              const a = ACHIEVEMENT_BY_ID.get(u.id)!;
              return (
                <div key={`${u.playerId}:${u.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Link href={`/players/${u.playerId}`} className="font-semibold hover:underline">
                    {byId.get(u.playerId)?.name}
                  </Link>
                  <AchievementChip achievement={a} />
                  <span className="text-xs text-muted-foreground">{formatDate(u.at)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {CATEGORIES.map((cat) => (
        <section key={cat} className="space-y-3">
          <h2 className="font-semibold">{CATEGORY_LABEL[cat]}</h2>
          {cat === "secretas" && (
            <p className="text-xs text-muted-foreground">
              A condição de cada uma só aparece depois que alguém do grupo liberar.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACHIEVEMENTS.filter((a) => a.category === cat).map((a) => {
              const hidden = isHidden(a, data);
              const holders = data.unlocks.filter((u) => u.id === a.id);
              const pioneer = holders[0];
              return (
                <Card key={a.id} className={cn("gap-3 px-4 py-4", holders.length === 0 && "opacity-80")}>
                  <div className="flex items-start gap-3">
                    <AchievementIcon achievement={a} locked={holders.length === 0} hidden={hidden} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{hidden ? "Conquista secreta" : a.name}</div>
                      <div
                        className={cn(
                          "text-[10px] font-semibold tracking-wider uppercase",
                          a.secret ? "text-violet-300" : RARITY_STYLE[a.rarity].text,
                        )}
                      >
                        {a.secret ? "Secreta" : RARITY_LABEL[a.rarity]}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hidden ? "Ninguém descobriu ainda. ???" : a.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                    {holders.length === 0 ? (
                      <span>Ninguém liberou ainda</span>
                    ) : (
                      <>
                        <div className="flex -space-x-2">
                          {holders.slice(0, 6).map((u) => (
                            <Link key={u.playerId} href={`/players/${u.playerId}`} title={byId.get(u.playerId)?.name}>
                              <Avatar className="size-6 ring-2 ring-card">
                                {byId.get(u.playerId)?.avatar_url && (
                                  <AvatarImage src={byId.get(u.playerId)!.avatar_url!} alt="" />
                                )}
                                <AvatarFallback className="text-[9px]">
                                  {initials(byId.get(u.playerId)?.name ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                            </Link>
                          ))}
                        </div>
                        <span className="tabular-nums">
                          {active ? Math.round((holders.length / active) * 100) : 0}% do grupo
                        </span>
                        <span
                          className="ml-auto flex min-w-0 items-center gap-1"
                          title={`Primeira pessoa a liberar, em ${formatDate(pioneer.at)}`}
                        >
                          <Crown className="size-3 shrink-0 text-amber-400" />
                          <span className="truncate">{byId.get(pioneer.playerId)?.name}</span>
                        </span>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
