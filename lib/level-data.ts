import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeElo, computeLevels, type LevelPart } from "@/lib/level";
import { loadSeasons } from "@/lib/seasons-data";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** Nível (XP/faixa) e habilidade (Elo) de todo mundo, calculados do histórico. */
export async function loadLevels(supabase: SupabaseClient) {
  const [parts, achievements, seasonUnlocks, seasons, { data: users }] = await Promise.all([
    fetchAll<LevelPart>((from, to) =>
      supabase
        .from("approved_participations")
        .select("match_id, pilot_id, deck_id, is_winner, elimination_reason, eliminated_by, played_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ user_id: string; achievement_id: string }>((from, to) =>
      supabase
        .from("user_achievements")
        .select("user_id, achievement_id")
        .order("user_id")
        .order("achievement_id")
        .range(from, to),
    ),
    fetchAll<{ user_id: string; season_id: string; achievement_key: string }>((from, to) =>
      supabase
        .from("season_unlocks")
        .select("user_id, season_id, achievement_key")
        .order("season_id")
        .order("user_id")
        .order("achievement_key")
        .range(from, to),
    ),
    loadSeasons(supabase),
    supabase.from("users").select("id, role"),
  ]);
  // O root não tem nível nem habilidade
  const visible = new Set((users ?? []).filter((u) => u.role !== "root").map((u) => u.id as string));
  return {
    levels: computeLevels({ parts, achievements, seasonUnlocks, seasons, visible }),
    elo: computeElo(parts, visible),
  };
}

/** loadLevels com o cliente da sessão, uma vez por requisição (layout e página dividem o resultado). */
export const getLevels = cache(async () => loadLevels(await createClient()));
