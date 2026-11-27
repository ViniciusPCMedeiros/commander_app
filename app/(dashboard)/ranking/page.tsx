import type { Metadata } from "next";
import Link from "next/link";
import { Award, Crosshair, Flame, Info, TrendingUp, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPips } from "@/components/color-pips";
import { CommanderArt } from "@/components/commander-art";
import { RankMovement, RankPosition } from "@/components/rank-badges";
import { PlayerLevel } from "@/components/player-level";
import { PlayerTitle } from "@/components/player-title";
import { requireUser } from "@/lib/auth";
import { rankingSeason, seasonLabel, seasonStatus } from "@/lib/seasons";
import { loadSeasons } from "@/lib/seasons-data";
import { formatDate, formatDay, formatPct, initials } from "@/lib/format";
import {
  loadRanking,
  MIN_GAMES_FOR_WINRATE,
  movements,
  PERIOD_LABEL,
  SORT_LABEL,
  sortRows,
  type Period,
  type SortKey,
} from "@/lib/ranking";
import { SCORING_RULES } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { RaceBoard } from "./race-board";

export const metadata: Metadata = { title: "Ranking" };

const PERIODS = Object.keys(PERIOD_LABEL) as Period[];
const SORTS = Object.keys(SORT_LABEL) as SortKey[];
const TABS = ["players", "decks", "commanders", "colors"] as const;
type Tab = (typeof TABS)[number];

const COLOR_BAR: Record<string, string> = {
  W: "bg-amber-100",
  U: "bg-sky-500",
  B: "bg-zinc-500",
  R: "bg-red-500",
  G: "bg-emerald-500",
  C: "bg-stone-400",
};

/** Win% com aviso quando há poucas partidas para a ordenação por Win%. */
function WinRate({ value, games, sort }: { value: number; games: number; sort: SortKey }) {
  const few = sort === "winrate" && games < MIN_GAMES_FOR_WINRATE;
  return (
    <span
      className={cn("tabular-nums", few && "text-muted-foreground")}
      title={few ? `Menos de ${MIN_GAMES_FOR_WINRATE} partidas` : undefined}
    >
      {formatPct(value)}
      {few && "*"}
    </span>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export default async function RankingPage(props: PageProps<"/ranking">) {
  const sp = await props.searchParams;
  const period: Period = PERIODS.includes(sp.period as Period) ? (sp.period as Period) : "all";
  const sort: SortKey = SORTS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "points";
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "players";

  const { supabase } = await requireUser();
  // ?season=N: ranking só com as partidas daquela temporada. Sem filtro na URL, abre na
  // temporada (a pontuação recomeça a cada uma); "Desde sempre" continua nos filtros.
  const seasons = await loadSeasons(supabase);
  const season =
    sp.season === undefined && sp.period === undefined
      ? rankingSeason(seasons)
      : (seasons.find((x) => x.number === Number(sp.season)) ?? null);
  const data = await loadRanking(
    supabase,
    period,
    season ? { start: new Date(season.starts_at), end: new Date(season.ends_at) } : undefined,
  );
  const players = sortRows(data.players, sort);
  const decks = sortRows(data.decks, sort);
  const commanders = sortRows(data.commanders, sort);
  const colors = sortRows(data.colors, sort === "games" ? "games" : "winrate");

  // Subiu/caiu: mesma ordenação aplicada ao ranking de antes da última sessão
  const playerMoves = movements(players, sortRows(data.previous.players, sort), (r) => r.id);
  const deckMoves = movements(decks, sortRows(data.previous.decks, sort), (r) => r.id);
  const commanderMoves = movements(commanders, sortRows(data.previous.commanders, sort), (r) => r.name);

  const href = (patch: Partial<{ period: Period; sort: SortKey; tab: Tab; season: number | null }>) => {
    const target = patch.season === undefined ? season?.number : patch.season;
    const q = new URLSearchParams({ period, sort, tab, ...patch, season: "" });
    if (target) q.set("season", String(target));
    else q.delete("season");
    return `/ranking?${q.toString()}`;
  };

  const podium = players.slice(0, 3);
  const hottest = [...data.players].sort((a, b) => b.currentStreak - a.currentStreak)[0];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <PageHeader
          banner="ranking"
          eyebrow="Classificação"
          title="Ranking"
          description={`${data.matches} partida(s) aprovada(s) · ${
            season
              ? `temporada ${seasonLabel(season)} (${formatDate(season.starts_at)} a ${formatDate(season.ends_at)})${
                  { active: "", upcoming: "", ended: " · encerrando", closed: " · resultado final" }[seasonStatus(season)]
                }`
              : PERIOD_LABEL[period].toLowerCase()
          }`}
          actions={
            <div className="flex flex-wrap gap-2">
              {[
                { href: "/rivalries", label: "Rivalidades", icon: Crosshair },
                { href: "/achievements", label: "Conquistas", icon: Award },
                { href: "/levels", label: "Níveis", icon: TrendingUp },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/40 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/10"
                >
                  <Icon className="size-4" /> {label}
                </Link>
              ))}
            </div>
          }
        />
        {data.lastSession && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Setas comparam com o ranking de antes da última sessão ({formatDay(data.lastSession)},{" "}
              {data.lastSessionMatches} partida(s)):
            </span>
            <span className="inline-flex items-center gap-1">
              <RankMovement delta={1} /> subiu
            </span>
            <span className="inline-flex items-center gap-1">
              <RankMovement delta={-1} /> caiu
            </span>
            <span className="inline-flex items-center gap-1">
              <RankMovement delta={0} /> manteve
            </span>
            <span className="inline-flex items-center gap-1">
              <RankMovement delta={null} /> estreou
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <Chip key={p} href={href({ period: p, season: null })} active={!season && p === period}>
                {PERIOD_LABEL[p]}
              </Chip>
            ))}
          </div>
          {seasons.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Temporadas</span>
              {[...seasons].reverse().map((x) => (
                <Chip key={x.number} href={href({ season: x.number })} active={season?.number === x.number}>
                  {seasonLabel(x)}
                  {seasonStatus(x) === "active" && " •"}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Ordenar por</span>
            {SORTS.map((s) => (
              <Chip key={s} href={href({ sort: s })} active={s === sort}>
                {SORT_LABEL[s]}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <details className="group rounded-lg border bg-card/60 px-4 py-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground">
          <Info className="size-4" /> Como funciona a pontuação
          <span className="ml-auto text-xs group-open:hidden">ver</span>
        </summary>
        <div className="grid gap-x-8 gap-y-1 pt-3 pb-1 sm:grid-cols-2">
          {SCORING_RULES.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 border-b border-border/40 py-1">
              <span>
                {r.label} <span className="text-xs text-muted-foreground">({r.who})</span>
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  r.points > 0 ? "font-semibold text-emerald-400" : r.points < 0 ? "font-semibold text-rose-400" : "text-muted-foreground",
                )}
              >
                {r.points > 0 ? `+${r.points}` : r.points < 0 ? r.points : "0 (conta como abate)"}
              </span>
            </div>
          ))}
        </div>
        <p className="pt-2 pb-1 text-xs text-muted-foreground">
          ⚔ abates · ☠ mortes (partidas em que foi eliminado). Abate é de quem foi marcado em “eliminado por”. Conceder ou “Outro” não tira pontos. Empate em pontos: mais
          vitórias, depois mais abates.
        </p>
      </details>

      {data.matches === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma partida aprovada nesse período.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pódio */}
          <div className="grid grid-cols-3 items-end gap-3">
            {[1, 0, 2].map((idx) => {
              const p = podium[idx];
              if (!p) return <div key={idx} />;
              return (
                <Link key={p.id} href={`/players/${p.id}`} className="group">
                  <Card
                    className={cn(
                      "items-center gap-2 px-2 text-center transition-colors group-hover:border-foreground/30",
                      idx === 0 ? "border-amber-500/50 bg-amber-500/5 py-6" : "py-4",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <RankPosition position={idx + 1} className="text-3xl" />
                      <RankMovement delta={playerMoves.get(p.id)?.delta} />
                    </div>
                    <Avatar className={idx === 0 ? "size-14" : "size-11"}>
                      {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                      <AvatarFallback>{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex max-w-full items-center gap-1.5">
                      <span className="truncate font-semibold">{p.name}</span>
                      <PlayerLevel id={p.id} />
                    </div>
                    <PlayerTitle title={p.title} className="max-w-full" />
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {sort === "points" && <span className="font-semibold text-foreground">{p.points} pts · </span>}
                      {p.wins}V / {p.games}J · {formatPct(p.winrate)}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {hottest && hottest.currentStreak >= 2 && (
            <p className="flex items-center gap-2 text-sm">
              <Flame className="size-4 text-orange-400" />
              <span>
                <Link href={`/players/${hottest.id}`} className="font-semibold hover:underline">
                  {hottest.name}
                </Link>{" "}
                está em sequência de {hottest.currentStreak} vitórias!
              </span>
            </p>
          )}

          <Tabs defaultValue={tab}>
            <TabsList className="max-w-full overflow-x-auto">
              <TabsTrigger value="players">Jogadores</TabsTrigger>
              <TabsTrigger value="decks">Decks</TabsTrigger>
              <TabsTrigger value="commanders">Comandantes</TabsTrigger>
              <TabsTrigger value="colors">Cores</TabsTrigger>
            </TabsList>

            <TabsContent value="players" className="mt-4">
              <RaceBoard
                key={`${period}-${sort}`}
                metric={sort === "points" ? "points" : "wins"}
                rows={players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  avatar_url: p.avatar_url,
                  wins: p.wins,
                  games: p.games,
                  points: p.points,
                  kills: p.kills,
                  deaths: p.deaths,
                  winrate: p.winrate,
                  currentStreak: p.currentStreak,
                  title: p.title,
                  ownWins: p.ownWins,
                  ownGames: p.ownGames,
                  borrowedWins: p.borrowedWins,
                  borrowedGames: p.borrowedGames,
                  delta: playerMoves.get(p.id)?.delta ?? null,
                  prevIndex: playerMoves.get(p.id)?.prevIndex ?? null,
                  fewGames: sort === "winrate" && p.games < MIN_GAMES_FOR_WINRATE,
                }))}
              />
            </TabsContent>

            <TabsContent value="decks" className="mt-4">
              <Card className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">#</TableHead>
                      <TableHead>Deck</TableHead>
                      <TableHead className="text-right">V</TableHead>
                      <TableHead className="text-right">J</TableHead>
                      <TableHead className="text-right">Win%</TableHead>
                      <TableHead className="text-right">Pts</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Abates</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Pilotos</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Emprestado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decks.map((d, i) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <RankPosition position={i + 1} className="text-lg" />
                            <RankMovement delta={deckMoves.get(d.id)?.delta} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/decks/${d.id}`} className="flex items-center gap-3 hover:underline">
                            <CommanderArt
                              image={d.image}
                              partnerImage={d.partnerImage}
                              alt={d.commander}
                              className="h-9 w-12 shrink-0 rounded"
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{d.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {d.commander} · {d.ownerName}
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{d.wins}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.games}</TableCell>
                        <TableCell className="text-right">
                          <WinRate value={d.winrate} games={d.games} sort={sort} />
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", sort === "points" && "font-semibold")}>
                          {d.points}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{d.kills}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{d.pilots}</TableCell>
                        <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                          {d.borrowedGames}x
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="commanders" className="mt-4">
              <Card className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">#</TableHead>
                      <TableHead>Comandante</TableHead>
                      <TableHead className="text-right">V</TableHead>
                      <TableHead className="text-right">J</TableHead>
                      <TableHead className="text-right">Win%</TableHead>
                      <TableHead className="text-right">Pts</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Abates</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Decks</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Pilotos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commanders.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <RankPosition position={i + 1} className="text-lg" />
                            <RankMovement delta={commanderMoves.get(c.name)?.delta} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ColorPips colors={c.colors} className="hidden shrink-0 sm:inline-flex" />
                            <span className="truncate font-medium">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{c.wins}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.games}</TableCell>
                        <TableCell className="text-right">
                          <WinRate value={c.winrate} games={c.games} sort={sort} />
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", sort === "points" && "font-semibold")}>
                          {c.points}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{c.kills}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.decks}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.pilots}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="colors" className="mt-4">
              <Card>
                <CardContent className="space-y-3">
                  <CardDescription>
                    Cada partida conta para todas as cores da identidade do deck. Ordenado por{" "}
                    {sort === "games" ? "partidas" : "Win%"}.
                  </CardDescription>
                  {colors.map((c) => (
                    <div key={c.color} className="flex items-center gap-3 text-sm">
                      <ColorPips colors={[c.color]} />
                      <span className="w-20 shrink-0">{c.name}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", COLOR_BAR[c.color])}
                          style={{ width: `${c.winrate}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right font-semibold tabular-nums">
                        {formatPct(c.winrate)}
                      </span>
                      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:inline">
                        {c.wins}V / {c.games}J
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {sort === "winrate" && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Trophy className="size-3.5" /> * Menos de {MIN_GAMES_FOR_WINRATE} partidas no período: vai para o fim da
              lista na ordenação por Win%.
            </p>
          )}
        </>
      )}
    </div>
  );
}
