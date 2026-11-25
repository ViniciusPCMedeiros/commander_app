import { CHANGELOG } from "@/lib/changelog";
import type { PlayerMilestones } from "@/lib/types";

export type MilestoneKind = "joined" | "first_match" | "first_win" | "release";

export interface MilestoneEvent {
  kind: MilestoneKind;
  at: string;
  /** Jogador do marco (vazio nos eventos de versão do app). */
  userId: string;
  name: string;
  /** Versão do Mesão (kind "release"). */
  release?: { version: string; title: string; changes: number };
  commander?: string | null;
  deckId?: string | null;
  borrowed?: boolean;
  /** Primeira partida que já foi vitória (não gera evento separado de primeira vitória). */
  wonFirst?: boolean;
}

/**
 * Converte os marcos de cada jogador em eventos de linha do tempo, do mais recente
 * ao mais antigo. `releases` inclui as versões do app (histórico do grupo).
 */
export function milestoneEvents(rows: PlayerMilestones[], { releases = false } = {}): MilestoneEvent[] {
  const events: MilestoneEvent[] = [];
  for (const r of rows) {
    // Quem jogou antes de ter conta já fazia parte do grupo: entra na data mais antiga
    const joinedAt = r.first_match_at && r.first_match_at < r.joined_at ? r.first_match_at : r.joined_at;
    events.push({ kind: "joined", at: joinedAt, userId: r.user_id, name: r.player_name });
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
  if (releases) {
    for (const r of CHANGELOG) {
      events.push({
        kind: "release",
        at: new Date(r.date).toISOString(),
        userId: "",
        name: "",
        release: { version: r.version, title: r.title, changes: r.changes.length },
      });
    }
  }
  // Mais recente primeiro; no empate, "entrou" antes de "jogou" antes de "venceu" (lido de baixo para cima)
  const order: Record<MilestoneKind, number> = { release: 0, joined: 1, first_match: 2, first_win: 3 };
  return events.sort((a, b) => b.at.localeCompare(a.at) || order[b.kind] - order[a.kind]);
}
