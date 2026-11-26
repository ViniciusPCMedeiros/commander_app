import {
  Axe,
  BookOpen,
  CalendarCheck,
  Candy,
  Crown,
  Dices,
  Droplet,
  FlaskConical,
  Flame,
  Gem,
  Ghost,
  Gift,
  Hourglass,
  Infinity as InfinityIcon,
  Medal,
  Moon,
  PartyPopper,
  Rainbow,
  Shield,
  Shuffle,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  TreePine,
  TrendingUp,
  Trophy,
  VenetianMask,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Rarity } from "@/lib/achievements";
import { ELIMINATION_REASONS } from "@/lib/elimination";
import { scoreMatch } from "@/lib/scoring";

/**
 * Temporadas: o root lança cada uma com um tema e datas. Cada temporada tem a
 * lista base (a mesma toda temporada, mais as base criadas pelo root) e as
 * conquistas temáticas do tema. Tudo é montado a partir de modelos de condição
 * (TEMPLATES) e fica congelado no lançamento. Lenda (todas as conquistas
 * obrigatórias) e Coroa (1º lugar) viram títulos que o jogador exibe.
 */

// ---------------------------------------------------------------- Ícones e cores

/** Ícones que o root pode escolher para uma conquista (chave → ícone). */
export const SEASON_ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  crown: Crown,
  medal: Medal,
  star: Star,
  sparkles: Sparkles,
  flame: Flame,
  zap: Zap,
  swords: Swords,
  axe: Axe,
  skull: Skull,
  target: Target,
  droplet: Droplet,
  flask: FlaskConical,
  book: BookOpen,
  infinity: InfinityIcon,
  shield: Shield,
  shuffle: Shuffle,
  rainbow: Rainbow,
  gem: Gem,
  ghost: Ghost,
  mask: VenetianMask,
  moon: Moon,
  timer: Timer,
  hourglass: Hourglass,
  trending: TrendingUp,
  calendar: CalendarCheck,
  dice: Dices,
  gift: Gift,
  party: PartyPopper,
  tree: TreePine,
  snowflake: Snowflake,
  candy: Candy,
};
export type SeasonIcon = keyof typeof SEASON_ICONS;

/** Paleta dos temas: cor do selo, do título e dos destaques da temporada. */
export const THEME_COLORS = {
  amber: {
    label: "Dourado",
    hex: "#fcd34d",
    text: "text-amber-300",
    ring: "ring-amber-400/80",
    bg: "bg-amber-400/10",
    border: "border-amber-400/50",
  },
  red: {
    label: "Vermelho",
    hex: "#fca5a5",
    text: "text-red-300",
    ring: "ring-red-400/80",
    bg: "bg-red-500/10",
    border: "border-red-400/50",
  },
  emerald: {
    label: "Verde",
    hex: "#6ee7b7",
    text: "text-emerald-300",
    ring: "ring-emerald-400/80",
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/50",
  },
  sky: {
    label: "Azul",
    hex: "#7dd3fc",
    text: "text-sky-300",
    ring: "ring-sky-400/80",
    bg: "bg-sky-500/10",
    border: "border-sky-400/50",
  },
  violet: {
    label: "Roxo",
    hex: "#c4b5fd",
    text: "text-violet-300",
    ring: "ring-violet-400/80",
    bg: "bg-violet-500/10",
    border: "border-violet-400/50",
  },
  rose: {
    label: "Rosa",
    hex: "#fda4af",
    text: "text-rose-300",
    ring: "ring-rose-400/80",
    bg: "bg-rose-500/10",
    border: "border-rose-400/50",
  },
  slate: {
    label: "Prata",
    hex: "#e2e8f0",
    text: "text-slate-200",
    ring: "ring-slate-300/80",
    bg: "bg-slate-300/10",
    border: "border-slate-300/50",
  },
} as const;
export type ThemeColor = keyof typeof THEME_COLORS;
export const themeColor = (c: string | null | undefined) =>
  THEME_COLORS[(c ?? "amber") as ThemeColor] ?? THEME_COLORS.amber;

// ---------------------------------------------------------------- Modelos de condição

export interface TemplateParams {
  /** Quantidade (abates, vitórias, partidas…). */
  n?: number;
  /** Tipo de eliminação (abates por tipo). */
  reason?: string;
  /** Cor da identidade (W, U, B, R, G). */
  color?: string;
  /** Número de cores do deck (0 = qualquer). */
  k?: number;
}

export type TemplateId =
  | "kills"
  | "wins"
  | "games"
  | "win_streak"
  | "kills_in_match"
  | "win_borrowed"
  | "win_color"
  | "win_mono"
  | "win_decks"
  | "late_games"
  | "games_same_day"
  | "comeback"
  | "kill_leader"
  | "win_all_seats"
  | "color_pairs"
  | "weeks_played"
  | "podium"
  | "champion";

const COLOR_NAMES: Record<string, string> = { W: "branco", U: "azul", B: "preto", R: "vermelho", G: "verde" };
const KILL_REASONS = ELIMINATION_REASONS.filter((r) => r.kind === "opponent").map((r) => r.value);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const reasonLabel = (r: string) => r.replace(" (grimório vazio) do inimigo", "").toLowerCase();

export interface TemplateDef {
  id: TemplateId;
  /** Nome no editor do root. */
  label: string;
  /** Parâmetros que o root preenche. */
  params: (keyof TemplateParams)[];
  defaults: TemplateParams;
  describe: (p: TemplateParams) => string;
  /** Só se decide no encerramento (pódio, campeão). */
  final?: boolean;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "kills",
    label: "Abates (de qualquer tipo ou de um tipo)",
    params: ["n", "reason"],
    defaults: { n: 10 },
    describe: ({ n = 1, reason }) =>
      reason
        ? `Eliminar ${n} ${plural(n, "oponente", "oponentes")} por ${reasonLabel(reason)} na temporada.`
        : `Eliminar ${n} ${plural(n, "oponente", "oponentes")} na temporada.`,
  },
  {
    id: "wins",
    label: "Vitórias",
    params: ["n"],
    defaults: { n: 1 },
    describe: ({ n = 1 }) => (n === 1 ? "Vencer uma partida na temporada." : `Vencer ${n} partidas na temporada.`),
  },
  {
    id: "games",
    label: "Partidas jogadas",
    params: ["n"],
    defaults: { n: 20 },
    describe: ({ n = 1 }) => `Jogar ${n} ${plural(n, "partida", "partidas")} na temporada.`,
  },
  {
    id: "win_streak",
    label: "Vitórias seguidas",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 2 }) => `Vencer ${n} partidas seguidas na temporada.`,
  },
  {
    id: "kills_in_match",
    label: "Abates na mesma partida",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 2 }) => `Eliminar ${n} oponentes na mesma partida.`,
  },
  {
    id: "win_borrowed",
    label: "Vitórias com deck emprestado",
    params: ["n"],
    defaults: { n: 1 },
    describe: ({ n = 1 }) =>
      n === 1 ? "Vencer com o deck de outra pessoa." : `Vencer ${n} vezes com decks de outras pessoas.`,
  },
  {
    id: "win_color",
    label: "Vitórias com deck de uma cor (que tenha a cor)",
    params: ["n", "color"],
    defaults: { n: 3, color: "B" },
    describe: ({ n = 1, color = "B" }) =>
      `Vencer ${n} ${plural(n, "vez", "vezes")} com um deck que tenha ${COLOR_NAMES[color] ?? color}.`,
  },
  {
    id: "win_mono",
    label: "Vitórias com deck monocolor",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 1 }) => `Vencer ${n} ${plural(n, "vez", "vezes")} com decks de uma cor só.`,
  },
  {
    id: "win_decks",
    label: "Vencer com decks diferentes (de K cores)",
    params: ["n", "k"],
    defaults: { n: 3, k: 0 },
    describe: ({ n = 2, k = 0 }) =>
      k
        ? `Vencer com ${n} decks diferentes de ${k} ${plural(k, "cor", "cores")}.`
        : `Vencer com ${n} decks diferentes.`,
  },
  {
    id: "late_games",
    label: "Partidas depois da meia-noite (0h–5h)",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 1 }) => `Jogar ${n} ${plural(n, "partida", "partidas")} entre meia-noite e 5h.`,
  },
  {
    id: "games_same_day",
    label: "Partidas no mesmo dia",
    params: ["n"],
    defaults: { n: 8 },
    describe: ({ n = 2 }) => `Jogar ${n} partidas no mesmo dia.`,
  },
  {
    id: "comeback",
    label: "Vencer depois de N derrotas seguidas",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 1 }) => `Vencer logo depois de ${n} ${plural(n, "derrota", "derrotas")} seguidas.`,
  },
  {
    id: "kill_leader",
    label: "Eliminar o líder da temporada",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 1 }) => `Eliminar ${n} ${plural(n, "vez", "vezes")} quem liderava a temporada naquele momento.`,
  },
  {
    id: "win_all_seats",
    label: "Vencer em todos os 4 assentos",
    params: [],
    defaults: {},
    describe: () => "Vencer jogando em cada um dos 4 assentos (1º, 2º, 3º e 4º a jogar).",
  },
  {
    id: "color_pairs",
    label: "Jogar com pares de cores diferentes (guildas)",
    params: ["n"],
    defaults: { n: 5 },
    describe: ({ n = 1 }) => `Jogar com decks de ${n} pares de cores diferentes.`,
  },
  {
    id: "weeks_played",
    label: "Jogar em semanas diferentes",
    params: ["n"],
    defaults: { n: 8 },
    describe: ({ n = 1 }) => `Jogar em ${n} ${plural(n, "semana diferente", "semanas diferentes")} da temporada.`,
  },
  {
    id: "podium",
    label: "Terminar entre os N primeiros (no encerramento)",
    params: ["n"],
    defaults: { n: 3 },
    describe: ({ n = 3 }) =>
      n === 1 ? "Terminar a temporada em 1º lugar." : `Terminar a temporada entre os ${n} primeiros.`,
    final: true,
  },
  {
    id: "champion",
    label: "Terminar em 1º lugar (no encerramento)",
    params: [],
    defaults: {},
    describe: () => "Terminar a temporada em 1º lugar no ranking.",
    final: true,
  },
];

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
export { KILL_REASONS };

// ---------------------------------------------------------------- Definições

/** Conquista de temporada como o root monta (tema ou base). */
export interface SeasonAchievementInput {
  key: string;
  name: string;
  icon: SeasonIcon;
  rarity: Rarity;
  template: TemplateId;
  params: TemplateParams;
  /** Base do código com números para 13 semanas: ajusta à duração da temporada. */
  scale?: boolean;
}

/** Conquista congelada numa temporada (com descrição e alvo já resolvidos). */
export interface SeasonAchievement extends SeasonAchievementInput {
  description: string;
  /** Alvo da barra de progresso (contagens). */
  target: number;
  /** Conta para a Lenda (todas menos Campeão). */
  required: boolean;
  /** "base" (todas as temporadas) ou "tema". */
  source: "base" | "tema";
}

/** Lista base do jogo (números pensados para uma temporada de 13 semanas). */
export const BASE_SEASON_ACHIEVEMENTS: SeasonAchievementInput[] = [
  { key: "abre-alas", name: "Abre-alas", icon: "party", rarity: "common", template: "wins", params: { n: 1 } },
  {
    key: "frequentador",
    name: "Frequentador",
    icon: "calendar",
    rarity: "uncommon",
    template: "weeks_played",
    params: { n: 8 },
    scale: true,
  },
  {
    key: "carrasco",
    name: "Carrasco da temporada",
    icon: "axe",
    rarity: "uncommon",
    template: "kills",
    params: { n: 15 },
    scale: true,
  },
  {
    key: "comandante-letal",
    name: "Comandante letal",
    icon: "crown",
    rarity: "uncommon",
    template: "kills",
    params: { n: 5, reason: "Dano de Comandante" },
    scale: true,
  },
  {
    key: "ladrao",
    name: "Ladrão da temporada",
    icon: "mask",
    rarity: "uncommon",
    template: "win_borrowed",
    params: { n: 1 },
  },
  {
    key: "hat-trick",
    name: "Hat-trick da temporada",
    icon: "flame",
    rarity: "rare",
    template: "win_streak",
    params: { n: 3 },
  },
  {
    key: "massacre",
    name: "Massacre da temporada",
    icon: "skull",
    rarity: "rare",
    template: "kills_in_match",
    params: { n: 3 },
  },
  {
    key: "versatil",
    name: "Versátil da temporada",
    icon: "shuffle",
    rarity: "rare",
    template: "win_decks",
    params: { n: 3, k: 0 },
  },
  { key: "podio", name: "Pódio", icon: "medal", rarity: "rare", template: "podium", params: { n: 3 } },
  { key: "campeao", name: "Campeão da temporada", icon: "trophy", rarity: "mythic", template: "champion", params: {} },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Monta a lista congelada de uma temporada: base (com números ajustados à duração) + temáticas. */
export function freezeAchievements(
  base: SeasonAchievementInput[],
  theme: SeasonAchievementInput[],
  startsAt: Date,
  endsAt: Date,
): SeasonAchievement[] {
  const weeks = Math.max(1, (endsAt.getTime() - startsAt.getTime()) / WEEK_MS);
  const resolve = (a: SeasonAchievementInput, source: "base" | "tema"): SeasonAchievement => {
    const tpl = TEMPLATE_BY_ID.get(a.template)!;
    const params = { ...tpl.defaults, ...a.params };
    if (a.scale && params.n) params.n = Math.max(1, Math.round((params.n * weeks) / 13));
    return {
      ...a,
      params,
      source,
      description: tpl.describe(params),
      target: a.template === "win_all_seats" ? 4 : tpl.final ? 1 : (params.n ?? 1),
      required: a.template !== "champion",
    };
  };
  return [...base.map((a) => resolve(a, "base")), ...theme.map((a) => resolve(a, "tema"))];
}

// ---------------------------------------------------------------- Temporadas

export interface SeasonTheme {
  name: string;
  description: string | null;
  color: string;
  banner: string | null;
  banner_credit: string | null;
  title_lenda: string;
  title_coroa: string;
}

export interface Season {
  id: string;
  number: number;
  theme_id: string | null;
  theme: SeasonTheme;
  achievements: SeasonAchievement[];
  starts_at: string;
  ends_at: string;
  closed_at: string | null;
}

export type SeasonStatus = "upcoming" | "active" | "ended" | "closed";

export function seasonStatus(s: Pick<Season, "starts_at" | "ends_at" | "closed_at">, now = new Date()): SeasonStatus {
  if (s.closed_at) return "closed";
  if (now < new Date(s.starts_at)) return "upcoming";
  if (now < new Date(s.ends_at)) return "active";
  return "ended"; // passou da data, aguardando o encerramento automático
}

export const seasonLabel = (s: Pick<Season, "number" | "theme">) => `T${s.number} · ${s.theme.name}`;

/** Títulos: chave gravada em users.display_title. */
export type TitleKind = "lenda" | "coroa";
export interface DisplayTitle {
  key: string;
  label: string;
  color: string;
  kind: TitleKind;
}
export const titleFor = (s: Pick<Season, "number" | "theme">, kind: TitleKind): DisplayTitle => ({
  key: `${s.number}:${kind}`,
  label: `${kind === "lenda" ? s.theme.title_lenda : s.theme.title_coroa} · T${s.number}`,
  color: s.theme.color,
  kind,
});

// ---------------------------------------------------------------- Cálculo

export interface SeasonPart {
  match_id: string;
  pilot_id: string;
  deck_id: string;
  deck_owner_id: string;
  color_identity_snapshot: string[] | null;
  is_winner: boolean;
  seat_order: number | null;
  elimination_reason: string | null;
  eliminated_by: string | null;
  played_at: string;
}

interface State {
  games: number;
  wins: number;
  kills: number;
  killsByReason: Record<string, number>;
  winStreak: number;
  bestWinStreak: number;
  bestKillsInMatch: number;
  borrowedWins: number;
  winsWithColor: Record<string, number>;
  monoWins: number;
  winDecks: Map<number, Set<string>>;
  lateGames: number;
  gamesByDay: Map<string, number>;
  bestDayGames: number;
  lossStreak: number;
  bestComeback: number;
  leaderKills: number;
  winSeats: Set<number>;
  colorPairs: Set<string>;
  weeks: Set<string>;
}

const newState = (): State => ({
  games: 0,
  wins: 0,
  kills: 0,
  killsByReason: {},
  winStreak: 0,
  bestWinStreak: 0,
  bestKillsInMatch: 0,
  borrowedWins: 0,
  winsWithColor: {},
  monoWins: 0,
  winDecks: new Map(),
  lateGames: 0,
  gamesByDay: new Map(),
  bestDayGames: 0,
  lossStreak: 0,
  bestComeback: 0,
  leaderKills: 0,
  winSeats: new Set(),
  colorPairs: new Set(),
  weeks: new Set(),
});

/** Valor atual de uma conquista de contagem. */
function metric(a: SeasonAchievement, s: State): number {
  const p = a.params;
  switch (a.template) {
    case "kills":
      return p.reason ? (s.killsByReason[p.reason] ?? 0) : s.kills;
    case "wins":
      return s.wins;
    case "games":
      return s.games;
    case "win_streak":
      return s.bestWinStreak;
    case "kills_in_match":
      return s.bestKillsInMatch;
    case "win_borrowed":
      return s.borrowedWins;
    case "win_color":
      return s.winsWithColor[p.color ?? ""] ?? 0;
    case "win_mono":
      return s.monoWins;
    case "win_decks":
      return s.winDecks.get(p.k ?? 0)?.size ?? 0;
    case "late_games":
      return s.lateGames;
    case "games_same_day":
      return s.bestDayGames;
    case "comeback":
      return s.bestComeback;
    case "kill_leader":
      return s.leaderKills;
    case "win_all_seats":
      return s.winSeats.size;
    case "color_pairs":
      return s.colorPairs.size;
    case "weeks_played":
      return s.weeks.size;
    default:
      return 0; // pódio e campeão: decididos no encerramento
  }
}

/** Horário de Brasília (UTC−3, sem horário de verão). */
const spLocal = (iso: string) => new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
const spDay = (iso: string) => spLocal(iso).toISOString().slice(0, 10);
const spHour = (iso: string) => spLocal(iso).getUTCHours();
/** Segunda-feira da semana (horário de Brasília). */
const spWeek = (iso: string) => {
  const d = spLocal(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export interface SeasonUnlock {
  key: string;
  playerId: string;
  matchId: string;
  at: string;
}

type Totals = { points: number; wins: number; kills: number; games: number };
const byStanding = (a: [string, Totals], b: [string, Totals]) =>
  b[1].points - a[1].points || b[1].wins - a[1].wins || b[1].kills - a[1].kills || b[1].games - a[1].games;

/**
 * Conquistas de partida de uma temporada (sem pódio/campeão/títulos, que saem no
 * encerramento). `parts`: participações aprovadas dentro do período, de todos.
 */
export function computeSeasonUnlocks(season: Season, parts: SeasonPart[], visible: Set<string>) {
  const states = new Map<string, State>();
  const state = (id: string) => states.get(id) ?? (states.set(id, newState()), states.get(id)!);
  const unlocks: SeasonUnlock[] = [];
  const done = new Set<string>();
  const counters = season.achievements.filter((a) => !TEMPLATE_BY_ID.get(a.template)?.final);
  const totals = new Map<string, Totals>();

  const tables = [...Map.groupBy(parts, (p) => p.match_id).values()].sort(
    (a, b) => a[0].played_at.localeCompare(b[0].played_at) || a[0].match_id.localeCompare(b[0].match_id),
  );
  for (const table of tables) {
    const scores = scoreMatch(table);
    const leader = [...totals.entries()].filter(([id]) => visible.has(id)).sort(byStanding)[0]?.[0] ?? null;

    for (const p of table) {
      const s = state(p.pilot_id);
      const sc = scores.get(p.pilot_id)!;
      const colors = (p.color_identity_snapshot ?? []).filter((c) => "WUBRG".includes(c));
      s.games++;
      s.kills += sc.kills;
      for (const [r, n] of Object.entries(sc.killsByReason)) s.killsByReason[r] = (s.killsByReason[r] ?? 0) + n;
      s.bestKillsInMatch = Math.max(s.bestKillsInMatch, sc.kills);
      if (spHour(p.played_at) < 5) s.lateGames++;
      const day = spDay(p.played_at);
      s.gamesByDay.set(day, (s.gamesByDay.get(day) ?? 0) + 1);
      s.bestDayGames = Math.max(s.bestDayGames, s.gamesByDay.get(day)!);
      s.weeks.add(spWeek(p.played_at));
      if (colors.length === 2) s.colorPairs.add([...colors].sort().join(""));
      if (
        leader &&
        leader !== p.pilot_id &&
        table.some((v) => v.pilot_id === leader && !v.is_winner && v.eliminated_by === p.pilot_id)
      )
        s.leaderKills++;
      if (p.is_winner) {
        s.wins++;
        s.winStreak++;
        s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
        s.bestComeback = Math.max(s.bestComeback, s.lossStreak);
        s.lossStreak = 0;
        if (p.deck_owner_id !== p.pilot_id) s.borrowedWins++;
        for (const c of colors) s.winsWithColor[c] = (s.winsWithColor[c] ?? 0) + 1;
        if (colors.length === 1) s.monoWins++;
        for (const k of [0, colors.length]) {
          const set = s.winDecks.get(k) ?? new Set<string>();
          set.add(p.deck_id);
          s.winDecks.set(k, set);
        }
        if (p.seat_order) s.winSeats.add(p.seat_order);
      } else {
        s.winStreak = 0;
        s.lossStreak++;
      }

      if (!visible.has(p.pilot_id)) continue;
      for (const a of counters) {
        const k = `${p.pilot_id}:${a.key}`;
        if (!done.has(k) && metric(a, s) >= a.target) {
          done.add(k);
          unlocks.push({ key: a.key, playerId: p.pilot_id, matchId: p.match_id, at: p.played_at });
        }
      }
    }

    for (const p of table) {
      const t = totals.get(p.pilot_id) ?? { points: 0, wins: 0, kills: 0, games: 0 };
      const sc = scores.get(p.pilot_id)!;
      t.points += sc.points;
      t.kills += sc.kills;
      t.games++;
      if (p.is_winner) t.wins++;
      totals.set(p.pilot_id, t);
    }
  }

  const progress = new Map(
    [...states.entries()]
      .filter(([id]) => visible.has(id))
      .map(([id, s]) => [id, Object.fromEntries(counters.map((a) => [a.key, Math.min(metric(a, s), a.target)]))]),
  );
  const standings = [...totals.entries()].filter(([id]) => visible.has(id)).sort(byStanding);
  return { unlocks, progress, standings };
}

/**
 * Encerramento: pódio, campeão, Coroa (1º) e Lenda (todas as obrigatórias).
 * `have`: conquistas já gravadas por jogador (chaves).
 */
export function finalAwards(
  season: Season,
  standings: [string, Totals][],
  have: Map<string, Set<string>>,
): { key: string; playerId: string }[] {
  const awards: { key: string; playerId: string }[] = [];
  const give = (key: string, playerId: string) => {
    awards.push({ key, playerId });
    have.set(playerId, new Set([...(have.get(playerId) ?? []), key]));
  };
  for (const a of season.achievements) {
    if (a.template === "podium") standings.slice(0, a.params.n ?? 3).forEach(([id]) => give(a.key, id));
    if (a.template === "champion" && standings[0]) give(a.key, standings[0][0]);
  }
  if (standings[0]) give("coroa", standings[0][0]);
  const required = season.achievements.filter((a) => a.required).map((a) => a.key);
  for (const [id] of standings) {
    const mine = have.get(id) ?? new Set();
    if (required.length && required.every((k) => mine.has(k))) give("lenda", id);
  }
  return awards;
}

/** Nome das chaves especiais (títulos) para exibição. */
export const TITLE_KEYS = new Set(["lenda", "coroa"]);
