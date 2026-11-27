"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PlayerTitle } from "@/components/player-title";
import { PlayerLevel } from "@/components/player-level";
import { RankMovement, RankPosition } from "@/components/rank-badges";
import type { DisplayTitle } from "@/lib/seasons";
import { formatPct, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RaceRow {
  id: string;
  name: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  winrate: number;
  points: number;
  kills: number;
  deaths: number;
  currentStreak: number;
  ownWins: number;
  ownGames: number;
  borrowedWins: number;
  borrowedGames: number;
  title: DisplayTitle | null;
  /** Positivo = subiu; null = estreante. */
  delta: number | null;
  prevIndex: number | null;
  fewGames: boolean;
}

const ROW_H = 84;

/** Número com rótulo pequeno embaixo (colunas do placar). */
function Stat({
  value,
  label,
  title,
  className,
}: {
  value: React.ReactNode;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className="w-14 text-center" title={title}>
      <div className={cn("text-lg leading-tight font-semibold tabular-nums", className)}>{value}</div>
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

/**
 * Placar "de corrida": as linhas começam na ordem anterior (antes da última sessão)
 * e deslizam até a posição atual. Quem subiu brilha verde; quem caiu, vermelho.
 */
export function RaceBoard({ rows, metric }: { rows: RaceRow[]; metric: "points" | "wins" }) {
  const [phase, setPhase] = useState<"before" | "after">("before");
  const [run, setRun] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("after"), 450);
    return () => clearTimeout(t);
  }, [run]);

  // Ordem "antes": quem já estava no ranking pela posição anterior; estreantes entram por baixo
  const beforeIndex = new Map(
    [...rows].sort((a, b) => (a.prevIndex ?? Infinity) - (b.prevIndex ?? Infinity)).map((r, i) => [r.id, i]),
  );
  const done = phase === "after";

  return (
    <div className="space-y-2">
      <div className="relative" style={{ height: rows.length * ROW_H }}>
        {rows.map((r, i) => {
          const index = done ? i : beforeIndex.get(r.id)!;
          const isNew = r.prevIndex === null;
          const moved = r.delta !== null && r.delta !== 0;
          return (
            <div
              key={r.id}
              className="absolute inset-x-0 px-0.5 transition-[transform,opacity] duration-[1200ms] ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none"
              style={{
                height: ROW_H,
                transform: `translateY(${index * ROW_H}px)`,
                transitionDelay: done ? `${Math.min(i, 8) * 70}ms` : "0ms",
                opacity: !done && isNew ? 0 : 1,
                zIndex: done && r.delta && r.delta > 0 ? 2 : 1,
              }}
            >
              <div
                className={cn(
                  "flex h-[76px] items-center gap-3 rounded-xl border bg-card px-3 transition-[box-shadow,border-color,background-color] duration-700",
                  done &&
                    moved &&
                    r.delta! > 0 &&
                    "border-emerald-500/50 bg-emerald-500/[0.06] shadow-[0_0_18px_-6px] shadow-emerald-500/60",
                  done &&
                    moved &&
                    r.delta! < 0 &&
                    "border-red-500/40 bg-red-500/[0.05] shadow-[0_0_18px_-8px] shadow-red-500/50",
                  done && isNew && "border-amber-400/50 bg-amber-400/[0.05]",
                  i === 0 && done && "border-amber-400/60",
                )}
              >
                <div className="flex w-12 shrink-0 flex-col items-center">
                  <RankPosition position={done ? i + 1 : isNew ? null : r.prevIndex! + 1} />
                </div>
                <div className={cn("w-9 shrink-0 transition-opacity duration-500", done ? "opacity-100" : "opacity-0")}>
                  <RankMovement delta={r.delta} />
                </div>
                <Avatar className="hidden size-11 shrink-0 sm:flex">
                  {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
                  <AvatarFallback>{initials(r.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <Link href={`/players/${r.id}`} className="truncate text-base font-semibold hover:underline">
                      {r.name}
                    </Link>
                    <PlayerLevel id={r.id} className="self-center" />
                    <PlayerTitle title={r.title} className="hidden sm:inline-flex" />
                  </div>
                  {/* Celular: resumo embaixo do nome (as colunas não cabem) */}
                  <div className="truncate text-sm text-muted-foreground tabular-nums sm:hidden">
                    {metric === "points" && <>{r.wins}V · </>}
                    <span className="text-emerald-300">⚔ {r.kills}</span> ·{" "}
                    <span className="text-rose-300">☠ {r.deaths}</span> · {r.games}J
                  </div>
                  <div className="flex min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground">
                    {r.currentStreak > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-orange-400">
                        <Flame className="size-3.5" />
                        {r.currentStreak} seguida(s)
                      </span>
                    )}
                    <span className="hidden truncate sm:inline">
                      {r.currentStreak > 0 && "· "}próprios {r.ownWins}/{r.ownGames} · emprestados {r.borrowedWins}/
                      {r.borrowedGames}
                    </span>
                  </div>
                </div>
                <div className={cn("hidden shrink-0 items-center sm:flex", r.fewGames && "[&_.win]:opacity-60")}>
                  {metric === "points" && <Stat value={r.wins} label="Vitórias" />}
                  <Stat value={r.kills} label="Abates" title="Abates (⚔)" className="text-emerald-300" />
                  <Stat value={r.deaths} label="Mortes" title="Mortes (☠)" className="text-rose-300" />
                  <Stat value={r.games} label="Partidas" />
                  <Stat
                    value={
                      <span className="win">
                        {formatPct(r.winrate).replace(",0%", "%")}
                        {r.fewGames && "*"}
                      </span>
                    }
                    label="Win%"
                  />
                </div>
                <div className="w-16 shrink-0 text-center sm:ml-2 sm:w-20 sm:border-l sm:border-border/60 sm:pl-3">
                  <div className="text-2xl leading-none font-black text-primary tabular-nums sm:text-3xl">
                    {metric === "points" ? r.points : r.wins}
                  </div>
                  <div className="mt-1 text-[10px] tracking-wider text-muted-foreground uppercase">
                    {metric === "points" ? "pontos" : "vitórias"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPhase("before");
            setRun((n) => n + 1);
          }}
        >
          <Play /> Ver de novo
        </Button>
      </div>
    </div>
  );
}
