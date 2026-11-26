import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAchievements, unlocksByMatch, type AchievementDef } from "@/lib/achievements";

type Achievements = Awaited<ReturnType<typeof loadAchievements>>;
import { Axe, Crown, ScrollText } from "lucide-react";
import { SEASON_ICONS, seasonStatus, type Season } from "@/lib/seasons";
import { loadSeasonBoard, loadSeasons, loadSeasonUnlocks } from "@/lib/seasons-data";

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

  // Rei da Mesa de cada partida, Regicídio e contratos cumpridos
  const started = seasons.filter((x) => seasonStatus(x) !== "upcoming");
  const boards = await Promise.all(started.map((x) => loadSeasonBoard(supabase, x)));
  const push = (matchId: string, playerId: string, def: AchievementDef) => {
    if (!visible.has(playerId)) return;
    const byPlayer = chips.get(matchId) ?? new Map<string, AchievementDef[]>();
    byPlayer.set(playerId, [...(byPlayer.get(playerId) ?? []), def]);
    chips.set(matchId, byPlayer);
  };
  started.forEach((season, i) => {
    const { kings, bonuses } = boards[i];
    for (const [matchId, kingId] of kings)
      push(matchId, kingId, {
        id: `s${season.number}:rei`,
        name: `Rei da Mesa · T${season.number}`,
        description: "O mais bem colocado da temporada nesta mesa: quem o eliminasse ganhava o Regicídio.",
        rarity: "rare",
        category: "jornada",
        icon: Crown,
      });
    for (const b of bonuses)
      push(
        b.matchId,
        b.playerId,
        b.kind === "regicidio"
          ? {
              id: `s${season.number}:regicidio`,
              name: `Regicídio +${b.points} · T${season.number}`,
              description: "Eliminou o Rei da Mesa.",
              rarity: "mythic",
              category: "jornada",
              icon: Axe,
            }
          : {
              id: `s${season.number}:contrato:${b.label}`,
              name: `Contrato: ${b.label} +${b.points}`,
              description: "Contrato semanal cumprido nesta partida (aprovado pelos admins).",
              rarity: "rare",
              category: "jornada",
              icon: ScrollText,
            },
      );
  });
  return chips;
}
