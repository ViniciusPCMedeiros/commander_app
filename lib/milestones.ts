import type { PlayerMilestones } from "@/lib/types";

export type MilestoneKind = "joined" | "first_match" | "first_win";

export interface MilestoneEvent {
  kind: MilestoneKind;
  at: string;
  userId: string;
  name: string;
  commander?: string | null;
  deckId?: string | null;
  borrowed?: boolean;
  /** Primeira partida que já foi vitória (não gera evento separado de primeira vitória). */
  wonFirst?: boolean;
}

/** Converte os marcos de cada jogador em eventos de linha do tempo, do mais recente ao mais antigo. */
export function milestoneEvents(rows: PlayerMilestones[]): MilestoneEvent[] {
  const events: MilestoneEvent[] = [];
  for (const r of rows) {
    events.push({ kind: "joined", at: r.joined_at, userId: r.user_id, name: r.player_name });
    if (r.first_match_at) {
      events.push({
        kind: "first_match",
        at: r.first_match_at,
        userId: r.user_id,
        name: r.player_name,
        commander: r.first_match_commander,
        deckId: r.first_match_deck_id,
        borrowed: Boolean(r.first_match_borrowed),
        wonFirst: Boolean(r.first_match_won),
      });
    }
    if (r.first_win_at && r.first_win_id !== r.first_match_id) {
      events.push({
        kind: "first_win",
        at: r.first_win_at,
        userId: r.user_id,
        name: r.player_name,
        commander: r.first_win_commander,
        deckId: r.first_win_deck_id,
      });
    }
  }
  // Mais recente primeiro; no empate, "entrou" antes de "jogou" antes de "venceu" (lido de baixo para cima)
  const order: Record<MilestoneKind, number> = { joined: 0, first_match: 1, first_win: 2 };
  return events.sort((a, b) => b.at.localeCompare(a.at) || order[b.kind] - order[a.kind]);
}
