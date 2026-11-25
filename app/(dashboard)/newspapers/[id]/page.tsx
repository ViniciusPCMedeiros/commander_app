import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Crown, Medal, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MatchCard } from "@/components/match-card";
import { loadAchievements, unlocksByMatch } from "@/lib/achievements";
import { Markdown } from "@/components/markdown";
import { WhatsAppShareButton } from "@/components/whatsapp-share-button";
import { requireUser } from "@/lib/auth";
import { commanderLabel, formatDateTime, formatDay, HIDDEN_PLAYER } from "@/lib/format";
import { MATCH_SELECT } from "@/lib/newspaper";
import { PageHeader } from "@/components/page-header";
import type { MatchWithParticipants, WeeklyNewspaper } from "@/lib/types";

export const metadata: Metadata = { title: "Jornal" };

function tally(items: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const k of items) if (k) map.set(k, (map.get(k) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default async function NewspaperPage(props: PageProps<"/newspapers/[id]">) {
  const { id } = await props.params;
  const { supabase } = await requireUser();
  // Conquistas liberadas em cada partida (selinhos no card)
  const achievementsLoad = loadAchievements(supabase);

  const { data: paper } = await supabase.from("weekly_newspapers").select("*").eq("id", id).maybeSingle<WeeklyNewspaper>();
  if (!paper) notFound();

  // Semana da edição: do início de week_start até o fim de week_end (UTC, como gravado)
  const from = `${paper.week_start}T00:00:00Z`;
  const until = new Date(new Date(`${paper.week_end}T00:00:00Z`).getTime() + 86_400_000).toISOString();

  const [{ data: author }, { data: prev }, { data: next }, { data: matches }] = await Promise.all([
    paper.generated_by
      ? supabase.from("users").select("id, name").eq("id", paper.generated_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("weekly_newspapers")
      .select("id, edition_number, headline")
      .lt("edition_number", paper.edition_number)
      .order("edition_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_newspapers")
      .select("id, edition_number, headline")
      .gt("edition_number", paper.edition_number)
      .order("edition_number", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("status", "approved")
      .gte("played_at", from)
      .lt("played_at", until)
      .order("played_at", { ascending: false })
      .returns<MatchWithParticipants[]>(),
  ]);

  const parts = (matches ?? []).flatMap((m) => m.match_participants);
  const wins = tally(parts.filter((p) => p.is_winner).map((p) => p.pilot?.name ?? HIDDEN_PLAYER));
  const games = new Map(tally(parts.map((p) => p.pilot?.name ?? HIDDEN_PLAYER)));
  const commanders = tally(parts.filter((p) => p.is_winner).map((p) => commanderLabel(p.commander_snapshot)));
  const borrowed = parts.filter((p) => p.pilot_id !== p.deck_owner_id);
  const scoreboard = [...games.keys()]
    .map((name) => ({ name, wins: wins.find(([n]) => n === name)?.[1] ?? 0, games: games.get(name)! }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));

  const matchUnlocks = unlocksByMatch(await achievementsLoad);
  return (
    <div className="space-y-6">
      <PageHeader
        banner="jornais"
        eyebrow="Gazeta do Mesão"
        title={`Edição #${paper.edition_number}`}
        description={`Semana de ${formatDay(paper.week_start)} a ${formatDay(paper.week_end)}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/newspapers">
            <ArrowLeft /> Todas as edições
          </Link>
        </Button>
        <div className="flex gap-2">
          {prev ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/newspapers/${prev.id}`} title={prev.headline}>
                <ChevronLeft /> #{prev.edition_number}
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft /> Anterior
            </Button>
          )}
          {next ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/newspapers/${next.id}`} title={next.headline}>
                #{next.edition_number} <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Próxima <ChevronRight />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-amber-500/20 lg:col-span-2">
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="font-display text-sm font-semibold tracking-[0.35em] text-primary uppercase">Gazeta do Mesão</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Edição #{paper.edition_number} · Semana de {formatDay(paper.week_start)} a {formatDay(paper.week_end)}
              </div>
            </div>
            <Separator />
            <h1 className="font-serif text-3xl leading-tight font-bold sm:text-4xl">{paper.headline}</h1>
            <Markdown>{paper.content}</Markdown>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span>Publicado em {formatDateTime(paper.created_at)}</span>
                {author && (
                  <span>
                    por{" "}
                    <Link href={`/players/${author.id}`} className="underline">
                      {author.name}
                    </Link>
                  </span>
                )}
                {paper.source && (
                  <Badge variant="outline" className="text-[10px]">
                    {paper.source === "ai" ? "Escrito pelo Gemini" : "Gerador local"}
                  </Badge>
                )}
              </div>
              <WhatsAppShareButton headline={paper.headline} content={paper.content} edition={paper.edition_number} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Medal className="size-5 text-amber-400" /> Placar da semana
              </CardTitle>
              <CardDescription>
                {matches?.length ?? 0} partida(s) aprovada(s) entre {formatDay(paper.week_start)} e {formatDay(paper.week_end)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {scoreboard.length === 0 && <p className="text-muted-foreground">Sem partidas nessa semana.</p>}
              {scoreboard.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="w-6 text-center">{i === 0 && s.wins > 0 ? "🏆" : ""}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-semibold tabular-nums">{s.wins}V</span>
                  <span className="w-8 text-right text-muted-foreground tabular-nums">{s.games}J</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {commanders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="size-5" /> Comandantes vencedores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {commanders.map(([name, n]) => (
                  <div key={name} className="flex justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <span className="text-muted-foreground tabular-nums">{n}×</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {borrowed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="size-5" /> Decks emprestados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {borrowed.map((p) => (
                  <div key={p.id}>
                    <span className="font-medium">{p.pilot?.name ?? HIDDEN_PLAYER}</span> pilotou {commanderLabel(p.commander_snapshot)} de{" "}
                    {p.owner?.name ?? HIDDEN_PLAYER}
                    {p.is_winner && <span className="text-amber-300"> e venceu!</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Partidas da semana</h2>
        {(matches ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma partida aprovada nesse período.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {(matches ?? []).map((m) => (
            <MatchCard key={m.id} match={m} achievements={matchUnlocks.get(m.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
