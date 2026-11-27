import { ACHIEVEMENT_BY_ID, type Rarity } from "@/lib/achievements";
import { isKill } from "@/lib/scoring";
import type { Season } from "@/lib/seasons";
import { tierOf, type Tier } from "@/lib/level-tiers";

export { TIERS, tierOf, type Tier } from "@/lib/level-tiers";

/**
 * Duas medidas por pessoa:
 *  - Nível (XP → faixa): quanto a pessoa participa do Mesão. Só sobe. Sai das
 *    partidas aprovadas, conquistas (menos as de coleção, fáceis de inflar),
 *    temporadas e decks já jogados. Aparece no perfil.
 *  - Habilidade (Elo): quanto a pessoa vence. Sobe e desce. Fica escondida (só o
 *    root vê) e vai servir para montar mesas justas na Liga.
 * Tudo é calculado do histórico, então vale retroativamente.
 */

// ---------------------------------------------------------------- XP

export const XP = {
  match: 10,
  win: 15,
  kill: 3,
  achievement: { common: 15, uncommon: 25, rare: 50, mythic: 100 } satisfies Record<Rarity, number>,
  secret: 50,
  seasonAchievement: 30,
  /** Top 3 da temporada (conquista "Pódio"). */
  podium: 100,
  /** 1º lugar (Coroa), somado ao pódio. */
  crown: 100,
  legend: 150,
  /** Cada deck diferente jogado numa partida aprovada (a primeira vez). */
  deck: 25,
} as const;

export type XpSource = "partidas" | "vitorias" | "abates" | "conquistas" | "temporadas" | "decks";

export const XP_SOURCE_LABEL: Record<XpSource, string> = {
  partidas: "Partidas",
  vitorias: "Vitórias",
  abates: "Abates",
  conquistas: "Conquistas",
  temporadas: "Temporadas",
  decks: "Decks jogados",
};

/** Regras de XP para exibição. */
export const XP_RULES: { source: XpSource; rule: string }[] = [
  { source: "partidas", rule: `+${XP.match} por partida aprovada` },
  { source: "vitorias", rule: `+${XP.win} por vitória` },
  { source: "abates", rule: `+${XP.kill} por abate` },
  {
    source: "conquistas",
    rule: `+${XP.achievement.common} a +${XP.achievement.mythic} pela raridade (secretas +${XP.secret}; as de coleção não contam)`,
  },
  {
    source: "temporadas",
    rule: `+${XP.seasonAchievement} por conquista, pódio +${XP.podium}, 1º lugar +${XP.crown}, Lenda +${XP.legend}`,
  },
  { source: "decks", rule: `+${XP.deck} por deck diferente jogado` },
];

export interface LevelPart {
  match_id: string;
  pilot_id: string;
  deck_id: string;
  is_winner: boolean;
  elimination_reason: string | null;
  eliminated_by: string | null;
  played_at: string;
}

export interface Level {
  xp: number;
  bySource: Record<XpSource, number>;
  tier: Tier;
}

const emptySources = (): Record<XpSource, number> => ({
  partidas: 0,
  vitorias: 0,
  abates: 0,
  conquistas: 0,
  temporadas: 0,
  decks: 0,
});

/** XP de cada conquista do catálogo (as de coleção não contam; secretas valem fixo). */
export function achievementXp(id: string) {
  const a = ACHIEVEMENT_BY_ID.get(id);
  if (!a || a.category === "colecao") return 0;
  return a.secret ? XP.secret : XP.achievement[a.rarity];
}

/** XP de uma chave de temporada (conquista, pódio, campeão, Coroa, Lenda). */
export function seasonKeyXp(season: Pick<Season, "achievements"> | undefined, key: string) {
  if (key === "coroa") return XP.crown;
  if (key === "lenda") return XP.legend;
  const a = season?.achievements.find((x) => x.key === key);
  if (!a) return 0;
  if (a.template === "podium") return XP.podium;
  // O campeão já ganha pela Coroa
  if (a.template === "champion") return 0;
  return XP.seasonAchievement;
}

export function computeLevels(input: {
  parts: LevelPart[];
  achievements: { user_id: string; achievement_id: string }[];
  seasonUnlocks: { user_id: string; season_id: string; achievement_key: string }[];
  seasons: Pick<Season, "id" | "achievements">[];
  visible: Set<string>;
}): Map<string, Level> {
  const sources = new Map<string, Record<XpSource, number>>();
  const add = (id: string, source: XpSource, xp: number) => {
    if (!input.visible.has(id) || !xp) return;
    const s = sources.get(id) ?? emptySources();
    s[source] += xp;
    sources.set(id, s);
  };

  const decks = new Set<string>();
  for (const p of input.parts) {
    add(p.pilot_id, "partidas", XP.match);
    if (p.is_winner) add(p.pilot_id, "vitorias", XP.win);
    if (p.eliminated_by && !p.is_winner && isKill(p.elimination_reason)) add(p.eliminated_by, "abates", XP.kill);
    const key = `${p.pilot_id}:${p.deck_id}`;
    if (!decks.has(key)) {
      decks.add(key);
      add(p.pilot_id, "decks", XP.deck);
    }
  }
  for (const a of input.achievements) add(a.user_id, "conquistas", achievementXp(a.achievement_id));
  const seasonById = new Map(input.seasons.map((s) => [s.id, s]));
  for (const u of input.seasonUnlocks)
    add(u.user_id, "temporadas", seasonKeyXp(seasonById.get(u.season_id), u.achievement_key));

  const out = new Map<string, Level>();
  for (const id of input.visible) {
    const bySource = sources.get(id) ?? emptySources();
    const xp = Object.values(bySource).reduce((a, b) => a + b, 0);
    out.set(id, { xp, bySource, tier: tierOf(xp) });
  }
  return out;
}

// ---------------------------------------------------------------- Elo

export const ELO_START = 1500;
/** K nas primeiras partidas (calibração: quem é novo se ajusta rápido) e depois. */
export const ELO_K_CALIBRATION = 40;
export const ELO_K = 20;
export const ELO_CALIBRATION_GAMES = 15;

export interface Elo {
  rating: number;
  games: number;
  /** Ainda nas primeiras ELO_CALIBRATION_GAMES partidas. */
  calibrating: boolean;
}

/** Chance esperada de A vencer B. */
export const eloExpected = (ra: number, rb: number) => 1 / (1 + 10 ** ((rb - ra) / 400));

/**
 * Elo para mesas de 3 a 6, em ordem cronológica. Cada par da mesa é um "duelo":
 * quem venceu ganha de quem perdeu (1 × 0); entre quem perdeu, quem fez mais
 * abates ganha (empate = 0,5). ΔR = K/(n−1) · Σ (S − E), então a mesa inteira vale
 * um duelo e a soma das variações é zero (com o mesmo K).
 */
export function computeElo(parts: LevelPart[], visible: Set<string>): Map<string, Elo> {
  const state = new Map<string, { rating: number; games: number }>();
  const get = (id: string) => {
    let s = state.get(id);
    if (!s) state.set(id, (s = { rating: ELO_START, games: 0 }));
    return s;
  };

  const byMatch = Map.groupBy(
    [...parts].sort((a, b) => a.played_at.localeCompare(b.played_at) || a.match_id.localeCompare(b.match_id)),
    (p) => p.match_id,
  );
  for (const table of byMatch.values()) {
    // O root não entra na conta
    const seats = table.filter((p) => visible.has(p.pilot_id));
    if (seats.length < 2) continue;
    const kills = (id: string) =>
      table.filter((p) => p.eliminated_by === id && !p.is_winner && isKill(p.elimination_reason)).length;
    const players = seats.map((p) => ({ id: p.pilot_id, won: p.is_winner, kills: kills(p.pilot_id) }));
    const before = new Map(players.map((p) => [p.id, get(p.id).rating]));

    for (const a of players) {
      let sum = 0;
      for (const b of players) {
        if (a.id === b.id) continue;
        const score = a.won !== b.won ? (a.won ? 1 : 0) : a.kills === b.kills ? 0.5 : a.kills > b.kills ? 1 : 0;
        sum += score - eloExpected(before.get(a.id)!, before.get(b.id)!);
      }
      const s = get(a.id);
      const k = s.games < ELO_CALIBRATION_GAMES ? ELO_K_CALIBRATION : ELO_K;
      s.rating += (k / (players.length - 1)) * sum;
      s.games++;
    }
  }

  return new Map(
    [...state]
      .filter(([id]) => visible.has(id))
      .map(([id, s]) => [
        id,
        { rating: Math.round(s.rating), games: s.games, calibrating: s.games < ELO_CALIBRATION_GAMES },
      ]),
  );
}
