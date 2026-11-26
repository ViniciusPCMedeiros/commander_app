import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAllAchievements } from "@/lib/achievements";
import { syncSeasons } from "@/lib/seasons-data";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Grava as conquistas novas (tabela user_achievements) e o progresso de cada
 * jogador. Regras:
 * - conquista gravada não sai, mesmo que a condição deixe de valer (apagar
 *   cartas, colocar proxy, corrigir uma partida);
 * - exceção: conquista de partida rejeitada sai (e de partida excluída, pelo
 *   ON DELETE CASCADE) — a partida nunca deveria ter existido. Se a condição
 *   ainda valer por outra partida, ela volta na mesma rodada, com a nova data.
 * Conquistas de partida ficam com a data da partida; as de coleção, com a data
 * em que foram percebidas.
 */

export interface SyncResult {
  added: number;
  removed: number;
}

const CHUNK = 200;

async function runSync(admin: SupabaseClient): Promise<SyncResult> {
  // 1. Partidas que deixaram de estar aprovadas levam as conquistas junto
  const linked = await fetchAll<{ match_id: string; match: { status: string } | null }>((from, to) =>
    admin
      .from("user_achievements")
      .select("match_id, match:matches ( status )")
      .not("match_id", "is", null)
      .order("user_id")
      .order("achievement_id")
      .range(from, to)
      .returns<{ match_id: string; match: { status: string } | null }[]>(),
  );
  const invalid = [...new Set(linked.filter((r) => r.match?.status !== "approved").map((r) => r.match_id))];
  let removed = 0;
  for (let i = 0; i < invalid.length; i += CHUNK) {
    const { error, count } = await admin
      .from("user_achievements")
      .delete({ count: "exact" })
      .in("match_id", invalid.slice(i, i + CHUNK));
    if (error) throw error;
    removed += count ?? 0;
  }

  // 2. Calcula tudo e grava só o que ainda não está gravado
  const [computed, stored] = await Promise.all([
    computeAllAchievements(admin),
    fetchAll<{ user_id: string; achievement_id: string }>((from, to) =>
      admin
        .from("user_achievements")
        .select("user_id, achievement_id")
        .order("user_id")
        .order("achievement_id")
        .range(from, to),
    ),
  ]);
  const have = new Set(stored.map((r) => `${r.user_id}:${r.achievement_id}`));
  const now = new Date().toISOString();
  const rows = computed.unlocks
    .filter((u) => !have.has(`${u.playerId}:${u.id}`))
    .map((u) => ({
      user_id: u.playerId,
      achievement_id: u.id,
      unlocked_at: u.matchId ? u.at : now,
      match_id: u.matchId || null,
    }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    // Outra sincronização pode ter gravado a mesma conquista: ignora repetidas
    const { error } = await admin
      .from("user_achievements")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  // 3. Progresso (barras "3/5" do perfil)
  const progress = [...computed.progress.entries()].map(([userId, values]) => ({
    user_id: userId,
    progress: Object.fromEntries(values),
    updated_at: now,
  }));
  for (let i = 0; i < progress.length; i += CHUNK) {
    const { error } = await admin
      .from("achievement_progress")
      .upsert(progress.slice(i, i + CHUNK), { onConflict: "user_id" });
    if (error) throw error;
  }

  // 4. Conquistas de temporada (mesmas regras)
  const season = await syncSeasons(admin);

  return { added: rows.length + season.added, removed: removed + season.removed };
}

// Uma sincronização por vez; mudanças que chegarem no meio pedem mais uma rodada.
let running: Promise<SyncResult> | null = null;
let again = false;

export function syncAchievements(admin: SupabaseClient): Promise<SyncResult> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const total = { added: 0, removed: 0 };
    do {
      again = false;
      const r = await runSync(admin);
      total.added += r.added;
      total.removed += r.removed;
    } while (again);
    return total;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Agenda a sincronização para depois da resposta (não atrasa quem salvou).
 * Chame nas ações que mudam partidas aprovadas, coleção, decks ou empréstimos.
 */
export function scheduleAchievementSync() {
  after(async () => {
    try {
      const r = await syncAchievements(createAdminClient());
      if (r.added || r.removed) console.log(`Conquistas: ${r.added} nova(s), ${r.removed} removida(s).`);
    } catch (error) {
      console.error("Conquistas: falha ao sincronizar:", error);
    }
  });
}
