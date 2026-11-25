import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Archive,
  BadgeCheck,
  Copy,
  Gem,
  Ghost,
  Hammer,
  Key,
  Landmark,
  Package,
  Palette,
  Store,
  Armchair,
  Axe,
  BookOpen,
  BookX,
  CloudRain,
  Drama,
  GraduationCap,
  House,
  KeyRound,
  Moon,
  Puzzle,
  Redo2,
  ScrollText,
  RefreshCw,
  Repeat,
  Sword,
  Timer,
  Trophy,
  Utensils,
  Bomb,
  Crown,
  Droplet,
  Flag,
  FlaskConical,
  Flame,
  Gift,
  Handshake,
  HeartCrack,
  Hourglass,
  Infinity as InfinityIcon,
  Library,
  Rainbow,
  Shield,
  Shuffle,
  Skull,
  Swords,
  Target,
  TrendingUp,
  Undo2,
  VenetianMask,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { eliminationKind } from "@/lib/elimination";
import { scoreMatch, type MatchScore } from "@/lib/scoring";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * Conquistas: selos calculados do histórico de partidas aprovadas (valem para
 * trás e se ajustam sozinhos quando uma partida é corrigida). O root é
 * invisível: não ganha conquistas, mas as partidas dele contam como mesa.
 */

/** Raridade no estilo dos símbolos de expansão do Magic. */
export type Rarity = "common" | "uncommon" | "rare" | "mythic";
export type Category = "abates" | "vitorias" | "jornada" | "colecao" | "secretas";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Rara",
  mythic: "Mítica",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  abates: "Abates",
  vitorias: "Vitórias",
  jornada: "Jornada",
  colecao: "Coleção",
  secretas: "Secretas",
};

interface PlayerState {
  games: number;
  wins: number;
  ownWins: number;
  borrowedGames: number;
  seats: Set<number>;
  /** Partidas por dia (horário de Brasília) e o recorde num dia só. */
  gamesByDay: Map<string, number>;
  bestDayGames: number;
  bestLossStreak: number;
  kills: number;
  killsByReason: Record<string, number>;
  selfDeaths: number;
  concedes: number;
  deckGames: Map<string, number>;
  winDecks: Set<string>;
  commanders: Set<string>;
  colors: Set<string>;
  winStreak: number;
  bestWinStreak: number;
  lossStreak: number;
  /** Eliminado pela mesma pessoa em partidas seguidas. */
  killer: { by: string | null; n: number };
  bestKillerStreak: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  category: Category;
  icon: LucideIcon;
  /** Secreta: nome e condição ficam escondidos até alguém do grupo liberar. */
  secret?: boolean;
  /** Níveis da mesma conquista (I, II, III) compartilham a família. */
  family?: string;
  /** Conquistas de contagem: alvo e valor atual (para a barra de progresso). */
  target?: number;
  metric?: (s: PlayerState) => number;
}

const ROMAN = ["I", "II", "III"];

/** Conquista de contagem em níveis: [alvo, raridade] de cada nível. */
function tiers(
  base: { id: string; name: string; category: Category; icon: LucideIcon; metric: (s: PlayerState) => number },
  describe: (n: number) => string,
  levels: [number, Rarity][],
): AchievementDef[] {
  return levels.map(([target, rarity], i) => ({
    ...base,
    id: `${base.id}-${i + 1}`,
    name: `${base.name} ${ROMAN[i]}`,
    description: describe(target),
    rarity,
    target,
    family: base.id,
  }));
}

const reason = (r: string) => (s: PlayerState) => s.killsByReason[r] ?? 0;

/**
 * Catálogo. Os números foram calibrados para um grupo que joga de 6 a 15
 * partidas por semana. Mudar um alvo vale para todo o histórico.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  // Abates
  {
    id: "na-porrada",
    name: "Na porrada",
    description: "Eliminar alguém em combate.",
    rarity: "common",
    category: "abates",
    icon: Sword,
    target: 1,
    metric: reason("Combate"),
  },
  {
    id: "pecas-no-lugar",
    name: "Peças no lugar",
    description: "Eliminar alguém por combo.",
    rarity: "common",
    category: "abates",
    icon: Puzzle,
    target: 1,
    metric: reason("Combo"),
  },
  {
    id: "primeiro-sangue",
    name: "Primeiro sangue",
    description: "Eliminar um oponente pela primeira vez.",
    rarity: "common",
    category: "abates",
    icon: Droplet,
    target: 1,
    metric: (s) => s.kills,
  },
  ...tiers(
    {
      id: "carrasco-comandante",
      name: "Carrasco de comandante",
      category: "abates",
      icon: Crown,
      metric: reason("Dano de Comandante"),
    },
    (n) => (n === 1 ? "Eliminar alguém por dano de comandante." : `Eliminar ${n} oponentes por dano de comandante.`),
    [
      [1, "common"],
      [10, "uncommon"],
      [25, "rare"],
    ],
  ),
  ...tiers(
    { id: "toque-venenoso", name: "Toque venenoso", category: "abates", icon: FlaskConical, metric: reason("Veneno") },
    (n) => (n === 1 ? "Eliminar alguém por veneno." : `Eliminar ${n} oponentes por veneno.`),
    [
      [1, "uncommon"],
      [5, "rare"],
      [15, "mythic"],
    ],
  ),
  {
    id: "bibliotecario",
    name: "Bibliotecário",
    description: "Eliminar alguém deixando o grimório vazio (mill).",
    rarity: "uncommon",
    category: "abates",
    icon: BookOpen,
    target: 1,
    metric: reason("Mill (grimório vazio) do inimigo"),
  },
  {
    id: "mestre-combo",
    name: "Mestre do combo",
    description: "Eliminar 5 oponentes por combo.",
    rarity: "uncommon",
    category: "abates",
    icon: InfinityIcon,
    target: 5,
    metric: reason("Combo"),
  },
  {
    id: "massacre",
    name: "Massacre",
    description: "Eliminar 3 oponentes na mesma partida.",
    rarity: "rare",
    category: "abates",
    icon: Skull,
  },
  {
    id: "mesa-limpa",
    name: "Mesa limpa",
    description: "Vencer tendo eliminado todos os oponentes (mesa com 4 ou mais jogadores).",
    rarity: "mythic",
    category: "abates",
    icon: Swords,
  },
  {
    id: "vinganca",
    name: "Vingança",
    description: "Eliminar quem te eliminou na última mesa entre vocês.",
    rarity: "uncommon",
    category: "abates",
    icon: Undo2,
  },
  // Vitórias
  {
    id: "primeira-vitoria",
    name: "Primeira vitória",
    description: "Vencer uma partida.",
    rarity: "common",
    category: "vitorias",
    icon: Trophy,
    target: 1,
    metric: (s) => s.wins,
  },
  {
    id: "prata-da-casa",
    name: "Prata da casa",
    description: "Vencer com um deck seu.",
    rarity: "common",
    category: "vitorias",
    icon: House,
    target: 1,
    metric: (s) => s.ownWins,
  },
  {
    id: "hat-trick",
    name: "Hat-trick",
    description: "Vencer 3 partidas seguidas.",
    rarity: "rare",
    category: "vitorias",
    icon: Flame,
    target: 3,
    metric: (s) => s.bestWinStreak,
  },
  {
    id: "imparavel",
    name: "Imparável",
    description: "Vencer 5 partidas seguidas.",
    rarity: "mythic",
    category: "vitorias",
    icon: Zap,
    target: 5,
    metric: (s) => s.bestWinStreak,
  },
  {
    id: "ladrao-decks",
    name: "Ladrão de decks",
    description: "Vencer com o deck de outra pessoa.",
    rarity: "uncommon",
    category: "vitorias",
    icon: VenetianMask,
  },
  {
    id: "anfitriao",
    name: "Anfitrião generoso",
    description: "Um deck seu vencer na mão de outra pessoa.",
    rarity: "uncommon",
    category: "vitorias",
    icon: Gift,
  },
  {
    id: "davi-golias",
    name: "Davi contra Golias",
    description:
      "Vencer uma mesa em que estava o líder do ranking naquele momento (com 10+ partidas e sozinho na frente).",
    rarity: "rare",
    category: "vitorias",
    icon: Target,
  },
  {
    id: "fechando-rodada",
    name: "Fechando a rodada",
    description: "Vencer jogando no último assento.",
    rarity: "uncommon",
    category: "vitorias",
    icon: Hourglass,
  },
  {
    id: "versatil",
    name: "Versátil",
    description: "Vencer com 3 decks diferentes.",
    rarity: "rare",
    category: "vitorias",
    icon: Shuffle,
    target: 3,
    metric: (s) => s.winDecks.size,
  },
  {
    id: "volta-por-cima",
    name: "Volta por cima",
    description: "Vencer depois de 8 derrotas seguidas.",
    rarity: "uncommon",
    category: "vitorias",
    icon: TrendingUp,
  },
  // Jornada
  {
    id: "sentou-a-mesa",
    name: "Sentou à mesa",
    description: "Jogar a primeira partida.",
    rarity: "common",
    category: "jornada",
    icon: Armchair,
    target: 1,
    metric: (s) => s.games,
  },
  {
    id: "calouro",
    name: "Calouro",
    description: "Jogar 5 partidas.",
    rarity: "common",
    category: "jornada",
    icon: GraduationCap,
    target: 5,
    metric: (s) => s.games,
  },
  {
    id: "pegando-emprestado",
    name: "Pegando emprestado",
    description: "Jogar com o deck de outra pessoa.",
    rarity: "common",
    category: "jornada",
    icon: Repeat,
    target: 1,
    metric: (s) => s.borrowedGames,
  },
  {
    id: "deck-de-aluguel",
    name: "Deck de aluguel",
    description: "Um deck seu ser pilotado por outra pessoa.",
    rarity: "common",
    category: "jornada",
    icon: KeyRound,
  },
  {
    id: "rodizio",
    name: "Rodízio",
    description: "Jogar em 4 assentos diferentes (1º, 2º, 3º e 4º a jogar).",
    rarity: "common",
    category: "jornada",
    icon: RefreshCw,
    target: 4,
    metric: (s) => s.seats.size,
  },
  ...tiers(
    { id: "veterano", name: "Veterano", category: "jornada", icon: Shield, metric: (s) => s.games },
    (n) => `Jogar ${n} partidas.`,
    [
      [25, "common"],
      [100, "uncommon"],
      [250, "rare"],
    ],
  ),
  {
    id: "arco-iris",
    name: "Arco-íris",
    description: "Jogar com as 5 cores ao longo dos decks pilotados.",
    rarity: "uncommon",
    category: "jornada",
    icon: Rainbow,
    target: 5,
    metric: (s) => s.colors.size,
  },
  {
    id: "colecionador",
    name: "Colecionador",
    description: "Jogar com 10 comandantes diferentes.",
    rarity: "rare",
    category: "jornada",
    icon: Library,
    target: 10,
    metric: (s) => s.commanders.size,
  },
  {
    id: "fiel-escudeiro",
    name: "Fiel escudeiro",
    description: "Jogar 30 partidas com o mesmo deck.",
    rarity: "uncommon",
    category: "jornada",
    icon: Handshake,
    target: 30,
    metric: (s) => Math.max(0, ...s.deckGames.values()),
  },
  // Coleção (cartas, decks e empréstimos cadastrados; ver computeCollectionAchievements)
  {
    id: "primeira-carta",
    name: "Primeira carta",
    description: "Registrar uma carta na coleção.",
    rarity: "common",
    category: "colecao",
    icon: Package,
    target: 1,
  },
  ...[
    [100, "common"],
    [500, "uncommon"],
    [1500, "rare"],
  ].map(([target, rarity], i) => ({
    id: `acervo-${i + 1}`,
    name: `Acervo ${ROMAN[i]}`,
    description: `Ter ${target} cartas na coleção (somando as cópias).`,
    rarity: rarity as Rarity,
    category: "colecao" as const,
    icon: Archive,
    target: target as number,
    family: "acervo",
  })),
  {
    id: "paleta-completa",
    name: "Paleta completa",
    description: "Ter na coleção cartas das 5 cores.",
    rarity: "common",
    category: "colecao",
    icon: Palette,
    target: 5,
  },
  {
    id: "salao-das-lendas",
    name: "Salão das lendas",
    description: "Ter 25 criaturas lendárias diferentes na coleção.",
    rarity: "uncommon",
    category: "colecao",
    icon: Landmark,
    target: 25,
  },
  {
    id: "balcao-de-trocas",
    name: "Balcão de trocas",
    description: "Marcar 5 cartas da coleção como disponíveis para troca.",
    rarity: "common",
    category: "colecao",
    icon: Store,
    target: 5,
  },
  {
    id: "construtor",
    name: "Construtor",
    description: "Cadastrar o primeiro deck.",
    rarity: "common",
    category: "colecao",
    icon: Hammer,
    target: 1,
  },
  {
    id: "arquiteto",
    name: "Arquiteto",
    description: "Ter 5 decks cadastrados.",
    rarity: "uncommon",
    category: "colecao",
    icon: Gem,
    target: 5,
  },
  {
    id: "chave-da-casa",
    name: "Chave da casa",
    description: "Liberar um deck seu para outra pessoa usar.",
    rarity: "common",
    category: "colecao",
    icon: Key,
  },
  {
    id: "papel-de-verdade",
    name: "Papel de verdade",
    description: "Ter um deck ativo com a lista completa (99+ cartas) e nenhum proxy.",
    rarity: "uncommon",
    category: "colecao",
    icon: BadgeCheck,
  },
  {
    id: "proxy-zero",
    name: "Proxy zero",
    description: "Ter 3 decks ativos com a lista completa e nenhum proxy em nenhum deles.",
    rarity: "rare",
    category: "colecao",
    icon: ScrollText,
    target: 3,
  },
  // Secretas (humor): a condição só aparece depois que alguém libera
  {
    id: "kamikaze",
    name: "Kamikaze",
    description: "Morrer 3 vezes por conta própria.",
    rarity: "uncommon",
    category: "secretas",
    icon: Bomb,
    secret: true,
    target: 3,
    metric: (s) => s.selfDeaths,
  },
  {
    id: "bandeira-branca",
    name: "Bandeira branca",
    description: "Conceder 5 partidas.",
    rarity: "uncommon",
    category: "secretas",
    icon: Flag,
    secret: true,
    target: 5,
    metric: (s) => s.concedes,
  },
  {
    id: "saco-de-pancadas",
    name: "Saco de pancadas",
    description: "Ser eliminado pela mesma pessoa em 3 partidas seguidas.",
    rarity: "uncommon",
    category: "secretas",
    icon: HeartCrack,
    secret: true,
    target: 3,
    metric: (s) => s.bestKillerStreak,
  },
  {
    id: "mare-de-azar",
    name: "Maré de azar",
    description: "Perder 10 partidas seguidas.",
    rarity: "uncommon",
    category: "secretas",
    icon: CloudRain,
    secret: true,
    target: 10,
    metric: (s) => s.bestLossStreak,
  },
  {
    id: "bumerangue",
    name: "Bumerangue",
    description: "Ser eliminado por quem você eliminou na última mesa entre vocês.",
    rarity: "uncommon",
    category: "secretas",
    icon: Redo2,
    secret: true,
  },
  {
    id: "fogo-amigo",
    name: "Fogo amigo",
    description: "Eliminar o dono do deck que você está pilotando.",
    rarity: "rare",
    category: "secretas",
    icon: Axe,
    secret: true,
  },
  {
    id: "traido",
    name: "Traído",
    description: "Ser eliminado por alguém pilotando um deck seu.",
    rarity: "uncommon",
    category: "secretas",
    icon: Drama,
    secret: true,
  },
  {
    id: "coruja",
    name: "Coruja",
    description: "Jogar uma partida entre meia-noite e 5h da manhã.",
    rarity: "common",
    category: "secretas",
    icon: Moon,
    secret: true,
  },
  {
    id: "maratonista",
    name: "Maratonista",
    description: "Jogar 8 partidas no mesmo dia.",
    rarity: "uncommon",
    category: "secretas",
    icon: Timer,
    secret: true,
    target: 8,
    metric: (s) => s.bestDayGames,
  },
  {
    id: "leitor-voraz",
    name: "Leitor voraz",
    description: "Morrer por mill próprio (comprar do grimório vazio).",
    rarity: "uncommon",
    category: "secretas",
    icon: BookX,
    secret: true,
  },
  {
    id: "comendo-pelas-beiradas",
    name: "Comendo pelas beiradas",
    description: "Vencer sem eliminar ninguém, numa mesa com 4 ou mais jogadores.",
    rarity: "uncommon",
    category: "secretas",
    icon: Utensils,
    secret: true,
  },
  {
    id: "acumulador",
    name: "Acumulador",
    description:
      "Ter 4 ou mais cópias da mesma carta na coleção (sem contar terrenos básicos) — num formato singleton.",
    rarity: "common",
    category: "secretas",
    icon: Copy,
    secret: true,
  },
  {
    id: "rei-do-proxy",
    name: "Rei do proxy",
    description: "Usar 50 proxies somando os decks ativos.",
    rarity: "uncommon",
    category: "secretas",
    icon: Ghost,
    secret: true,
    target: 50,
  },
];

/** Partidas mínimas para o líder do ranking contar no "Davi contra Golias". */
const LEADER_MIN_GAMES = 10;

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Entram na linha do tempo do grupo e na Gazeta: só os feitos maiores. */
export const isHighlight = (a: AchievementDef) => a.secret || a.rarity === "rare" || a.rarity === "mythic";

export interface Unlock {
  id: string;
  playerId: string;
  matchId: string;
  at: string;
}

export interface AchievementPlayer {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface Achievements {
  players: AchievementPlayer[];
  /** Em ordem cronológica. */
  unlocks: Unlock[];
  /** Valor atual de cada conquista de contagem, por jogador. */
  progress: Map<string, Map<string, number>>;
}

interface Part {
  match_id: string;
  pilot_id: string;
  deck_id: string;
  deck_owner_id: string;
  commander_snapshot: string;
  color_identity_snapshot: string[] | null;
  is_winner: boolean;
  seat_order: number | null;
  elimination_reason: string | null;
  eliminated_by: string | null;
  played_at: string;
}

/** Horário de Brasília (UTC−3, sem horário de verão). */
const spLocal = (iso: string) => new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
const spDay = (iso: string) => spLocal(iso).toISOString().slice(0, 10);
const spHour = (iso: string) => spLocal(iso).getUTCHours();

const newState = (): PlayerState => ({
  games: 0,
  wins: 0,
  ownWins: 0,
  borrowedGames: 0,
  seats: new Set(),
  gamesByDay: new Map(),
  bestDayGames: 0,
  bestLossStreak: 0,
  kills: 0,
  killsByReason: {},
  selfDeaths: 0,
  concedes: 0,
  deckGames: new Map(),
  winDecks: new Set(),
  commanders: new Set(),
  colors: new Set(),
  winStreak: 0,
  bestWinStreak: 0,
  lossStreak: 0,
  killer: { by: null, n: 0 },
  bestKillerStreak: 0,
});

/** Calcula as conquistas de todos a partir das participações aprovadas. */
export function computeAchievements(parts: Part[], players: AchievementPlayer[]): Achievements {
  const visible = new Set(players.map((p) => p.id));
  const states = new Map<string, PlayerState>();
  const state = (id: string) => states.get(id) ?? (states.set(id, newState()), states.get(id)!);
  const unlocked = new Set<string>();
  const unlocks: Unlock[] = [];
  const unlock = (id: string, playerId: string, match: Part) => {
    const k = `${playerId}:${id}`;
    if (!visible.has(playerId) || unlocked.has(k)) return;
    unlocked.add(k);
    unlocks.push({ id, playerId, matchId: match.match_id, at: match.played_at });
  };

  // Pontos acumulados (para saber quem liderava o ranking antes de cada partida)
  const totals = new Map<string, { points: number; wins: number; kills: number; games: number }>();
  /** Líder de verdade: pelo menos 10 partidas e sozinho na frente em pontos. */
  const leader = () => {
    const [first, second] = [...totals.entries()]
      .filter(([id]) => visible.has(id))
      .sort((a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins || b[1].kills - a[1].kills);
    if (!first || first[1].games < LEADER_MIN_GAMES) return null;
    return !second || first[1].points > second[1].points ? first[0] : null;
  };
  // "A:B" → B eliminou A na última mesa em que os dois estavam
  const lastKilledBy = new Map<string, boolean>();

  const tables = [...Map.groupBy(parts, (p) => p.match_id).values()].sort(
    (a, b) => a[0].played_at.localeCompare(b[0].played_at) || a[0].match_id.localeCompare(b[0].match_id),
  );

  for (const table of tables) {
    const scores = scoreMatch(table);
    const leaderBefore = leader();
    const maxSeat = Math.max(0, ...table.map((p) => p.seat_order ?? 0));

    for (const p of table) {
      const s = state(p.pilot_id);
      const sc: MatchScore = scores.get(p.pilot_id)!;
      const lossesBefore = s.lossStreak;

      // Atualiza o estado
      s.games++;
      if (p.deck_owner_id !== p.pilot_id) s.borrowedGames++;
      if (p.seat_order) s.seats.add(p.seat_order);
      const day = spDay(p.played_at);
      s.gamesByDay.set(day, (s.gamesByDay.get(day) ?? 0) + 1);
      s.bestDayGames = Math.max(s.bestDayGames, s.gamesByDay.get(day)!);
      s.kills += sc.kills;
      for (const [r, n] of Object.entries(sc.killsByReason)) s.killsByReason[r] = (s.killsByReason[r] ?? 0) + n;
      if (sc.selfDeath) s.selfDeaths++;
      if (!p.is_winner && p.elimination_reason === "Concedeu") s.concedes++;
      s.deckGames.set(p.deck_id, (s.deckGames.get(p.deck_id) ?? 0) + 1);
      s.commanders.add(p.commander_snapshot);
      for (const c of p.color_identity_snapshot ?? []) if ("WUBRG".includes(c)) s.colors.add(c);
      if (p.is_winner) {
        s.wins++;
        if (p.deck_owner_id === p.pilot_id) s.ownWins++;
        s.winDecks.add(p.deck_id);
        s.winStreak++;
        s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
        s.lossStreak = 0;
      } else {
        s.winStreak = 0;
        s.lossStreak++;
        s.bestLossStreak = Math.max(s.bestLossStreak, s.lossStreak);
      }
      if (!p.is_winner && p.eliminated_by) {
        s.killer = { by: p.eliminated_by, n: s.killer.by === p.eliminated_by ? s.killer.n + 1 : 1 };
      } else {
        s.killer = { by: null, n: 0 };
      }
      s.bestKillerStreak = Math.max(s.bestKillerStreak, s.killer.n);

      // Conquistas de contagem
      for (const a of ACHIEVEMENTS) if (a.metric && a.metric(s) >= a.target!) unlock(a.id, p.pilot_id, p);

      // Conquistas de momento
      const victims = table.filter((v) => !v.is_winner && v.eliminated_by === p.pilot_id);
      if (sc.kills >= 3) unlock("massacre", p.pilot_id, p);
      if (p.is_winner && table.length >= 4 && sc.kills === table.length - 1) unlock("mesa-limpa", p.pilot_id, p);
      for (const v of victims) {
        // Vingança de quem eliminou; bumerangue (secreta) para quem levou o troco
        if (lastKilledBy.get(`${p.pilot_id}:${v.pilot_id}`)) {
          unlock("vinganca", p.pilot_id, p);
          unlock("bumerangue", v.pilot_id, p);
        }
        // Eliminou o dono do deck que pilotava: fogo amigo para um, traição para o outro
        if (v.pilot_id === p.deck_owner_id) {
          unlock("fogo-amigo", p.pilot_id, p);
          unlock("traido", v.pilot_id, p);
        }
      }
      if (p.deck_owner_id !== p.pilot_id) unlock("deck-de-aluguel", p.deck_owner_id, p);
      if (spHour(p.played_at) < 5) unlock("coruja", p.pilot_id, p);
      if (!p.is_winner && p.elimination_reason === "Mill próprio") unlock("leitor-voraz", p.pilot_id, p);
      // Só vale com todas as mortes da mesa registradas (partidas antigas não têm "eliminado por")
      const allDeathsKnown = table.every(
        (o) =>
          o.is_winner ||
          (o.elimination_reason && (eliminationKind(o.elimination_reason) !== "opponent" || o.eliminated_by)),
      );
      if (p.is_winner && table.length >= 4 && sc.kills === 0 && allDeathsKnown)
        unlock("comendo-pelas-beiradas", p.pilot_id, p);
      if (p.is_winner) {
        if (p.deck_owner_id !== p.pilot_id) {
          unlock("ladrao-decks", p.pilot_id, p);
          unlock("anfitriao", p.deck_owner_id, p);
        }
        if (leaderBefore && leaderBefore !== p.pilot_id && table.some((o) => o.pilot_id === leaderBefore))
          unlock("davi-golias", p.pilot_id, p);
        if (table.length >= 3 && p.seat_order && p.seat_order === maxSeat) unlock("fechando-rodada", p.pilot_id, p);
        if (lossesBefore >= 8) unlock("volta-por-cima", p.pilot_id, p);
      }
    }

    // Depois da partida: quem eliminou quem (para a Vingança) e pontos acumulados
    for (const a of table) {
      for (const b of table) {
        if (a.pilot_id !== b.pilot_id)
          lastKilledBy.set(`${a.pilot_id}:${b.pilot_id}`, !a.is_winner && a.eliminated_by === b.pilot_id);
      }
      const t = totals.get(a.pilot_id) ?? { points: 0, wins: 0, kills: 0, games: 0 };
      t.games++;
      const sc = scores.get(a.pilot_id)!;
      t.points += sc.points;
      t.kills += sc.kills;
      if (a.is_winner) t.wins++;
      totals.set(a.pilot_id, t);
    }
  }

  const progress = new Map(
    [...states.entries()]
      .filter(([id]) => visible.has(id))
      .map(([id, s]) => [id, new Map(ACHIEVEMENTS.filter((a) => a.metric).map((a) => [a.id, a.metric!(s)]))]),
  );
  return { players, unlocks, progress };
}

/** Dados de coleção usados pelas conquistas da categoria "colecao" (e duas secretas). */
export interface CollectionData {
  cards: {
    user_id: string;
    quantity: number;
    available_for_trade: boolean;
    color_identity: string[] | null;
    type_line: string | null;
    created_at: string;
  }[];
  decks: { id: string; owner_id: string; is_active: boolean; created_at: string }[];
  deckCards: { deck_id: string; quantity: number; is_proxy: boolean }[];
  permissions: { deck_id: string; user_id: string; created_at: string }[];
}

/** Total de cartas de um deck (com o comandante) para contar como lista completa. */
const FULL_DECK = 99;

/**
 * Conquistas de coleção. Não há histórico de cada mudança, então a data é a do
 * registro que fez a pessoa chegar lá (a N-ésima carta, o N-ésimo deck…).
 */
export function computeCollectionAchievements(data: CollectionData, players: AchievementPlayer[]) {
  const unlocks: Unlock[] = [];
  const progress = new Map<string, Map<string, number>>();
  const set = (playerId: string, id: string, value: number) => {
    const m = progress.get(playerId) ?? new Map<string, number>();
    m.set(id, value);
    progress.set(playerId, m);
  };
  const byDate = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  /** Data em que a soma acumulada atingiu o alvo (linhas em ordem de cadastro). */
  const reachedAt = <T extends { created_at: string }>(rows: T[], weight: (r: T) => number, target: number) => {
    let sum = 0;
    for (const r of rows) if ((sum += weight(r)) >= target) return r.created_at;
    return null;
  };
  const cardsByDeck = Map.groupBy(data.deckCards, (c) => c.deck_id);

  for (const { id: playerId } of players) {
    const give = (id: string, at: string | null) => {
      if (at) unlocks.push({ id, playerId, matchId: "", at });
    };
    const cards = byDate(data.cards.filter((c) => c.user_id === playerId));
    const decks = byDate(data.decks.filter((d) => d.owner_id === playerId));
    const active = decks.filter((d) => d.is_active);

    // Cartas
    const copies = cards.reduce((sum, c) => sum + c.quantity, 0);
    for (const a of ACHIEVEMENTS.filter((x) => x.id === "primeira-carta" || x.family === "acervo")) {
      set(playerId, a.id, copies);
      give(
        a.id,
        reachedAt(cards, (c) => c.quantity, a.target!),
      );
    }
    const colorSeen = new Set<string>();
    let paletteAt: string | null = null;
    for (const c of cards) {
      for (const color of c.color_identity ?? []) if ("WUBRG".includes(color)) colorSeen.add(color);
      if (!paletteAt && colorSeen.size === 5) paletteAt = c.created_at;
    }
    set(playerId, "paleta-completa", colorSeen.size);
    give("paleta-completa", paletteAt);
    const legends = cards.filter((c) => /Legendary.*Creature/i.test(c.type_line ?? ""));
    set(playerId, "salao-das-lendas", legends.length);
    give(
      "salao-das-lendas",
      reachedAt(legends, () => 1, 25),
    );
    const forTrade = cards.filter((c) => c.available_for_trade);
    set(playerId, "balcao-de-trocas", forTrade.length);
    give(
      "balcao-de-trocas",
      reachedAt(forTrade, () => 1, 5),
    );
    // Terrenos básicos não contam: ter vários é normal
    give("acumulador", cards.find((c) => c.quantity >= 4 && !/\bBasic\b/i.test(c.type_line ?? ""))?.created_at ?? null);

    // Decks
    set(playerId, "construtor", decks.length);
    give(
      "construtor",
      reachedAt(decks, () => 1, 1),
    );
    set(playerId, "arquiteto", decks.length);
    give(
      "arquiteto",
      reachedAt(decks, () => 1, 5),
    );
    const clean = active.filter((d) => {
      const list = cardsByDeck.get(d.id) ?? [];
      return list.reduce((sum, c) => sum + c.quantity, 0) >= FULL_DECK && !list.some((c) => c.is_proxy);
    });
    give("papel-de-verdade", clean[0]?.created_at ?? null);
    set(playerId, "proxy-zero", clean.length);
    give(
      "proxy-zero",
      reachedAt(clean, () => 1, 3),
    );
    const proxies = active.reduce(
      (sum, d) => sum + (cardsByDeck.get(d.id) ?? []).filter((c) => c.is_proxy).reduce((n, c) => n + c.quantity, 0),
      0,
    );
    set(playerId, "rei-do-proxy", proxies);
    if (proxies >= 50) give("rei-do-proxy", active.at(-1)?.created_at ?? null);

    // Empréstimos: liberar um deck seu para outra pessoa
    const mine = new Set(decks.map((d) => d.id));
    const granted = byDate(data.permissions.filter((p) => mine.has(p.deck_id) && p.user_id !== playerId));
    give("chave-da-casa", granted[0]?.created_at ?? null);
  }
  return { unlocks, progress };
}

/**
 * Calcula do zero todas as conquistas (partidas + coleção). É pesado: lê o
 * histórico inteiro e as coleções de todos. Só a sincronização usa
 * (lib/achievement-sync.ts); as páginas leem o que está gravado (loadAchievements).
 */
export async function computeAllAchievements(supabase: SupabaseClient): Promise<Achievements> {
  const [parts, { data: users }, coll] = await Promise.all([
    fetchAll<Part>((from, to) =>
      supabase
        .from("approved_participations")
        .select(
          "match_id, pilot_id, deck_id, deck_owner_id, commander_snapshot, color_identity_snapshot, is_winner, seat_order, elimination_reason, eliminated_by, played_at",
        )
        .order("played_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    supabase.from("users").select("id, name, avatar_url, role").order("name"),
    loadCollectionData(supabase),
  ]);
  // O root é invisível para o grupo: não ganha conquistas
  const players = (users ?? [])
    .filter((u) => u.role !== "root")
    .map((u) => ({ id: u.id as string, name: u.name as string, avatar_url: u.avatar_url as string | null }));
  const result = computeAchievements(parts, players);

  const extra = computeCollectionAchievements(coll, players);
  for (const [playerId, values] of extra.progress) {
    const m = result.progress.get(playerId) ?? new Map<string, number>();
    for (const [id, v] of values) m.set(id, v);
    result.progress.set(playerId, m);
  }
  result.unlocks = [...result.unlocks, ...extra.unlocks].sort((a, b) => a.at.localeCompare(b.at));
  return result;
}

/**
 * Conquistas gravadas (tabela user_achievements) e o progresso salvo. Uma vez
 * gravada, a conquista fica — só sai se a partida que a liberou for rejeitada
 * ou excluída. Leve: é o que as páginas usam.
 */
export async function loadAchievements(supabase: SupabaseClient): Promise<Achievements> {
  const [rows, { data: users }, { data: progressRows }] = await Promise.all([
    fetchAll<{ user_id: string; achievement_id: string; unlocked_at: string; match_id: string | null }>((from, to) =>
      supabase
        .from("user_achievements")
        .select("user_id, achievement_id, unlocked_at, match_id")
        .order("unlocked_at", { ascending: true })
        .order("user_id")
        .order("achievement_id")
        .range(from, to),
    ),
    supabase.from("users").select("id, name, avatar_url, role").order("name"),
    supabase.from("achievement_progress").select("user_id, progress"),
  ]);
  const players = (users ?? [])
    .filter((u) => u.role !== "root")
    .map((u) => ({ id: u.id as string, name: u.name as string, avatar_url: u.avatar_url as string | null }));
  const visible = new Set(players.map((p) => p.id));
  return {
    players,
    // Conquistas que saíram do catálogo (id desconhecido) não aparecem
    unlocks: rows
      .filter((r) => visible.has(r.user_id) && ACHIEVEMENT_BY_ID.has(r.achievement_id))
      .map((r) => ({ id: r.achievement_id, playerId: r.user_id, matchId: r.match_id ?? "", at: r.unlocked_at })),
    progress: new Map(
      (progressRows ?? [])
        .filter((r) => visible.has(r.user_id))
        .map((r) => [r.user_id as string, new Map(Object.entries(r.progress as Record<string, number>))]),
    ),
  };
}

async function loadCollectionData(supabase: SupabaseClient): Promise<CollectionData> {
  const [cards, decks, deckCards, permissions] = await Promise.all([
    fetchAll<CollectionData["cards"][number]>((from, to) =>
      supabase
        .from("user_cards")
        .select("user_id, quantity, available_for_trade, color_identity, type_line, created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll<CollectionData["decks"][number]>((from, to) =>
      supabase.from("decks").select("id, owner_id, is_active, created_at").order("id").range(from, to),
    ),
    fetchAll<CollectionData["deckCards"][number]>((from, to) =>
      supabase.from("deck_cards").select("deck_id, quantity, is_proxy").order("id").range(from, to),
    ),
    fetchAll<CollectionData["permissions"][number]>((from, to) =>
      supabase
        .from("deck_permissions")
        .select("deck_id, user_id, created_at")
        .order("deck_id")
        .order("user_id")
        .range(from, to),
    ),
  ]);
  return { cards, decks, deckCards, permissions };
}

/** Conquistas liberadas em cada partida: matchId → pilotId (ou dono do deck) → conquistas. */
export function unlocksByMatch(a: Achievements): Map<string, Map<string, AchievementDef[]>> {
  const out = new Map<string, Map<string, AchievementDef[]>>();
  for (const u of a.unlocks) {
    if (!u.matchId) continue; // conquista de coleção, sem partida
    const byPlayer = out.get(u.matchId) ?? new Map<string, AchievementDef[]>();
    byPlayer.set(u.playerId, [...(byPlayer.get(u.playerId) ?? []), ACHIEVEMENT_BY_ID.get(u.id)!]);
    out.set(u.matchId, byPlayer);
  }
  return out;
}

/** Secreta ainda escondida: ninguém do grupo liberou. */
export function isHidden(a: AchievementDef, data: Achievements): boolean {
  return Boolean(a.secret) && !data.unlocks.some((u) => u.id === a.id);
}
