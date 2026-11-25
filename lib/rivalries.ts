import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * Confrontos diretos entre jogadores, calculados das partidas aprovadas.
 * Duas pessoas "se enfrentaram" quando estavam na mesma mesa. O root fica de fora
 * (é invisível para o grupo).
 */

interface Part {
  match_id: string;
  pilot_id: string;
  is_winner: boolean;
  elimination_reason: string | null;
  eliminated_by: string | null;
  played_at: string;
}

export interface RivalPlayer {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Confronto visto do lado de `me`. */
export interface Duel {
  me: string;
  them: string;
  /** Mesas em que os dois estavam. */
  together: number;
  /** Vitórias de cada um nessas mesas. */
  myWins: number;
  theirWins: number;
  /** Quantas vezes um eliminou o outro. */
  iKilled: number;
  theyKilled: number;
  lastPlayed: string;
}

export interface Rivalries {
  players: RivalPlayer[];
  /** Chave `${a}:${b}` (de qualquer lado) → confronto visto por `a`. */
  duels: Map<string, Duel>;
  /** Participações aprovadas, para detalhar um confronto. */
  parts: Part[];
}

const key = (a: string, b: string) => `${a}:${b}`;

export async function loadRivalries(supabase: SupabaseClient): Promise<Rivalries> {
  const [parts, { data: users }] = await Promise.all([
    fetchAll<Part>((from, to) =>
      supabase
        .from("approved_participations")
        .select("match_id, pilot_id, is_winner, elimination_reason, eliminated_by, played_at")
        .order("played_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    supabase.from("users").select("id, name, avatar_url, role").order("name"),
  ]);

  // Só quem o grupo enxerga (para quem não é root, o root nem vem na consulta)
  const visible = new Map(
    (users ?? []).filter((u) => u.role !== "root").map((u) => [u.id as string, u as RivalPlayer & { role: string }]),
  );
  const rows = parts.filter((p) => visible.has(p.pilot_id));

  const duels = new Map<string, Duel>();
  for (const table of Map.groupBy(rows, (p) => p.match_id).values()) {
    for (const a of table) {
      for (const b of table) {
        if (a.pilot_id === b.pilot_id) continue;
        const k = key(a.pilot_id, b.pilot_id);
        const d = duels.get(k) ?? {
          me: a.pilot_id,
          them: b.pilot_id,
          together: 0,
          myWins: 0,
          theirWins: 0,
          iKilled: 0,
          theyKilled: 0,
          lastPlayed: a.played_at,
        };
        d.together++;
        if (a.is_winner) d.myWins++;
        if (b.is_winner) d.theirWins++;
        if (!b.is_winner && b.eliminated_by === a.pilot_id) d.iKilled++;
        if (!a.is_winner && a.eliminated_by === b.pilot_id) d.theyKilled++;
        d.lastPlayed = a.played_at;
        duels.set(k, d);
      }
    }
  }

  const played = new Set(rows.map((p) => p.pilot_id));
  const players = [...visible.values()]
    .filter((u) => played.has(u.id))
    .map(({ id, name, avatar_url }) => ({ id, name, avatar_url }));

  return { players, duels, parts: rows };
}

/** Confrontos de um jogador, do que mais dividiu mesa ao que menos. */
export function duelsOf(r: Rivalries, playerId: string): Duel[] {
  return [...r.duels.values()]
    .filter((d) => d.me === playerId)
    .sort((a, b) => b.together - a.together || b.iKilled + b.theyKilled - (a.iKilled + a.theyKilled));
}

export function duelBetween(r: Rivalries, a: string, b: string): Duel | null {
  return r.duels.get(key(a, b)) ?? null;
}

/** Abates trocados entre os dois. */
export const exchanged = (d: Duel) => d.iKilled + d.theyKilled;

/**
 * "Calor" do confronto: o quanto os dois disputam entre si — abates trocados
 * pesam o dobro das vitórias de um ou de outro nas mesas em comum.
 */
export const heat = (d: Duel) => exchanged(d) * 2 + d.myWins + d.theirWins;

/** Diferença no placar (vitórias + abates): quanto menor, mais equilibrado. */
const gap = (d: Duel) => Math.abs(d.myWins + d.iKilled - (d.theirWins + d.theyKilled));

/** Mais quente primeiro; empate: mais equilibrado, depois mais mesas juntos. */
const byHeat = (a: Duel, b: Duel) => heat(b) - heat(a) || gap(a) - gap(b) || b.together - a.together;

/** Freguês: quem este jogador mais eliminou. */
export function preyOf(duels: Duel[]): Duel | null {
  const best = [...duels].sort((a, b) => b.iKilled - a.iKilled || a.theyKilled - b.theyKilled)[0];
  return best && best.iKilled > 0 ? best : null;
}

/**
 * Rival: o confronto mais disputado (abates trocados e vitórias de cada lado,
 * de preferência equilibrado). Se for o mesmo jogador que o freguês, e houver
 * outro confronto disputado, o rival passa a ser esse outro — freguês não é rival.
 */
export function rivalOf(duels: Duel[]): Duel | null {
  const contested = duels.filter((d) => heat(d) > 0).sort(byHeat);
  const prey = preyOf(duels);
  return contested.find((d) => d.them !== prey?.them) ?? contested[0] ?? null;
}

/** Rivalidades mais quentes do grupo (cada dupla uma vez). */
export function hottestDuels(r: Rivalries, limit = 6): Duel[] {
  return [...r.duels.values()]
    .filter((d) => d.me < d.them && heat(d) > 0)
    .sort((a, b) => byHeat(a, b) || b.lastPlayed.localeCompare(a.lastPlayed))
    .slice(0, limit);
}

/** Abates entre os dois, por tipo, de cada lado. */
export function killsBetween(r: Rivalries, a: string, b: string) {
  const tally = (killer: string, victim: string) =>
    [
      ...Map.groupBy(
        r.parts.filter((p) => p.pilot_id === victim && p.eliminated_by === killer && !p.is_winner),
        (p) => p.elimination_reason ?? "Não informado",
      ),
    ]
      .map(([reason, list]) => ({ reason, count: list.length }))
      .sort((x, y) => y.count - x.count);
  return { aKilledB: tally(a, b), bKilledA: tally(b, a) };
}

/** Partidas em que os dois estavam na mesa (mais recente primeiro). */
export function sharedMatchIds(r: Rivalries, a: string, b: string): string[] {
  const withA = new Set(r.parts.filter((p) => p.pilot_id === a).map((p) => p.match_id));
  return [
    ...new Set(r.parts.filter((p) => p.pilot_id === b && withA.has(p.match_id)).map((p) => p.match_id)),
  ].reverse();
}
