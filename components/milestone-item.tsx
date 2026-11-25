import Link from "next/link";
import { Award, Repeat, Sparkles, Swords, Trophy, UserPlus } from "lucide-react";
import { AchievementChip, AchievementIcon } from "@/components/achievement-badge";
import { ACHIEVEMENT_BY_ID } from "@/lib/achievements";
import { Badge } from "@/components/ui/badge";
import { commanderLabel, formatDate } from "@/lib/format";
import type { MilestoneEvent, MilestoneKind } from "@/lib/milestones";
import { cn } from "@/lib/utils";

const STYLE: Record<MilestoneKind, { icon: typeof UserPlus; className: string }> = {
  joined: { icon: UserPlus, className: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  first_match: { icon: Swords, className: "bg-zinc-500/15 text-zinc-200 ring-zinc-500/30" },
  first_win: { icon: Trophy, className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  release: { icon: Sparkles, className: "bg-primary/15 text-primary ring-primary/40" },
  achievement: { icon: Award, className: "" },
};

/** Um marco na linha do tempo. `showName=false` no perfil, onde o jogador já é conhecido. */
export function MilestoneItem({ event, showName = true }: { event: MilestoneEvent; showName?: boolean }) {
  const { icon: Icon, className } = STYLE[event.wonFirst ? "first_win" : event.kind];
  const who = showName ? (
    <Link href={`/players/${event.userId}`} className="font-semibold hover:underline">
      {event.name}
    </Link>
  ) : null;
  const deck = event.commander && (
    <>
      {" "}
      com{" "}
      {event.deckId ? (
        <Link href={`/decks/${event.deckId}`} className="font-medium hover:underline">
          {commanderLabel(event.commander)}
        </Link>
      ) : (
        <span className="font-medium">{commanderLabel(event.commander)}</span>
      )}
    </>
  );

  const achievement = event.achievementId ? ACHIEVEMENT_BY_ID.get(event.achievementId) : undefined;

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {achievement ? (
        <AchievementIcon achievement={achievement} className="relative z-10 size-8 ring-1" />
      ) : (
        <span
          className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-1", className)}
        >
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1 pt-1 text-sm">
        <p>
          {event.release && (
            <>
              <Link href={`/changelog#v${event.release.version}`} className="font-semibold text-primary hover:underline">
                Mesão v{event.release.version}
              </Link>{" "}
              — {event.release.title}
            </>
          )}
          {achievement && (
            <>
              {who ?? "Liberou"}
              {who && " liberou"} a conquista <AchievementChip achievement={achievement} />
            </>
          )}
          {event.kind === "joined" && <>{who ?? "Entrou"}{who && " entrou"} no grupo</>}
          {event.kind === "first_match" && (
            <>
              {who ? <>Primeira partida de {who}</> : "Primeira partida"}
              {deck}
              {event.wonFirst && <span className="text-amber-300"> — e já venceu! 🏆</span>}
            </>
          )}
          {event.kind === "first_win" && (
            <>
              {who ? <>Primeira vitória de {who}</> : "Primeira vitória"}
              {deck} 🏆
            </>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {formatDate(event.at)}
          {event.release && (
            <Link href={`/changelog#v${event.release.version}`} className="hover:text-foreground">
              {event.release.changes} novidade{event.release.changes === 1 ? "" : "s"} →
            </Link>
          )}
          {event.borrowed && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Repeat className="size-3" /> deck emprestado
            </Badge>
          )}
        </div>
      </div>
    </li>
  );
}

/** Lista com a linha vertical ligando os marcos. */
export function MilestoneList({ children }: { children: React.ReactNode }) {
  return (
    <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:-translate-x-1/2 before:bg-border">
      {children}
    </ol>
  );
}
