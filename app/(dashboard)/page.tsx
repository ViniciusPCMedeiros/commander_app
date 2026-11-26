import Link from "next/link";
import { Crown, Hourglass, Medal, Swords, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColorPips } from "@/components/color-pips";
import { CommanderArt } from "@/components/commander-art";
import { MatchCard } from "@/components/match-card";
import { loadMatchChips } from "@/lib/match-chips";
import { WeeklyContracts } from "@/components/weekly-contracts";
import { seasonLabel } from "@/lib/seasons";
import { loadOpenContracts } from "@/lib/seasons-data";
import { isAIConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { commanderLabel, formatPct, initials } from "@/lib/format";
import { MATCH_SELECT } from "@/lib/newspaper";
import type { DeckStats, MatchWithParticipants, PlayerStats, WeeklyNewspaper } from "@/lib/types";
import { NewspaperCard } from "./newspaper-card";
import { RankPosition } from "@/components/rank-badges";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  const { supabase, profile } = await requireUser();
  // Conquistas liberadas em cada partida (selinhos no card)
  const achievementsLoad = loadMatchChips(supabase);
  const contractsLoad = loadOpenContracts(supabase);

  const [players, decks, approvedCount, pendingCount, activeDecks, newspaper, recent] = await Promise.all([
    supabase.from("player_stats").select("*").returns<PlayerStats[]>(),
    supabase
      .from("deck_stats")
      .select("*")
      .gt("total_games", 0)
      .order("total_wins", { ascending: false })
      .order("overall_winrate", { ascending: false })
      .limit(5)
      .returns<DeckStats[]>(),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("decks").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("weekly_newspapers")
      .select("*")
      .order("edition_number", { ascending: false })
      .limit(1)
      .maybeSingle<WeeklyNewspaper>(),
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("status", "approved")
      .order("played_at", { ascending: false })
      .limit(3)
      .returns<MatchWithParticipants[]>(),
  ]);

  const ranking = [...(players.data ?? [])].sort(
    (a, b) =>
      b.total_wins - a.total_wins || Number(b.overall_winrate) - Number(a.overall_winrate) || b.total_games - a.total_games,
  );

  const kpis = [
    { label: "Partidas validadas", value: approvedCount.count ?? 0, icon: Swords },
    { label: "Jogadores", value: ranking.length, icon: Users },
    { label: "Decks ativos", value: activeDecks.count ?? 0, icon: Crown },
    { label: "Aguardando moderação", value: pendingCount.count ?? 0, icon: Hourglass, href: "/matches?tab=queue" },
  ];

  const [matchUnlocks, openContracts] = await Promise.all([achievementsLoad, contractsLoad]);
  return (
    <div className="space-y-6">
      <PageHeader
        banner="painel"
        eyebrow="Painel do playgroup"
        title={`Olá, ${profile.name.split(" ")[0]}`}
        description="Resumo do grupo, quem está na frente e o jornal da semana."
        actions={
          <Button asChild>
            <Link href="/matches/new">
              <Swords /> Registrar partida
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, href }) => {
          const body = (
            <Card className="gap-1 py-4 transition-colors hover:bg-muted/40">
              <CardHeader className="flex flex-row items-center justify-between px-4">
                <CardDescription className="text-xs">{label}</CardDescription>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 text-3xl font-bold tabular-nums">{value}</CardContent>
            </Card>
          );
          return href ? (
            <Link key={label} href={href}>
              {body}
            </Link>
          ) : (
            <div key={label}>{body}</div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Medal className="size-5 text-primary" /> Ranking de jogadores
              </CardTitle>
              <CardDescription className="flex items-center justify-between gap-2">
                Somente partidas aprovadas.
                <Link href="/ranking" className="text-foreground hover:underline">
                  Ver ranking completo →
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Jogador</TableHead>
                    <TableHead className="text-right">V</TableHead>
                    <TableHead className="text-right">J</TableHead>
                    <TableHead className="text-right">Win%</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Emprestado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((p, i) => (
                    <TableRow key={p.user_id}>
                      <TableCell>
                        <RankPosition position={i + 1} className="text-lg" />
                      </TableCell>
                      <TableCell>
                        <Link href={`/players/${p.user_id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar className="size-6">
                            {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                            <AvatarFallback className="text-[10px]">{initials(p.player_name)}</AvatarFallback>
                          </Avatar>
                          {p.player_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{p.total_wins}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.total_games}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPct(p.overall_winrate)}</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                        {p.borrowed_deck_wins}/{p.borrowed_deck_games}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="size-5" /> Decks mais vitoriosos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(decks.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma partida aprovada ainda.</p>
              )}
              {(decks.data ?? []).map((d) => (
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
                    <div className="truncate text-xs text-muted-foreground">
                      {commanderLabel(d.commander_name, d.partner_name)} · {d.owner_name}
                    </div>
                  </div>
                  <ColorPips colors={d.color_identity} className="hidden sm:inline-flex" />
                  <div className="text-right text-sm">
                    <div className="font-semibold tabular-nums">
                      {d.total_wins}/{d.total_games}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatPct(d.overall_winrate)}</div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          {openContracts.season && (
            <WeeklyContracts
              contracts={openContracts.contracts}
              seasonLabel={`temporada ${seasonLabel(openContracts.season)}`}
              viewerId={profile.id}
            />
          )}
          <NewspaperCard newspaper={newspaper.data ?? null} aiEnabled={isAIConfigured()} />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Últimas partidas</h2>
              <Link href="/matches" className="text-sm text-muted-foreground hover:underline">
                Ver todas
              </Link>
            </div>
            {(recent.data ?? []).map((m) => (
              <MatchCard key={m.id} match={m} achievements={matchUnlocks.get(m.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
