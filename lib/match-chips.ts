import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAchievements, unlocksByMatch, type AchievementDef } from "@/lib/achievements";
import { SEASON_ICONS } from "@/lib/seasons";
import { loadSeasons, loadSeasonUnlocks } from "@/lib/seasons-data";

/**
 * Selos do card da partida: conquistas gerais e de temporada liberadas em cada
 * partida (matchId → jogador → conquistas). As de temporada levam o número dela.
 */
export async function loadMatchChips(supabase: SupabaseClient): Promise<Map<string, Map<string, AchievementDef[]>>> {
  const [achievements, seasons, seasonUnlocks] = await Promise.all([
    loadAchievements(supabase),
    loadSeasons(supabase),
    loadSeasonUnlocks(supabase),
  ]);
  const chips = unlocksByMatch(achievements);
  const visible = new Set(achievements.players.map((p) => p.id));
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  for (const u of seasonUnlocks) {
    const season = seasonById.get(u.season_id);
    const a = season?.achievements.find((x) => x.key === u.achievement_key);
    if (!u.match_id || !season || !a || !visible.has(u.user_id)) continue;
    const byPlayer = chips.get(u.match_id) ?? new Map<string, AchievementDef[]>();
    byPlayer.set(u.user_id, [
      ...(byPlayer.get(u.user_id) ?? []),
      {
        id: `s${season.number}:${a.key}`,
        name: `${a.name} · T${season.number}`,
        description: a.description,
        rarity: a.rarity,
        category: "jornada",
        icon: SEASON_ICONS[a.icon] ?? SEASON_ICONS.star,
      },
    ]);
    chips.set(u.match_id, byPlayer);
  }
  return chips;
}
