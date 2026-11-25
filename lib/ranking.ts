import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commanderLabel, HIDDEN_PLAYER } from "@/lib/format";
import { scoreMatch } from "@/lib/scoring";

export type Period = "all" | "month" | "30d" | "year";
export type SortKey = "points" | "wins" | "winrate" | "games";

export const PERIOD_LABEL: Record<Period, string> = {
  all: "Desde sempre",
  month: "Este mês",
  "30d": "Últimos 30 dias",
  year: "Este ano",
};

export const SORT_LABEL: Record<SortKey, string> = {
  points: "Pontos",
  wins: "Vitórias",
  winrate: "Win%",
  games: "Partidas",
};

/** Mínimo de partidas para entrar na ordenação por Win% (evita 1/1 = 100%). */
export const MIN_GAMES_FOR_WINRATE = 3;

const COLOR_NAME: Record<string, string> = {
  W: "Branco",
  U: "Azul",
  B: "Preto",
  R: "Vermelho",
  G: "Verde",
  C: "Incolor",
};

interface Participation {
  match_id: string;
  pilot_id: string;
  deck_id: string;
  deck_owner_id: string;
  commander_snapshot: string;
  color_identity_snapshot: string[] | null;
  is_winner: boolean;
  elimination_reason: string | null;
  eliminated_by: string | null;
  played_at: string;
}

/** Participação com os pontos e abates daquela partida (ver lib/scoring.ts). */
interface ScoredParticipation extends Participation {
  points: number;
  kills: number;
  killsByReason: Record<string, number>;
  selfDeath: boolean;
}

interface Base {
  games: number;
  wins: number;
  winrate: number;
  points: number;
  kills: number;
}

export interface PlayerRow extends Base {
  id: string;
  name: string;
  avatar_url: string | null;
  ownGames: number;
  ownWins: number;
  borrowedGames: number;
  borrowedWins: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayed: string;
  selfDeaths: number;
}

export interface DeckRow extends Base {
  id: string;
  name: string;
  commander: string;
  image: string | null;
  partnerImage: string | null;
  colors: string[];
  ownerId: string;
  ownerName: string;
  pilots: number;
  borrowedGames: number;
}

export interface CommanderRow extends Base {
  name: string;
  colors: string[];
  decks: number;
  pilots: number;
}

export interface ColorRow extends Base {
  color: string;
  name: string;
}

/** Início do período no fuso de São Paulo (UTC-3, sem horário de verão). */
export function periodStart(period: Period, now = new Date()): Date | null {
  if (period === "all") return null;
  if (period === "30d") return new Date(now.getTime() - 30 * 86_400_000);
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(now)
    .split("-");
  return new Date(period === "month" ? `${y}-${m}-01T00:00:00-03:00` : `${y}-01-01T00:00:00-03:00`);
}

const pct = (wins: number, games: number) => (games ? Math.round((wins / games) * 1000) / 10 : 0);

export function sortRows<T extends Base & { name?: string }>(rows: T[], sort: SortKey): T[] {
  const byName = (a: T, b: T) => (a.name ?? "").localeCompare(b.name ?? "");
  return [...rows].sort((a, b) => {
    if (sort === "winrate") {
      const qa = a.games >= MIN_GAMES_FOR_WINRATE ? 1 : 0;
      const qb = b.games >= MIN_GAMES_FOR_WINRATE ? 1 : 0;
      return qb - qa || b.winrate - a.winrate || b.wins - a.wins || b.games - a.games || byName(a, b);
    }
    if (sort === "games") return b.games - a.games || b.wins - a.wins || byName(a, b);
    if (sort === "points")
      return b.points - a.points || b.wins - a.wins || b.kills - a.kills || b.games - a.games || byName(a, b);
    return b.wins - a.wins || b.winrate - a.winrate || b.games - a.games || byName(a, b);
  });
}

/** Dia (no fuso de São Paulo) em que a partida aconteceu: "2026-11-22". */
const sessionDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

export async function loadRanking(supabase: SupabaseClient, period: Period) {
  const start = periodStart(period);
  let query = supabase
    .from("approved_participations")
    .select(
      "match_id, pilot_id, deck_id, deck_owner_id, commander_snapshot, color_identity_snapshot, is_winner, elimination_reason, eliminated_by, played_at",
    )
    .order("played_at", { ascending: true });
  if (start) query = query.gte("played_at", start.toISOString());

  const [{ data: parts }, { data: users }, { data: decks }] = await Promise.all([
    query.returns<Participation[]>(),
    supabase.from("users").select("id, name, avatar_url"),
    supabase
      .from("decks")
      .select(
        "id, name, commander_name, partner_name, commander_image_url, partner_image_url, color_identity, owner_id",
      ),
  ]);

  // Pontos por partida: os abates dependem de quem mais estava na mesa
  const byMatch = new Map<string, Participation[]>();
  for (const p of parts ?? []) byMatch.set(p.match_id, [...(byMatch.get(p.match_id) ?? []), p]);
  const scores = new Map([...byMatch.entries()].map(([id, ps]) => [id, scoreMatch(ps)]));
  const rows: ScoredParticipation[] = (parts ?? []).map((p) => ({ ...p, ...scores.get(p.match_id)!.get(p.pilot_id)! }));
  const lookups = {
    userById: new Map((users ?? []).map((u) => [u.id as string, u])),
    deckById: new Map((decks ?? []).map((d) => [d.id as string, d])),
  };

  // "Última corrida": o último dia com partidas aprovadas. O ranking anterior é tudo antes dele.
  const lastSession = rows.length ? sessionDay(rows[rows.length - 1].played_at) : null;
  const before = lastSession ? rows.filter((p) => sessionDay(p.played_at) < lastSession) : [];

  return {
    ...aggregate(rows, lookups),
    lastSession,
    lastSessionMatches: new Set(rows.filter((p) => sessionDay(p.played_at) === lastSession).map((p) => p.match_id))
      .size,
    previous: aggregate(before, lookups),
  };
}

type Lookups = {
  userById: Map<string, { name: string; avatar_url: string | null }>;
  deckById: Map<
    string,
    {
      name: string;
      commander_name: string;
      partner_name: string | null;
      commander_image_url: string | null;
      partner_image_url: string | null;
      color_identity: string[];
      owner_id: string;
    }
  >;
};

function aggregate(rows: ScoredParticipation[], { userById, deckById }: Lookups) {
  // Jogadores (participações já vêm em ordem cronológica → sequências)
  const players = new Map<string, PlayerRow>();
  for (const p of rows) {
    const u = userById.get(p.pilot_id);
    if (!u) continue; // jogador invisível (root)
    const r =
      players.get(p.pilot_id) ??
      ({
        id: p.pilot_id,
        name: u?.name ?? "?",
        avatar_url: u?.avatar_url ?? null,
        games: 0,
        wins: 0,
        winrate: 0,
        points: 0,
        kills: 0,
        selfDeaths: 0,
        ownGames: 0,
        ownWins: 0,
        borrowedGames: 0,
        borrowedWins: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastPlayed: p.played_at,
      } satisfies PlayerRow);
    const own = p.pilot_id === p.deck_owner_id;
    r.games++;
    r.points += p.points;
    r.kills += p.kills;
    if (p.selfDeath) r.selfDeaths++;
    if (own) r.ownGames++;
    else r.borrowedGames++;
    if (p.is_winner) {
      r.wins++;
      if (own) r.ownWins++;
      else r.borrowedWins++;
      r.currentStreak++;
      r.bestStreak = Math.max(r.bestStreak, r.currentStreak);
    } else {
      r.currentStreak = 0;
    }
    r.lastPlayed = p.played_at;
    players.set(p.pilot_id, r);
  }

  // Decks
  const deckRows = new Map<string, DeckRow & { pilotSet: Set<string> }>();
  for (const p of rows) {
    const d = deckById.get(p.deck_id);
    if (!d) continue; // deck de jogador invisível
    const r = deckRows.get(p.deck_id) ?? {
      id: p.deck_id,
      name: d?.name ?? "?",
      commander: commanderLabel(d?.commander_name ?? p.commander_snapshot, d?.partner_name),
      image: d?.commander_image_url ?? null,
      partnerImage: d?.partner_image_url ?? null,
      colors: d?.color_identity ?? p.color_identity_snapshot ?? [],
      ownerId: p.deck_owner_id,
      ownerName: userById.get(p.deck_owner_id)?.name ?? HIDDEN_PLAYER,
      games: 0,
      wins: 0,
      winrate: 0,
      points: 0,
      kills: 0,
      pilots: 0,
      borrowedGames: 0,
      pilotSet: new Set<string>(),
    };
    r.games++;
    r.points += p.points;
    r.kills += p.kills;
    if (p.is_winner) r.wins++;
    if (p.pilot_id !== p.deck_owner_id) r.borrowedGames++;
    r.pilotSet.add(p.pilot_id);
    deckRows.set(p.deck_id, r);
  }

  // Comandantes (snapshot da partida, agregando decks diferentes com o mesmo comandante)
  const commanders = new Map<string, CommanderRow & { deckSet: Set<string>; pilotSet: Set<string> }>();
  for (const p of rows) {
    const name = commanderLabel(p.commander_snapshot);
    const r = commanders.get(name) ?? {
      name,
      colors: p.color_identity_snapshot ?? [],
      games: 0,
      wins: 0,
      winrate: 0,
      points: 0,
      kills: 0,
      decks: 0,
      pilots: 0,
      deckSet: new Set<string>(),
      pilotSet: new Set<string>(),
    };
    r.games++;
    r.points += p.points;
    r.kills += p.kills;
    if (p.is_winner) r.wins++;
    r.deckSet.add(p.deck_id);
    r.pilotSet.add(p.pilot_id);
    commanders.set(name, r);
  }

  // Cores: cada participação conta para cada cor da identidade (incolor = C)
  const colors = new Map<string, ColorRow>();
  for (const p of rows) {
    const ids = p.color_identity_snapshot?.length ? p.color_identity_snapshot : ["C"];
    for (const c of ids) {
      const r = colors.get(c) ?? {
        color: c,
        name: COLOR_NAME[c] ?? c,
        games: 0,
        wins: 0,
        winrate: 0,
        points: 0,
        kills: 0,
      };
      r.games++;
      if (p.is_winner) r.wins++;
      colors.set(c, r);
    }
  }

  const finish = <T extends Base>(r: T): T => ({ ...r, winrate: pct(r.wins, r.games) });

  return {
    matches: new Set(rows.map((p) => p.match_id)).size,
    players: [...players.values()].map(finish),
    decks: [...deckRows.values()].map(({ pilotSet, ...r }) => finish({ ...r, pilots: pilotSet.size })),
    commanders: [...commanders.values()].map(({ deckSet, pilotSet, ...r }) =>
      finish({ ...r, decks: deckSet.size, pilots: pilotSet.size }),
    ),
    colors: [...colors.values()].map(finish),
  };
}

/** Variação de posição: positivo = subiu, negativo = caiu, null = estreante (não estava no ranking anterior). */
export type Movement = number | null;

/** Compara as posições atuais com as anteriores (mesma ordenação) usando a chave de cada linha. */
export function movements<T>(
  current: T[],
  previous: T[],
  key: (row: T) => string,
): Map<string, { delta: Movement; prevIndex: number | null }> {
  const prevIndex = new Map(previous.map((r, i) => [key(r), i]));
  return new Map(
    current.map((r, i) => {
      const before = prevIndex.get(key(r));
      return [key(r), { delta: before === undefined ? null : before - i, prevIndex: before ?? null }];
    }),
  );
}
