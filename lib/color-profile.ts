/**
 * Identidade de cor de um jogador: em quantas partidas cada cor estava no deck
 * pilotado. Cores presentes em mais da metade das partidas formam a "identidade"
 * (ex.: verde e azul acima de 50% → Simic). Decks incolores contam como "C": se
 * passarem de 50%, a identidade é Incolor (aí nenhuma cor pode passar de 50%,
 * então, se alguma passar, o Incolor some).
 */

export const WUBRG = ["W", "U", "B", "R", "G"] as const;

export const COLOR_NAME: Record<string, string> = {
  W: "Branco",
  U: "Azul",
  B: "Preto",
  R: "Vermelho",
  G: "Verde",
  C: "Incolor",
};

/** Nome da combinação (chave em ordem WUBRG). */
const COMBO_NAME: Record<string, string> = {
  // Uma cor só acima de 50% não quer dizer decks mono: é a cor que mais aparece
  W: "Branco",
  U: "Azul",
  B: "Preto",
  R: "Vermelho",
  G: "Verde",
  WU: "Azorius",
  UB: "Dimir",
  BR: "Rakdos",
  RG: "Gruul",
  WG: "Selesnya",
  WB: "Orzhov",
  UR: "Izzet",
  BG: "Golgari",
  WR: "Boros",
  UG: "Simic",
  WUG: "Bant",
  WUB: "Esper",
  UBR: "Grixis",
  BRG: "Jund",
  WRG: "Naya",
  WBG: "Abzan",
  WUR: "Jeskai",
  UBG: "Sultai",
  WBR: "Mardu",
  URG: "Temur",
  UBRG: "Sem branco",
  WBRG: "Sem azul",
  WURG: "Sem preto",
  WUBG: "Sem vermelho",
  WUBR: "Sem verde",
  WUBRG: "Cinco cores",
  C: "Incolor",
};

/** Mínimo de partidas para apontar uma identidade. */
export const IDENTITY_MIN_GAMES = 5;
/** Acima disso (em % das partidas), a cor faz parte da identidade. */
export const IDENTITY_THRESHOLD = 50;

export interface ColorShare {
  color: string;
  games: number;
  wins: number;
  /** % das partidas do jogador com essa cor no deck. */
  pct: number;
  /** Faz parte da identidade (acima de IDENTITY_THRESHOLD). */
  core: boolean;
}

/** Identidade de cada jogador (todas as partidas aprovadas), para o ranking. */
export function identitiesByPlayer(
  parts: { pilot_id: string; color_identity_snapshot: string[] | null; is_winner: boolean }[],
) {
  const byPlayer = Map.groupBy(parts, (p) => p.pilot_id);
  return new Map([...byPlayer].map(([id, list]) => [id, colorProfile(list).identity]));
}

export function colorProfile(parts: { color_identity_snapshot: string[] | null; is_winner: boolean }[]) {
  const games = parts.length;
  const shares = new Map<string, { games: number; wins: number }>();
  for (const p of parts) {
    const colors = (p.color_identity_snapshot ?? []).filter((c) => (WUBRG as readonly string[]).includes(c));
    for (const c of colors.length ? colors : ["C"]) {
      const s = shares.get(c) ?? { games: 0, wins: 0 };
      s.games++;
      if (p.is_winner) s.wins++;
      shares.set(c, s);
    }
  }
  const list: ColorShare[] = [...WUBRG, "C"]
    .map((color) => {
      const s = shares.get(color) ?? { games: 0, wins: 0 };
      const pct = games ? Math.round((s.games / games) * 100) : 0;
      return { color, games: s.games, wins: s.wins, pct, core: pct > IDENTITY_THRESHOLD };
    })
    .filter((s) => s.games > 0)
    .sort((a, b) => b.games - a.games || WUBRG.indexOf(a.color as never) - WUBRG.indexOf(b.color as never));

  const colored = WUBRG.filter((c) => list.some((s) => s.color === c && s.core));
  // Incolor só vira identidade se nenhuma cor passar de 50%
  const core: string[] = colored.length ? [...colored] : list.some((s) => s.color === "C" && s.core) ? ["C"] : [];
  const identity =
    games >= IDENTITY_MIN_GAMES && core.length ? { colors: core, name: COMBO_NAME[core.join("")] } : null;
  return { games, shares: list, identity };
}
