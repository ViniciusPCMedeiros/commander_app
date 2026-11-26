import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarRange, Crosshair, Skull, Swords } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPips } from "@/components/color-pips";
import { CommanderArt } from "@/components/commander-art";
import { Score } from "@/components/duel-ui";
import { PlayerTitle } from "@/components/player-title";
import { SeasonAchievementIcon } from "@/components/season-badge";
import { seasonLabel, themeColor, titleFor } from "@/lib/seasons";
import { loadSeasons } from "@/lib/seasons-data";
import { TitlePicker } from "./title-picker";
import { AchievementIcon, RARITY_STYLE } from "@/components/achievement-badge";
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, loadAchievements, RARITY_LABEL } from "@/lib/achievements";
import { loadMatchChips } from "@/lib/match-chips";
import { MatchCard } from "@/components/match-card";
import { isAIConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { commanderLabel, formatDate, formatDaysAgo, formatPct, HIDDEN_PLAYER, initials } from "@/lib/format";
import { MATCH_SELECT } from "@/lib/newspaper";
import { PERMISSION_SELECT } from "@/lib/deck-permissions";
import { MilestoneItem, MilestoneList } from "@/components/milestone-item";
import { milestoneEvents } from "@/lib/milestones";
import { loadProxyCards } from "@/lib/proxies";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { duelsOf, loadRivalries, preyOf, rivalOf } from "@/lib/rivalries";
import { isRoot, ROLE_LABEL } from "@/lib/roles";
import { isKill, killPoints, selfPenalty, WIN_POINTS } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type {
  AIInsight,
  DeckPermissionWithRelations,
  DeckStats,
  MatchWithParticipants,
  PlayerMilestones,
  PlayerStats,
  UserProfile,
} from "@/lib/types";
import { InsightCard } from "./insight-card";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Jogador" };

export default async function PlayerPage(props: PageProps<"/players/[id]">) {
  const { id } = await props.params;
  const { supabase, profile } = await requireUser();

  const { data: player } = await supabase.from("users").select("*").eq("id", id).maybeSingle<UserProfile>();
  if (!player) notFound();

  const [
    { data: stats },
    { data: decks },
    participations,
    { data: insight },
    { data: permissions },
    proxies,
    { data: milestones },
    killed,
    rivalries,
    achievements,
    seasons,
    seasonUnlocks,
  ] = await Promise.all([
    supabase.from("player_stats").select("*").eq("user_id", id).single<PlayerStats>(),
    supabase
      .from("deck_stats")
      .select("*")
      .eq("owner_id", id)
      .order("total_wins", { ascending: false })
      .returns<DeckStats[]>(),
    fetchAll<{
      match_id: string;
      commander_snapshot: string;
      color_identity_snapshot: string[] | null;
      is_winner: boolean;
      elimination_reason: string | null;
      eliminated_by: string | null;
    }>((from, to) =>
      supabase
        .from("approved_participations")
        .select("match_id, commander_snapshot, color_identity_snapshot, is_winner, elimination_reason, eliminated_by")
        .eq("pilot_id", id)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("ai_insights")
      .select("*")
      .eq("user_id", id)
      .eq("insight_type", "player_profile")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AIInsight>(),
    supabase
      .from("deck_permissions")
      .select(PERMISSION_SELECT)
      .order("created_at")
      .returns<DeckPermissionWithRelations[]>(),
    loadProxyCards(supabase, id),
    supabase.from("player_milestones").select("*").eq("user_id", id).maybeSingle<PlayerMilestones>(),
    // Quem este jogador eliminou (abates)
    fetchAll<{ elimination_reason: string | null }>((from, to) =>
      supabase
        .from("approved_participations")
        .select("elimination_reason")
        .eq("eliminated_by", id)
        .eq("is_winner", false)
        .order("id")
        .range(from, to),
    ),
    loadRivalries(supabase),
    loadAchievements(supabase),
    loadSeasons(supabase),
    fetchAll<{ season_id: string; achievement_key: string; unlocked_at: string }>((from, to) =>
      supabase
        .from("season_unlocks")
        .select("season_id, achievement_key, unlocked_at")
        .eq("user_id", id)
        .order("unlocked_at")
        .order("achievement_key")
        .range(from, to),
    ),
  ]);
  // Linha do tempo em ordem cronológica (entrou → primeira partida → primeira vitória)
  const timeline = milestones ? milestoneEvents([milestones]).reverse() : [];
  const needed = proxies.filter((p) => p.needed_qty > 0);

  // Decks de outros membros liberados para este jogador (ativos)
  const allowedForPlayer = (permissions ?? []).filter((p) => p.user_id === id && p.deck?.is_active);
  // Para os decks deste jogador: quem mais pode usar
  const allowedByDeck = new Map<string, string[]>();
  for (const p of permissions ?? []) {
    allowedByDeck.set(p.deck_id, [...(allowedByDeck.get(p.deck_id) ?? []), p.user?.name ?? "?"]);
  }

  // Últimas partidas aprovadas em que jogou (filtro pela própria participação, sem lista de ids)
  const { data: matches } = await supabase
    .from("matches")
    .select(`${MATCH_SELECT}, mine:match_participants!inner ( pilot_id )`)
    .eq("status", "approved")
    .eq("mine.pilot_id", id)
    .order("played_at", { ascending: false })
    .limit(6)
    .returns<MatchWithParticipants[]>();

  // Comandantes mais pilotados
  const byCommander = new Map<string, { games: number; wins: number; colors: string[] }>();
  for (const p of participations ?? []) {
    const key = commanderLabel(p.commander_snapshot);
    const cur = byCommander.get(key) ?? { games: 0, wins: 0, colors: p.color_identity_snapshot ?? [] };
    cur.games++;
    if (p.is_winner) cur.wins++;
    byCommander.set(key, cur);
  }
  const commanders = [...byCommander.entries()].sort((a, b) => b[1].games - a[1].games);
  const s = stats!;

  // Pontuação do ranking (mesma regra de lib/scoring.ts), desde sempre
  const kills = (killed ?? []).filter((k) => isKill(k.elimination_reason));
  const killsByReason = [...Map.groupBy(kills, (k) => k.elimination_reason as string)]
    .map(([reason, list]) => ({ reason, count: list.length, points: killPoints(reason) * list.length }))
    .sort((a, b) => b.count - a.count || b.points - a.points);
  const selfDeaths = (participations ?? []).filter((p) => selfPenalty(p.elimination_reason) < 0);
  const points =
    s.total_wins * WIN_POINTS +
    killsByReason.reduce((sum, k) => sum + k.points, 0) +
    selfDeaths.reduce((sum, p) => sum + selfPenalty(p.elimination_reason), 0);

  // Mortes: partidas em que foi eliminado, por tipo, e quem mais o eliminou
  const deaths = (participations ?? []).filter((p) => !p.is_winner);
  const deathsByReason = [...Map.groupBy(deaths, (p) => p.elimination_reason ?? "Não informado")]
    .map(([reason, list]) => ({ reason, count: list.length, penalty: selfPenalty(reason) * list.length }))
    .sort((a, b) => b.count - a.count);
  const killerIds = [...new Set(deaths.map((p) => p.eliminated_by).filter(Boolean))] as string[];
  const { data: killers } = killerIds.length
    ? await supabase.from("users").select("id, name").in("id", killerIds)
    : { data: [] as { id: string; name: string }[] };
  const nemesis = [
    ...Map.groupBy(
      deaths.filter((p) => p.eliminated_by),
      (p) => p.eliminated_by as string,
    ),
  ]
    .map(([killerId, list]) => ({ killerId, count: list.length, name: killers?.find((k) => k.id === killerId)?.name }))
    .sort((a, b) => b.count - a.count)[0];

  // Confrontos diretos (quem dividiu mesa com este jogador)
  const duels = duelsOf(rivalries, id);
  const rival = rivalOf(duels);
  const prey = preyOf(duels);
  const rivalName = (otherId: string) => rivalries.players.find((p) => p.id === otherId)?.name ?? HIDDEN_PLAYER;

  // Conquistas: liberadas (mais raras primeiro, secretas no fim) e as próximas de cada família
  const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
  // Prévia do root: o próprio root vê todas as conquistas liberadas no perfil dele,
  // só para conferir o visual (o root não ganha conquistas de verdade).
  const achievementPreview = player.role === "root" && profile.id === player.id;
  const mineUnlocks = (
    achievementPreview
      ? ACHIEVEMENTS.map((def) => ({ id: def.id, playerId: id, matchId: "", at: new Date().toISOString(), def }))
      : achievements.unlocks
          .filter((u) => u.playerId === id)
          .map((u) => ({ ...u, def: ACHIEVEMENT_BY_ID.get(u.id)! }))
  ).sort(
    (a, b) =>
      Number(Boolean(a.def.secret)) - Number(Boolean(b.def.secret)) ||
      RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity] ||
      b.at.localeCompare(a.at),
  );
  const have = new Set(mineUnlocks.map((u) => u.id));
  const myProgress = achievements.progress.get(id);
  const seenFamily = new Set<string>();
  const next = ACHIEVEMENTS.filter((a) => {
    if (have.has(a.id) || a.secret) return false;
    if (!a.family) return true;
    if (seenFamily.has(a.family)) return false; // só o próximo nível
    seenFamily.add(a.family);
    return true;
  })
    .map((a) => ({ def: a, value: Math.min(myProgress?.get(a.id) ?? 0, a.target ?? 1) }))
    .sort((a, b) => (b.def.target ? b.value / b.def.target : 0) - (a.def.target ? a.value / a.def.target : 0));
  const hiddenSecrets = ACHIEVEMENTS.filter((a) => a.secret && !have.has(a.id)).length;
  const matchUnlocks = await loadMatchChips(supabase);

  // Temporadas: conquistas de cada uma e os títulos (Lenda/Coroa) que o jogador tem
  const seasonRows = [...seasons]
    .reverse()
    .map((season) => {
      const keys = new Set(seasonUnlocks.filter((u) => u.season_id === season.id).map((u) => u.achievement_key));
      return { season, keys, unlocked: season.achievements.filter((a) => keys.has(a.key)) };
    })
    .filter((r) => r.keys.size > 0);
  const ownedTitles = seasonRows.flatMap(({ season, keys }) =>
    (["lenda", "coroa"] as const).filter((k) => keys.has(k)).map((k) => titleFor(season, k)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jogador"
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar className="size-14 ring-1 ring-primary/50">
              {player.avatar_url && <AvatarImage src={player.avatar_url} alt={player.name} />}
              <AvatarFallback className="font-sans text-lg">{initials(player.name)}</AvatarFallback>
            </Avatar>
            <span className="flex flex-col gap-1">
              {player.name}
              <PlayerTitle title={player.display_title} className="font-sans text-sm" />
            </span>
            {player.role !== "member" && <Badge variant="secondary">{ROLE_LABEL[player.role]}</Badge>}
          </span>
        }
        description={`Membro desde ${formatDate(player.created_at)} (${formatDaysAgo(player.created_at)})`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          { label: "Pontos", value: points },
          { label: "Abates", value: kills.length },
          { label: "Mortes", value: deaths.length },
          { label: "Partidas", value: s.total_games },
          { label: "Vitórias", value: `${s.total_wins} · ${formatPct(s.overall_winrate)}` },
          { label: "Com decks próprios", value: `${s.own_deck_wins}/${s.own_deck_games}` },
          { label: "Com decks emprestados", value: `${s.borrowed_deck_wins}/${s.borrowed_deck_games}` },
        ].map((k) => (
          <Card key={k.label} className="gap-1 px-4 py-4">
            <CardDescription className="text-xs">{k.label}</CardDescription>
            <div className="text-xl font-bold tabular-nums">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo</CardTitle>
          <CardDescription>Marcos de {player.name} no grupo.</CardDescription>
        </CardHeader>
        <CardContent>
          <MilestoneList>
            {timeline.map((e) => (
              <MilestoneItem key={e.kind} event={e} showName={false} />
            ))}
          </MilestoneList>
          {!milestones?.first_match_id && (
            <p className="mt-4 text-sm text-muted-foreground">
              Ainda sem partidas aprovadas — a primeira vai aparecer aqui.
            </p>
          )}
          {milestones?.first_match_id && !milestones.first_win_id && (
            <p className="mt-4 text-sm text-muted-foreground">A primeira vitória ainda está por vir. 🎲</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <InsightCard
          userId={id}
          insight={insight ?? null}
          currentGames={s.total_games}
          aiEnabled={isAIConfigured()}
          canGenerate={isRoot(profile.role)}
        />

        <Card>
          <CardHeader>
            <CardTitle>Comandantes pilotados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {commanders.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma partida aprovada.</p>}
            {commanders.map(([name, c]) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <ColorPips colors={c.colors} />
                <span className="flex-1 truncate">{name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {c.wins}V / {c.games}J
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="size-5" /> Abates
            </CardTitle>
            <CardDescription>
              Quem {player.name} eliminou, por tipo. Abates mais difíceis valem mais pontos no{" "}
              <Link href="/ranking" className="underline">
                ranking
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {killsByReason.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum abate registrado ainda.</p>
            )}
            {killsByReason.map((k) => (
              <div key={k.reason} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{k.reason}</span>
                <span className="tabular-nums">{k.count}×</span>
                <span
                  className={cn(
                    "w-14 text-right tabular-nums",
                    k.points > 0 ? "font-semibold text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {k.points > 0 ? `+${k.points}` : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skull className="size-5" /> Mortes
            </CardTitle>
            <CardDescription>
              Como {player.name} morreu nas partidas que perdeu. Morrer por conta própria tira ponto; as outras mortes não.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {deaths.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma morte registrada ainda.</p>}
            {deathsByReason.map((d) => (
              <div key={d.reason} className="flex items-center gap-3 text-sm">
                <span className={cn("flex-1 truncate", d.reason === "Não informado" && "text-muted-foreground")}>
                  {d.reason}
                </span>
                <span className="tabular-nums">{d.count}×</span>
                <span
                  className={cn(
                    "w-14 text-right tabular-nums",
                    d.penalty < 0 ? "font-semibold text-rose-400" : "text-muted-foreground",
                  )}
                >
                  {d.penalty < 0 ? d.penalty : "—"}
                </span>
              </div>
            ))}
            {nemesis && (
              <p className="border-t pt-2 text-sm text-muted-foreground">
                Carrasco:{" "}
                {nemesis.name ? (
                  <Link href={`/players/${nemesis.killerId}`} className="font-semibold text-foreground hover:underline">
                    {nemesis.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground">{HIDDEN_PLAYER}</span>
                )}{" "}
                ({nemesis.count}×)
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="size-5" /> Rivalidades
            </CardTitle>
            <CardDescription>
              Confrontos diretos de {player.name}: mesas juntos, vitórias e abates de cada lado.{" "}
              <Link href="/rivalries" className="underline">
                Ver o quadro do grupo
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {duels.length === 0 && (
              <p className="text-sm text-muted-foreground">Ainda sem partidas aprovadas contra outros jogadores.</p>
            )}
            {(rival || prey) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {rival && (
                  <Link
                    href={`/rivalries/${id}/${rival.them}`}
                    className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 transition-colors hover:bg-orange-500/10"
                  >
                    <div className="text-xs tracking-wider text-orange-300 uppercase">Rival</div>
                    <div className="font-semibold">{rivalName(rival.them)}</div>
                    <div className="text-xs text-muted-foreground">
                      vitórias {rival.myWins}×{rival.theirWins} · abates {rival.iKilled}×{rival.theyKilled} ·{" "}
                      {rival.together} mesa(s)
                    </div>
                  </Link>
                )}
                {prey && (
                  <Link
                    href={`/rivalries/${id}/${prey.them}`}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 transition-colors hover:bg-emerald-500/10"
                  >
                    <div className="text-xs tracking-wider text-emerald-300 uppercase">Freguês</div>
                    <div className="font-semibold">{rivalName(prey.them)}</div>
                    <div className="text-xs text-muted-foreground">
                      eliminado(a) por {player.name} {prey.iKilled}×
                    </div>
                  </Link>
                )}
              </div>
            )}
            {duels.length > 0 && (
              <div className="divide-y rounded-md border text-sm">
                <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
                  <span className="flex-1">Oponente</span>
                  <span className="w-12 text-center">Mesas</span>
                  <span className="w-16 text-center">Vitórias</span>
                  <span className="w-16 text-center">Abates</span>
                </div>
                {duels.map((d) => (
                  <Link
                    key={d.them}
                    href={`/rivalries/${id}/${d.them}`}
                    className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex-1 truncate font-medium">{rivalName(d.them)}</span>
                    <span className="w-12 text-center tabular-nums">{d.together}</span>
                    <Score mine={d.myWins} theirs={d.theirWins} className="w-16 justify-center" />
                    <Score mine={d.iKilled} theirs={d.theyKilled} className="w-16 justify-center" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-5" /> Conquistas
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                {mineUnlocks.length} de {ACHIEVEMENTS.length}
              </span>
            </CardTitle>
            <CardDescription>
              {achievementPreview && (
                <span className="mb-1 block text-violet-300">
                  Prévia do root: todas aparecem liberadas só aqui, para conferir o visual. Ninguém mais vê.
                </span>
              )}
              Selos liberados pelas partidas aprovadas.{" "}
              <Link href="/achievements" className="underline">
                Ver todas as conquistas
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {mineUnlocks.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conquista ainda — a primeira está a uma partida.</p>
            )}
            {mineUnlocks.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mineUnlocks.map((u) => (
                  <div key={u.id} className="flex items-center gap-3" title={u.def.description}>
                    <AchievementIcon achievement={u.def} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{u.def.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className={u.def.secret ? "text-violet-300" : RARITY_STYLE[u.def.rarity].text}>
                          {u.def.secret ? "Secreta" : RARITY_LABEL[u.def.rarity]}
                        </span>
                        {!achievementPreview && ` · ${formatDate(u.at)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {next.length > 0 && (
              <details className="group rounded-md border px-3 py-2">
                <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
                  Próximas conquistas ({next.length}
                  {hiddenSecrets > 0 && ` + ${hiddenSecrets} secreta${hiddenSecrets === 1 ? "" : "s"}`})
                  <span className="ml-2 text-xs group-open:hidden">ver</span>
                </summary>
                <div className="grid gap-x-6 gap-y-3 pt-3 pb-1 sm:grid-cols-2">
                  {next.map(({ def, value }) => (
                    <div key={def.id} className="flex items-center gap-3">
                      <AchievementIcon achievement={def} locked className="size-8" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{def.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{def.description}</div>
                        {def.target && def.target > 1 && (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/70"
                                style={{ width: `${(value / def.target) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {value}/{def.target}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        {seasonRows.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="size-5" /> Temporadas
              </CardTitle>
              <CardDescription>
                Conquistas e títulos de cada temporada.{" "}
                <Link href="/seasons" className="underline">
                  Ver a temporada
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {ownedTitles.length > 0 && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="text-sm font-semibold">Títulos</div>
                  {profile.id === id ? (
                    <TitlePicker titles={ownedTitles} current={player.display_title?.key ?? null} />
                  ) : (
                    ownedTitles.map((t) => <PlayerTitle key={t.key} title={t} className="flex text-sm" />)
                  )}
                </div>
              )}
              {seasonRows.map(({ season, unlocked }) => (
                <div key={season.id} className="space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/seasons?t=${season.number}`}
                      className={cn("font-semibold hover:underline", themeColor(season.theme.color).text)}
                    >
                      {seasonLabel(season)}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {unlocked.length} de {season.achievements.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unlocked.map((a) => (
                      <span
                        key={a.key}
                        title={a.description}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background/40 py-0.5 pr-2.5 pl-0.5 text-xs"
                      >
                        <SeasonAchievementIcon achievement={a} className="size-6 ring-1" />
                        {a.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Decks liberados para {player.name}</h2>
        {allowedForPlayer.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum deck de outro membro liberado.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allowedForPlayer.map((p) => (
            <Link
              key={p.deck_id}
              href={`/decks/${p.deck_id}`}
              className="flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 transition-colors hover:bg-sky-500/10"
            >
              <CommanderArt
                image={p.deck?.commander_image_url}
                partnerImage={p.deck?.partner_image_url}
                alt={p.deck?.commander_name ?? ""}
                className="h-12 w-16 shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.deck?.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  de {p.deck?.owner?.name} · {commanderLabel(p.deck?.commander_name ?? "", p.deck?.partner_name)}
                </div>
              </div>
              <ColorPips colors={p.deck?.color_identity} className="hidden sm:inline-flex" />
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Decks de {player.name}</h2>
        {(decks ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum deck cadastrado.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(decks ?? []).map((d) => (
            <Link
              key={d.deck_id}
              href={`/decks/${d.deck_id}`}
              className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/40"
            >
              <CommanderArt
                image={d.commander_image_url}
                partnerImage={d.partner_image_url}
                alt={d.commander_name}
                className="h-12 w-16 shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.deck_name}</div>
                <div className="text-xs text-muted-foreground">
                  {d.total_wins}/{d.total_games} · {formatPct(d.overall_winrate)}
                  {d.borrowed_games > 0 && ` · emprestado ${d.borrowed_games}x`}
                </div>
              </div>
              {allowedByDeck.has(d.deck_id) && (
                <Badge
                  variant="outline"
                  className="border-sky-500/40 text-sky-300"
                  title={allowedByDeck.get(d.deck_id)!.join(", ")}
                >
                  +{allowedByDeck.get(d.deck_id)!.length} podem usar
                </Badge>
              )}
              {!d.is_active && <Badge variant="outline">Inativo</Badge>}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Cartas que {player.name} precisa</h2>
          {proxies.length > 0 && (
            <Link href={`/collection?user=${id}&tab=needed`} className="text-sm text-muted-foreground hover:underline">
              Ver na coleção
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Cartas usadas como proxy nos decks sem cópia original livre na coleção.
        </p>
        {needed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma — todos os decks estão com cartas originais.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {needed.map((p) => (
              <li
                key={p.card_name}
                className="flex items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-2"
              >
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="h-14 w-10 shrink-0 rounded object-cover" loading="lazy" />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">
                    {p.needed_qty > 1 && `${p.needed_qty}× `}
                    {p.card_name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">proxy em {p.proxy_in_decks.join(", ")}</div>
                  {p.trade_offers && p.trade_offers.length > 0 && (
                    <div className="truncate text-xs text-emerald-300">
                      Para troca com {p.trade_offers.map((o) => o.name).join(", ")}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Partidas recentes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(matches ?? []).map((m) => (
            <MatchCard key={m.id} match={m} achievements={matchUnlocks.get(m.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
