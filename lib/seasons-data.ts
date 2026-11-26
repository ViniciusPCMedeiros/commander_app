import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  computeSeasonUnlocks,
  finalAwards,
  seasonStatus,
  type Season,
  type SeasonPart,
  type SeasonTheme,
  type SeasonAchievementInput,
} from "@/lib/seasons";

export interface ThemeRow extends SeasonTheme {
  id: string;
  achievements: SeasonAchievementInput[];
  created_at: string;
}

export interface SeasonUnlockRow {
  season_id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: string;
  match_id: string | null;
}

export async function loadSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data } = await supabase.from("seasons").select("*").order("number");
  return (data ?? []) as Season[];
}

/** Temporada em andamento (ou a que terminou e ainda não foi encerrada). */
export function currentSeason(seasons: Season[], now = new Date()): Season | null {
  return seasons.find((s) => ["active", "ended"].includes(seasonStatus(s, now))) ?? null;
}

/** Início sugerido para lançar: logo depois da última temporada aberta, ou a próxima hora cheia. */
export function suggestedStart(seasons: Season[], now = new Date()): Date {
  const lastEnd = seasons.filter((s) => seasonStatus(s, now) !== "closed").at(-1)?.ends_at;
  if (lastEnd && new Date(lastEnd) > now) return new Date(lastEnd);
  return new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
}

export async function loadThemes(supabase: SupabaseClient): Promise<ThemeRow[]> {
  const { data } = await supabase.from("season_themes").select("*").order("created_at");
  return (data ?? []) as ThemeRow[];
}

export async function loadCustomBase(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("season_base_achievements")
    .select("id, definition, created_at")
    .order("created_at");
  return (data ?? []) as { id: string; definition: SeasonAchievementInput; created_at: string }[];
}

export async function loadSeasonUnlocks(supabase: SupabaseClient, seasonId?: string): Promise<SeasonUnlockRow[]> {
  return fetchAll<SeasonUnlockRow>((from, to) => {
    let q = supabase.from("season_unlocks").select("season_id, user_id, achievement_key, unlocked_at, match_id");
    if (seasonId) q = q.eq("season_id", seasonId);
    return q.order("unlocked_at").order("user_id").order("achievement_key").range(from, to);
  });
}

async function seasonParts(supabase: SupabaseClient, season: Season): Promise<SeasonPart[]> {
  return fetchAll<SeasonPart>((from, to) =>
    supabase
      .from("approved_participations")
      .select(
        "match_id, pilot_id, deck_id, deck_owner_id, color_identity_snapshot, is_winner, seat_order, elimination_reason, eliminated_by, played_at",
      )
      .gte("played_at", season.starts_at)
      .lt("played_at", season.ends_at)
      .order("played_at")
      .order("id")
      .range(from, to),
  );
}

/** Jogadores que podem ganhar conquistas (todos menos o root). */
async function visiblePlayers(admin: SupabaseClient) {
  const { data } = await admin.from("users").select("id, role");
  return new Set((data ?? []).filter((u) => u.role !== "root").map((u) => u.id as string));
}

const CHUNK = 200;

/**
 * Grava as conquistas de partida de cada temporada já iniciada e o progresso.
 * Mesmas regras das conquistas gerais: uma vez gravada, fica — só sai se a
 * partida que a deu for rejeitada (aqui) ou excluída (ON DELETE CASCADE).
 */
export async function syncSeasons(admin: SupabaseClient): Promise<{ added: number; removed: number }> {
  const now = new Date();
  const seasons = (await loadSeasons(admin)).filter((s) => seasonStatus(s, now) !== "upcoming");
  if (!seasons.length) return { added: 0, removed: 0 };
  const visible = await visiblePlayers(admin);

  // Partidas que deixaram de estar aprovadas levam as conquistas junto
  const linked = await fetchAll<{ match_id: string; match: { status: string } | null }>((from, to) =>
    admin
      .from("season_unlocks")
      .select("match_id, match:matches ( status )")
      .not("match_id", "is", null)
      .order("season_id")
      .order("user_id")
      .order("achievement_key")
      .range(from, to)
      .returns<{ match_id: string; match: { status: string } | null }[]>(),
  );
  const invalid = [...new Set(linked.filter((r) => r.match?.status !== "approved").map((r) => r.match_id))];
  let removed = 0;
  for (let i = 0; i < invalid.length; i += CHUNK) {
    const { error, count } = await admin
      .from("season_unlocks")
      .delete({ count: "exact" })
      .in("match_id", invalid.slice(i, i + CHUNK));
    if (error) throw error;
    removed += count ?? 0;
  }

  const stored = await loadSeasonUnlocks(admin);
  const have = new Set(stored.map((r) => `${r.season_id}:${r.user_id}:${r.achievement_key}`));
  let added = 0;
  for (const season of seasons) {
    const { unlocks, progress } = computeSeasonUnlocks(season, await seasonParts(admin, season), visible);
    const rows = unlocks
      .filter((u) => !have.has(`${season.id}:${u.playerId}:${u.key}`))
      .map((u) => ({
        season_id: season.id,
        user_id: u.playerId,
        achievement_key: u.key,
        unlocked_at: u.at,
        match_id: u.matchId,
      }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await admin
        .from("season_unlocks")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "season_id,user_id,achievement_key", ignoreDuplicates: true });
      if (error) throw error;
    }
    added += rows.length;
    // Progresso só muda enquanto a temporada não fecha
    if (seasonStatus(season, now) !== "closed") {
      const progressRows = [...progress.entries()].map(([userId, p]) => ({
        season_id: season.id,
        user_id: userId,
        progress: p,
        updated_at: now.toISOString(),
      }));
      for (let i = 0; i < progressRows.length; i += CHUNK) {
        const { error } = await admin
          .from("season_progress")
          .upsert(progressRows.slice(i, i + CHUNK), { onConflict: "season_id,user_id" });
        if (error) throw error;
      }
    }
  }
  return { added, removed };
}

/**
 * Encerra as temporadas que passaram da data de fim: pódio, campeão, Coroa e
 * Lenda (gravados com a data de fim) e marca closed_at. Chame depois de
 * syncSeasons, para a Lenda ver todas as conquistas de partida.
 */
export async function closeDueSeasons(admin: SupabaseClient): Promise<Season[]> {
  const now = new Date();
  const due = (await loadSeasons(admin)).filter((s) => seasonStatus(s, now) === "ended");
  if (!due.length) return [];
  const visible = await visiblePlayers(admin);
  const closed: Season[] = [];

  for (const season of due) {
    // Marca primeiro: duas rotinas ao mesmo tempo não encerram a mesma temporada duas vezes
    const { data: claimed } = await admin
      .from("seasons")
      .update({ closed_at: now.toISOString() })
      .eq("id", season.id)
      .is("closed_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const { standings } = computeSeasonUnlocks(season, await seasonParts(admin, season), visible);
    const stored = await loadSeasonUnlocks(admin, season.id);
    const have = new Map<string, Set<string>>();
    for (const r of stored) have.set(r.user_id, new Set([...(have.get(r.user_id) ?? []), r.achievement_key]));
    const awards = finalAwards(season, standings, have).map((a) => ({
      season_id: season.id,
      user_id: a.playerId,
      achievement_key: a.key,
      unlocked_at: season.ends_at,
      match_id: null,
    }));
    if (awards.length) {
      const { error } = await admin
        .from("season_unlocks")
        .upsert(awards, { onConflict: "season_id,user_id,achievement_key", ignoreDuplicates: true });
      if (error) throw error;
    }
    closed.push({ ...season, closed_at: now.toISOString() });
  }
  return closed;
}
