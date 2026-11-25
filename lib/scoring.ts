import { ELIMINATION_REASONS } from "@/lib/elimination";

/**
 * Pontuação do ranking: vitória + abates (valor pelo tipo de eliminação) −
 * mortes por conta própria. Os valores dos abates ficam em ELIMINATION_REASONS.
 */
export const WIN_POINTS = 4;

const reason = (value: string | null | undefined) => ELIMINATION_REASONS.find((r) => r.value === value);

/** Abate: eliminação causada por um oponente — conta como abate mesmo valendo 0 ponto (combo). */
export const isKill = (value: string | null | undefined) => reason(value)?.kind === "opponent";

/** Pontos que um abate dá para quem eliminou (0 se o motivo não for causado por oponente). */
export const killPoints = (value: string | null | undefined) => {
  const r = reason(value);
  return r?.kind === "opponent" ? r.points : 0;
};

/** Penalidade (negativa) para quem morreu por efeito próprio; 0 nos demais casos. */
export const selfPenalty = (value: string | null | undefined) => {
  const r = reason(value);
  return r?.kind === "self" ? r.points : 0;
};

export interface ScoredParticipant {
  pilot_id: string;
  is_winner: boolean;
  elimination_reason: string | null;
  eliminated_by: string | null;
}

export interface MatchScore {
  points: number;
  kills: number;
  /** Abates por motivo ("Dano de Comandante": 2, …). */
  killsByReason: Record<string, number>;
  selfDeath: boolean;
}

/** Pontos de cada jogador numa partida (chave: pilot_id). */
export function scoreMatch(participants: ScoredParticipant[]): Map<string, MatchScore> {
  const scores = new Map<string, MatchScore>();
  for (const p of participants) {
    const self = selfPenalty(p.elimination_reason);
    scores.set(p.pilot_id, {
      points: (p.is_winner ? WIN_POINTS : 0) + self,
      kills: 0,
      killsByReason: {},
      selfDeath: self !== 0,
    });
  }
  for (const victim of participants) {
    if (!victim.eliminated_by || victim.is_winner) continue;
    const killer = scores.get(victim.eliminated_by);
    if (!killer || !isKill(victim.elimination_reason)) continue;
    const pts = killPoints(victim.elimination_reason);
    killer.points += pts;
    killer.kills++;
    killer.killsByReason[victim.elimination_reason!] = (killer.killsByReason[victim.elimination_reason!] ?? 0) + 1;
  }
  return scores;
}

/** Linhas da explicação "Como funciona a pontuação". */
export const SCORING_RULES: { label: string; points: number; who: string }[] = [
  { label: "Vitória", points: WIN_POINTS, who: "vencedor" },
  ...ELIMINATION_REASONS.filter((r) => r.kind === "opponent")
    .sort((a, b) => b.points - a.points)
    .map((r) => ({
      label: `Eliminar por ${r.value.replace(" (grimório vazio)", "")}`,
      points: r.points,
      who: "quem eliminou",
    })),
  ...ELIMINATION_REASONS.filter((r) => r.kind === "self").map((r) => ({
    label: `Morrer por ${r.value}`,
    points: r.points,
    who: "quem morreu",
  })),
];
