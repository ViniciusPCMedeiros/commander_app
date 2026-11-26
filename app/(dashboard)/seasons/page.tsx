import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, Crown, Hourglass, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RARITY_STYLE } from "@/components/achievement-badge";
import { PageHeader } from "@/components/page-header";
import { PlayerTitle } from "@/components/player-title";
import { SeasonAchievementIcon } from "@/components/season-badge";
import { RARITY_LABEL } from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { loadRanking, sortRows } from "@/lib/ranking";
import { isRoot } from "@/lib/roles";
import { closeDeadline, seasonLabel, seasonStatus, themeColor, titleFor, type Season } from "@/lib/seasons";
import { currentSeason, loadSeasons, loadSeasonUnlocks } from "@/lib/seasons-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Temporada" };

/** "faltam 3 dias" / "falta 1 hora" até a data. */
function timeLeft(iso: string, now = new Date()) {
  const ms = new Date(iso).getTime() - now.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days === 1 ? "falta 1 dia" : `faltam ${days} dias`}`;
  const hours = Math.max(1, Math.ceil(ms / 3_600_000));
  return hours === 1 ? "falta 1 hora" : `faltam ${hours} horas`;
}

function statusLine(s: Season, now = new Date()) {
  const status = seasonStatus(s, now);
  if (status === "upcoming") return `Começa em ${formatDateTime(s.starts_at)} (${timeLeft(s.starts_at, now)})`;
  if (status === "active") return `Em andamento até ${formatDateTime(s.ends_at)} · ${timeLeft(s.ends_at, now)}`;
  if (status === "ended")
    return `Terminou — o resultado sai quando as últimas partidas forem moderadas (até ${formatDate(closeDeadline(s).toISOString())}).`;
  return `Encerrada em ${formatDate(s.closed_at!)} · ${formatDate(s.starts_at)} a ${formatDate(s.ends_at)}`;
}

/** Atalhos para cada temporada (e para a próxima, quando ainda não foi lançada). */
function SeasonChips({ seasons, selected, comingSoon }: { seasons: Season[]; selected: number | null; comingSoon: boolean }) {
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs transition-colors",
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
    );
  return (
    <div className="flex flex-wrap gap-1.5 pt-3">
      {comingSoon && (
        <Link href="/seasons" scroll={false} className={chip(selected === null)}>
          Próxima · em breve
        </Link>
      )}
      {[...seasons].reverse().map((s) => (
        <Link key={s.number} href={`/seasons?t=${s.number}`} scroll={false} className={chip(s.number === selected)}>
          {seasonLabel(s)}
        </Link>
      ))}
    </div>
  );
}

export default async function SeasonsPage(props: PageProps<"/seasons">) {
  const sp = await props.searchParams;
  const { supabase, profile } = await requireUser();
  const seasons = await loadSeasons(supabase);
  // Sem temporada em andamento nem agendada, a página abre no "em breve"; as antigas seguem nos atalhos
  const live = currentSeason(seasons) ?? seasons.find((s) => seasonStatus(s) === "upcoming") ?? null;
  const season = seasons.find((s) => s.number === Number(sp.t)) ?? live;

  if (!season) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Temporadas"
          title="Em breve"
          description="Ranking, conquistas e títulos próprios de cada temporada."
        >
          {seasons.length > 0 && <SeasonChips seasons={seasons} selected={null} comingSoon />}
        </PageHeader>
        <Card className="border-primary/30">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Hourglass className="size-10 text-primary/80" />
            <div className="font-display text-xl font-bold">
              {seasons.length ? "Uma nova temporada vem aí" : "A primeira temporada vem aí"}
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Quando ela for anunciada, aparecem aqui o tema, as conquistas e os títulos em jogo. Até lá, as partidas
              seguem valendo no ranking geral e nas conquistas de sempre.
            </p>
            {seasons.length > 0 && (
              <p className="text-xs text-muted-foreground">Enquanto isso, reveja as temporadas anteriores nos atalhos acima.</p>
            )}
            {isRoot(profile.role) && (
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href="/admin/seasons">Lançar temporada</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = seasonStatus(season);
  const color = themeColor(season.theme.color);
  const [unlocks, { data: users }, { data: myProgress }, ranking] = await Promise.all([
    loadSeasonUnlocks(supabase, season.id),
    supabase.from("users").select("id, name, avatar_url, role"),
    supabase.from("season_progress").select("progress").eq("season_id", season.id).eq("user_id", profile.id).maybeSingle(),
    status === "upcoming"
      ? null
      : loadRanking(supabase, "all", { start: new Date(season.starts_at), end: new Date(season.ends_at) }),
  ]);
  const players = new Map((users ?? []).filter((u) => u.role !== "root").map((u) => [u.id as string, u]));
  const visibleUnlocks = unlocks.filter((u) => players.has(u.user_id));
  const holders = (key: string) => visibleUnlocks.filter((u) => u.achievement_key === key);
  const mine = new Set(visibleUnlocks.filter((u) => u.user_id === profile.id).map((u) => u.achievement_key));
  const progress = (myProgress?.progress ?? {}) as Record<string, number>;
  const standings = ranking ? sortRows(ranking.players.filter((p) => players.has(p.id)), "points").slice(0, 5) : [];
  const required = season.achievements.filter((a) => a.required);
  const myRequired = required.filter((a) => mine.has(a.key)).length;

  const titleBlocks = [
    {
      kind: "lenda" as const,
      icon: Sparkles,
      how: "Completar todas as conquistas da temporada (menos Campeão)",
    },
    { kind: "coroa" as const, icon: Crown, how: "Terminar em 1º lugar no ranking da temporada" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        bannerFile={{ file: season.theme.banner, credit: season.theme.banner_credit }}
        eyebrow={`Temporada ${season.number}${status === "upcoming" ? " · em breve" : ""}`}
        title={<span className={color.text}>{season.theme.name}</span>}
        description={
          <>
            {season.theme.description && <span className="block">{season.theme.description}</span>}
            <span className="mt-1 flex items-center gap-1.5">
              <CalendarRange className="size-4" /> {statusLine(season)}
            </span>
          </>
        }
      >
        {(seasons.length > 1 || !live) && (
          <SeasonChips seasons={seasons} selected={season.number} comingSoon={!live} />
        )}
      </PageHeader>

      {/* Títulos em jogo */}
      <div className="grid gap-3 sm:grid-cols-2">
        {titleBlocks.map(({ kind, icon: Icon, how }) => {
          const title = titleFor(season, kind);
          const owners = holders(kind);
          return (
            <Card key={kind} className={cn("gap-2 px-4 py-4", color.border, color.bg)}>
              <div className="flex items-center gap-2 text-xs tracking-wider text-muted-foreground uppercase">
                <Icon className="size-4" /> Título {kind === "lenda" ? "Lenda" : "Coroa"}
              </div>
              <PlayerTitle title={title} className="text-base" />
              <p className="text-xs text-muted-foreground">{how}.</p>
              <div className="text-sm">
                {owners.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {owners.map((o) => (
                      <Link key={o.user_id} href={`/players/${o.user_id}`} className="font-semibold hover:underline">
                        {players.get(o.user_id)?.name}
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {status === "closed" ? "Ninguém conquistou." : "Em disputa — sai no encerramento."}
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Classificação da temporada */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Classificação</CardTitle>
            <CardDescription>
              {ranking ? `${ranking.matches} partida(s) na temporada.` : "A temporada ainda não começou."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {standings.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma partida ainda.</p>}
            {standings.map((p, i) => (
              <Link
                key={p.id}
                href={`/players/${p.id}`}
                className="flex items-center gap-3 rounded-md px-1 py-1 text-sm transition-colors hover:bg-muted/40"
              >
                <span className={cn("w-5 text-center font-bold tabular-nums", i === 0 && "text-amber-400")}>{i + 1}</span>
                <Avatar className="size-7">
                  {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                  <AvatarFallback className="text-[10px]">{initials(p.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="font-semibold text-primary tabular-nums">{p.points} pts</span>
              </Link>
            ))}
            {ranking && (
              <Link href={`/ranking?season=${season.number}`} className="block pt-1 text-xs text-muted-foreground hover:underline">
                Ver ranking completo da temporada →
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Conquistas da temporada */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conquistas da temporada</CardTitle>
            <CardDescription>
              Valem só nesta temporada. Você tem {myRequired} de {required.length} para a Lenda.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {season.achievements.map((a) => {
              const owners = holders(a.key);
              const have = mine.has(a.key);
              const value = Math.min(progress[a.key] ?? 0, a.target);
              return (
                <div key={a.key} className={cn("flex gap-3 rounded-lg border p-3", have && color.border)}>
                  <SeasonAchievementIcon achievement={a} locked={!have} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold">{a.name}</span>
                      <span className={cn("text-[10px] font-semibold tracking-wider uppercase", RARITY_STYLE[a.rarity].text)}>
                        {RARITY_LABEL[a.rarity]}
                      </span>
                      {a.source === "tema" && (
                        <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", color.text, color.border)}>
                          tema
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.description}
                      {!a.required && " Não conta para a Lenda."}
                    </p>
                    {!have && a.target > 1 && status !== "upcoming" && (
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${(value / a.target) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {value}/{a.target}
                        </span>
                      </div>
                    )}
                    {owners.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <div className="flex -space-x-1.5">
                          {owners.slice(0, 6).map((o) => (
                            <Avatar key={o.user_id} className="size-5 ring-2 ring-card" title={players.get(o.user_id)?.name}>
                              {players.get(o.user_id)?.avatar_url && (
                                <AvatarImage src={players.get(o.user_id)!.avatar_url!} alt="" />
                              )}
                              <AvatarFallback className="text-[8px]">
                                {initials(players.get(o.user_id)?.name ?? "?")}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {owners.length} {owners.length === 1 ? "pessoa" : "pessoas"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
