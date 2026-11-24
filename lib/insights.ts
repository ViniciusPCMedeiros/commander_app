import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAICompletion } from "@/lib/ai";
import { commanderLabel, formatPct } from "@/lib/format";
import type { PlayerStats } from "@/lib/types";

const COLOR_NAMES: Record<string, string> = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };

export async function generatePlayerInsight(supabase: SupabaseClient, userId: string) {
  const [{ data: stats }, { data: parts }, { data: kills }, { data: users }] = await Promise.all([
    supabase.from("player_stats").select("*").eq("user_id", userId).single<PlayerStats>(),
    supabase
      .from("approved_participations")
      .select("commander_snapshot, color_identity_snapshot, is_winner, elimination_reason, win_condition, pilot_id, deck_owner_id, seat_order")
      .eq("pilot_id", userId),
    // Eliminações registradas (partidas aprovadas) em que o jogador eliminou ou foi eliminado
    supabase
      .from("match_participants")
      .select("pilot_id, eliminated_by, matches!inner(status)")
      .eq("matches.status", "approved")
      .not("eliminated_by", "is", null)
      .or(`pilot_id.eq.${userId},eliminated_by.eq.${userId}`),
    supabase.from("users").select("id, name"),
  ]);
  const nameOf = new Map((users ?? []).map((u) => [u.id as string, u.name as string]));
  const count = (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(nameOf.get(id) ?? "?", (m.get(nameOf.get(id) ?? "?") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  // Algoz: quem mais elimina o jogador; vítimas: quem ele mais elimina
  const nemesis = count((kills ?? []).filter((k) => k.pilot_id === userId).map((k) => k.eliminated_by as string));
  const victims = count((kills ?? []).filter((k) => k.eliminated_by === userId).map((k) => k.pilot_id as string));

  if (!stats) throw new Error("Jogador não encontrado");
  const rows = parts ?? [];

  const tally = (keyFn: (r: (typeof rows)[number]) => string[] | string | null) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const v = keyFn(r);
      for (const k of Array.isArray(v) ? v : v ? [v] : []) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const commanders = tally((r) => commanderLabel(r.commander_snapshot));
  const colors = tally((r) => (r.color_identity_snapshot as string[]) ?? []);
  const wins = rows.filter((r) => r.is_winner);
  const winConds = tally((r) => (r.is_winner ? r.win_condition : null));
  const deaths = tally((r) => (r.is_winner ? null : r.elimination_reason));

  const facts = [
    `Jogador: ${stats.player_name}`,
    `Partidas: ${stats.total_games}, vitórias: ${stats.total_wins} (${formatPct(stats.overall_winrate)})`,
    `Com decks próprios: ${stats.own_deck_wins}/${stats.own_deck_games}; com decks emprestados: ${stats.borrowed_deck_wins}/${stats.borrowed_deck_games}`,
    `Comandantes mais jogados: ${commanders.map(([n, c]) => `${n} (${c})`).join(", ") || "-"}`,
    `Cores mais frequentes: ${colors.map(([c, n]) => `${COLOR_NAMES[c] ?? c} (${n})`).join(", ") || "-"}`,
    `Como vence: ${winConds.map(([n, c]) => `${n} (${c})`).join(", ") || "-"}`,
    `Como é eliminado: ${deaths.map(([n, c]) => `${n} (${c})`).join(", ") || "-"}`,
    `Quem mais o elimina: ${nemesis.map(([n, c]) => `${n} (${c})`).join(", ") || "-"}`,
    `Quem ele mais elimina: ${victims.map(([n, c]) => `${n} (${c})`).join(", ") || "-"}`,
  ].join("\n");

  const fallback = () => {
    if (stats.total_games === 0) {
      return `### 🔮 Perfil de ${stats.player_name}\n\nAinda não há partidas validadas suficientes para traçar um perfil. Bora pra mesa!`;
    }
    const style =
      winConds[0]?.[0] === "Combo"
        ? "um **combeiro** paciente, que espera a janela certa"
        : winConds[0]?.[0]?.includes("Stax")
          ? "um **controlador** que gosta de travar a mesa"
          : wins.length > 0
            ? "um **jogador agressivo**, que vence no combate"
            : "um **sobrevivente** que ainda procura a primeira vitória";
    return [
      `### 🔮 Perfil de ${stats.player_name}`,
      "",
      `Com ${stats.total_games} partidas e ${formatPct(stats.overall_winrate)} de vitórias, ${stats.player_name} se mostra ${style}.`,
      "",
      `- **Comandante favorito:** ${commanders[0]?.[0] ?? "-"}`,
      `- **Cor predominante:** ${colors[0] ? COLOR_NAMES[colors[0][0]] ?? colors[0][0] : "Incolor"}`,
      `- **Calcanhar de Aquiles:** costuma cair por ${deaths[0]?.[0]?.toLowerCase() ?? "nada ainda"}`,
      ...(nemesis[0] ? [`- **Algoz:** ${nemesis[0][0]} (${nemesis[0][1]}x)`] : []),
      ...(victims[0] ? [`- **Vítima favorita:** ${victims[0][0]} (${victims[0][1]}x)`] : []),
      `- **Empréstimos:** ${stats.borrowed_deck_games} partidas com deck alheio (${stats.borrowed_deck_wins} vitórias)`,
      "",
      "_Análise gerada localmente (IA não configurada ou indisponível)._",
    ].join("\n");
  };

  const result = await generateAICompletion(
    facts,
    `Você é um analista bem-humorado de Magic: The Gathering Commander. Com base apenas nas estatísticas fornecidas, escreva em português do Brasil, em Markdown (máx. ~200 palavras), o perfil de estilo de jogo do jogador: arquétipo, pontos fortes, fraquezas e uma sugestão divertida de próximo comandante. Comece com "### 🔮 Perfil de <nome>". Não invente números.`,
    fallback,
  );

  return { ...result, gamesSnapshot: stats.total_games };
}
