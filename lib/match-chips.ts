import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAchievements, unlocksByMatch, type AchievementDef } from "@/lib/achievements";

type Achievements = Awaited<ReturnType<typeof loadAchievements>>;
import { SEASON_ICONS, type Season } from "@/lib/seasons";
import { loadSeasons, loadSeasonUnlocks } from "@/lib/seasons-data";

/**
 * Selos do card da partida: conquistas gerais e de temporada liberadas em cada
 * partida (matchId → jogador → conquistas). As de temporada levam o número dela.
 */
export async function loadMatchChips(
  supabase: SupabaseClient,
  /** O que a página já carregou (evita buscar tudo de novo). */
  loaded: { achievements?: Achievements; seasons?: Season[] } = {},
): Promise<Map<string, Map<string, AchievementDef[]>>> {
  const [achievements, seasons, seasonUnlocks] = await Promise.all([
    loaded.achievements ?? loadAchievements(supabase),
    loaded.seasons ?? loadSeasons(supabase),
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
