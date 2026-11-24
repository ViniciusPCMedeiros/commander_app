import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPips } from "@/components/color-pips";
import { CommanderArt } from "@/components/commander-art";
import { MatchCard } from "@/components/match-card";
import { isAIConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { commanderLabel, formatDate, formatDaysAgo, formatPct, initials } from "@/lib/format";
import { MATCH_SELECT } from "@/lib/newspaper";
import { PERMISSION_SELECT } from "@/lib/deck-permissions";
import { MilestoneItem, MilestoneList } from "@/components/milestone-item";
import { milestoneEvents } from "@/lib/milestones";
import { loadProxyCards } from "@/lib/proxies";
import { ROLE_LABEL } from "@/lib/roles";
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
  const { supabase } = await requireUser();

  const { data: player } = await supabase.from("users").select("*").eq("id", id).maybeSingle<UserProfile>();
  if (!player) notFound();

  const [{ data: stats }, { data: decks }, { data: participations }, { data: insight }, { data: permissions }, proxies, { data: milestones }] = await Promise.all([
    supabase.from("player_stats").select("*").eq("user_id", id).single<PlayerStats>(),
    supabase.from("deck_stats").select("*").eq("owner_id", id).order("total_wins", { ascending: false }).returns<DeckStats[]>(),
    supabase.from("approved_participations").select("match_id, commander_snapshot, color_identity_snapshot, is_winner").eq("pilot_id", id),
    supabase
      .from("ai_insights")
      .select("*")
      .eq("user_id", id)
      .eq("insight_type", "player_profile")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AIInsight>(),
    supabase.from("deck_permissions").select(PERMISSION_SELECT).order("created_at").returns<DeckPermissionWithRelations[]>(),
    loadProxyCards(supabase, id),
    supabase.from("player_milestones").select("*").eq("user_id", id).maybeSingle<PlayerMilestones>(),
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

  const { data: matches } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .in("id", (participations ?? []).map((p) => p.match_id))
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
            {player.name}
            {player.role !== "member" && <Badge variant="secondary">{ROLE_LABEL[player.role]}</Badge>}
          </span>
        }
        description={`Membro desde ${formatDate(player.created_at)} (${formatDaysAgo(player.created_at)})`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
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
            <p className="mt-4 text-sm text-muted-foreground">Ainda sem partidas aprovadas — a primeira vai aparecer aqui.</p>
          )}
          {milestones?.first_match_id && !milestones.first_win_id && (
            <p className="mt-4 text-sm text-muted-foreground">A primeira vitória ainda está por vir. 🎲</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <InsightCard userId={id} insight={insight ?? null} currentGames={s.total_games} aiEnabled={isAIConfigured()} />

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
              <CommanderArt image={d.commander_image_url} partnerImage={d.partner_image_url} alt={d.commander_name} className="h-12 w-16 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.deck_name}</div>
                <div className="text-xs text-muted-foreground">
                  {d.total_wins}/{d.total_games} · {formatPct(d.overall_winrate)}
                  {d.borrowed_games > 0 && ` · emprestado ${d.borrowed_games}x`}
                </div>
              </div>
              {allowedByDeck.has(d.deck_id) && (
                <Badge variant="outline" className="border-sky-500/40 text-sky-300" title={allowedByDeck.get(d.deck_id)!.join(", ")}>
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
        <p className="text-xs text-muted-foreground">Cartas usadas como proxy nos decks sem cópia original livre na coleção.</p>
        {needed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma — todos os decks estão com cartas originais.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {needed.map((p) => (
              <li key={p.card_name} className="flex items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-2">
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
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
