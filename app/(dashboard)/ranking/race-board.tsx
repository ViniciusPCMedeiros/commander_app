"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RankMovement, RankPosition } from "@/components/rank-badges";
import { formatPct, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RaceRow {
  id: string;
  name: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  winrate: number;
  currentStreak: number;
  ownWins: number;
  ownGames: number;
  borrowedWins: number;
  borrowedGames: number;
  /** Positivo = subiu; null = estreante. */
  delta: number | null;
  prevIndex: number | null;
  fewGames: boolean;
}

const ROW_H = 64;

/**
 * Placar "de corrida": as linhas começam na ordem anterior (antes da última sessão)
 * e deslizam até a posição atual. Quem subiu brilha verde; quem caiu, vermelho.
 */
export function RaceBoard({ rows }: { rows: RaceRow[] }) {
  const [phase, setPhase] = useState<"before" | "after">("before");
  const [run, setRun] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("after"), 450);
    return () => clearTimeout(t);
  }, [run]);

  // Ordem "antes": quem já estava no ranking pela posição anterior; estreantes entram por baixo
  const beforeIndex = new Map(
    [...rows]
      .sort((a, b) => (a.prevIndex ?? Infinity) - (b.prevIndex ?? Infinity))
      .map((r, i) => [r.id, i]),
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
                  "flex h-[58px] items-center gap-3 rounded-xl border bg-card px-3 transition-[box-shadow,border-color,background-color] duration-700",
                  done && moved && r.delta! > 0 && "border-emerald-500/50 bg-emerald-500/[0.06] shadow-[0_0_18px_-6px] shadow-emerald-500/60",
                  done && moved && r.delta! < 0 && "border-red-500/40 bg-red-500/[0.05] shadow-[0_0_18px_-8px] shadow-red-500/50",
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
                <Avatar className="size-9 shrink-0">
                  {r.avatar_url && <AvatarImage src={r.avatar_url} alt="" />}
                  <AvatarFallback className="text-xs">{initials(r.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${r.id}`} className="block truncate font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.currentStreak > 0 && <span className="text-orange-400">🔥 {r.currentStreak} seguida(s) · </span>}
                    <span className="hidden sm:inline">
                      próprios {r.ownWins}/{r.ownGames} · emprestados {r.borrowedWins}/{r.borrowedGames}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg leading-none font-black tabular-nums">
                    {r.wins}
                    <span className="text-xs font-normal text-muted-foreground">V</span>
                  </div>
                  <div className={cn("text-xs text-muted-foreground tabular-nums", r.fewGames && "opacity-60")}>
                    {r.games}J · {formatPct(r.winrate)}
                    {r.fewGames && "*"}
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
