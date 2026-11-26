import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Skull, Swords } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchCard } from "@/components/match-card";
import { loadMatchChips } from "@/lib/match-chips";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MATCH_SELECT } from "@/lib/newspaper";
import { duelBetween, duelsOf, killsBetween, loadRivalries, sharedMatchIds } from "@/lib/rivalries";
import type { MatchWithParticipants } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlayerAvatar, SplitBar } from "@/components/duel-ui";

export const metadata: Metadata = { title: "Confronto direto" };

/** Quantas partidas juntos mostrar no fim da página. */
const MATCHES_SHOWN = 12;

export default async function DuelPage(props: PageProps<"/rivalries/[a]/[b]">) {
  const { a, b } = await props.params;
  if (a === b) notFound();

  const { supabase } = await requireUser();
  // Conquistas liberadas em cada partida (selinhos no card)
  const achievementsLoad = loadMatchChips(supabase);
  const r = await loadRivalries(supabase);
  const pa = r.players.find((p) => p.id === a);
  const pb = r.players.find((p) => p.id === b);
  if (!pa || !pb) notFound();

  const d = duelBetween(r, a, b);
  const kills = killsBetween(r, a, b);
  const ids = sharedMatchIds(r, a, b);
  const { data: matches } = ids.length
    ? await supabase
        .from("matches")
        .select(MATCH_SELECT)
        .in("id", ids.slice(0, MATCHES_SHOWN))
        .order("played_at", { ascending: false })
        .returns<MatchWithParticipants[]>()
    : { data: [] as MatchWithParticipants[] };

  // Outros oponentes de A, para trocar o confronto sem voltar ao quadro
  const others = duelsOf(r, a).filter((x) => x.them !== b);
  const nameOf = (id: string) => r.players.find((p) => p.id === id)?.name ?? "?";

  const rows = d
    ? [
        { label: "Vitórias", left: d.myWins, right: d.theirWins },
        { label: "Abates", left: d.iKilled, right: d.theyKilled },
      ]
    : [];

  const matchUnlocks = await achievementsLoad;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Confronto direto"
        title={
          <span className="flex flex-wrap items-center gap-3">
            <PlayerAvatar player={pa} className="size-12" />
            <span>{pa.name}</span>
            <span className="text-base font-bold tracking-widest text-primary">VS</span>
            <span>{pb.name}</span>
            <PlayerAvatar player={pb} className="size-12" />
          </span>
        }
        description={
          d
            ? `${d.together} mesa(s) juntos · a última em ${formatDate(d.lastPlayed)}`
            : "Os dois ainda não dividiram mesa em uma partida aprovada."
        }
        actions={
          <Link
            href={`/rivalries/${b}/${a}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftRight className="size-4" /> Inverter lados
          </Link>
        }
      />

      {d && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Placar</CardTitle>
              <CardDescription>Só as partidas em que os dois estavam na mesa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rows.map((row) => (
                <div key={row.label} className="space-y-1.5">
                  <div className="flex items-baseline gap-3">
                    <span
                      className={cn(
                        "w-10 text-2xl font-black tabular-nums",
                        row.left > row.right ? "text-emerald-300" : "text-foreground/80",
                      )}
                    >
                      {row.left}
                    </span>
                    <span className="flex-1 text-center text-xs tracking-wider text-muted-foreground uppercase">
                      {row.label}
                    </span>
                    <span
                      className={cn(
                        "w-10 text-right text-2xl font-black tabular-nums",
                        row.right > row.left ? "text-rose-300" : "text-foreground/80",
                      )}
                    >
                      {row.right}
                    </span>
                  </div>
                  <SplitBar left={row.left} right={row.right} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Vitórias de outros jogadores nessas mesas:{" "}
                <span className="tabular-nums">{d.together - d.myWins - d.theirWins}</span>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Como se eliminaram</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                { who: pa.name, list: kills.aKilledB, icon: Swords, tone: "text-emerald-300" },
                { who: pb.name, list: kills.bKilledA, icon: Skull, tone: "text-rose-300" },
              ].map((side) => (
                <div key={side.who} className="space-y-1.5 text-sm">
                  <div className={cn("flex items-center gap-1.5 font-semibold", side.tone)}>
                    <side.icon className="size-4" /> {side.who} eliminou
                  </div>
                  {side.list.length === 0 && <p className="text-muted-foreground">Nenhuma vez.</p>}
                  {side.list.map((k) => (
                    <div key={k.reason} className="flex items-center gap-2">
                      <span className="flex-1 truncate">{k.reason}</span>
                      <span className="tabular-nums">{k.count}×</span>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Outros confrontos de {pa.name}</h2>
          <div className="flex flex-wrap gap-1.5">
            {others.map((o) => (
              <Link
                key={o.them}
                href={`/rivalries/${a}/${o.them}`}
                className="rounded-full border bg-background/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {nameOf(o.them)} <span className="tabular-nums">· {o.together}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {(matches ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            Partidas juntos
            {ids.length > MATCHES_SHOWN && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                últimas {MATCHES_SHOWN} de {ids.length}
              </span>
            )}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(matches ?? []).map((m) => (
              <MatchCard key={m.id} match={m} achievements={matchUnlocks.get(m.id)} />
            ))}
          </div>
        </div>
      )}

      <Link href="/rivalries" className="inline-block text-sm text-muted-foreground hover:underline">
        ← Quadro de rivalidades
      </Link>
    </div>
  );
}
