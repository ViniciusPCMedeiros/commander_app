import Link from "next/link";
import { CalendarDays, Repeat, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPips } from "@/components/color-pips";
import { eliminationLabel } from "@/lib/elimination";
import { commanderLabel, formatDateTime, HIDDEN_PLAYER } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MatchWithParticipants } from "@/lib/types";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  approved: { label: "Aprovada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "Rejeitada", className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

export function MatchCard({ match, actions }: { match: MatchWithParticipants; actions?: React.ReactNode }) {
  const participants = [...match.match_participants].sort(
    (a, b) => Number(b.is_winner) - Number(a.is_winner) || (a.seat_order ?? 9) - (b.seat_order ?? 9),
  );
  const status = STATUS[match.status];
  const nameById = new Map(match.match_participants.map((p) => [p.pilot_id, p.pilot?.name ?? HIDDEN_PLAYER]));

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatDateTime(match.played_at)}
          {match.win_condition && <span className="text-foreground">· {match.win_condition}</span>}
        </CardTitle>
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-md border">
          {participants.map((p) => {
            const borrowed = p.pilot_id !== p.deck_owner_id;
            return (
              <li
                key={p.id}
                className={cn("flex items-center gap-3 px-3 py-2 text-sm", p.is_winner && "bg-amber-500/10")}
              >
                <span className="w-5 text-center text-xs text-muted-foreground">{p.seat_order ?? "–"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    {p.pilot ? (
                      <Link href={`/players/${p.pilot_id}`} className="font-medium hover:underline">
                        {p.pilot.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground italic">{HIDDEN_PLAYER}</span>
                    )}
                    {p.is_winner && <Trophy className="size-4 text-amber-400" />}
                    {borrowed && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Repeat className="size-3" /> deck de {p.owner?.name ?? HIDDEN_PLAYER}
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {commanderLabel(p.commander_snapshot)}
                    {!p.is_winner &&
                      p.elimination_reason &&
                      ` · ${eliminationLabel(p.elimination_reason, p.eliminated_by ? nameById.get(p.eliminated_by) : null)}`}
                  </div>
                </div>
                <ColorPips colors={p.color_identity_snapshot} className="hidden sm:inline-flex" />
              </li>
            );
          })}
        </ul>
        {match.notes && <p className="text-sm text-muted-foreground italic">“{match.notes}”</p>}
        {actions}
      </CardContent>
    </Card>
  );
}
