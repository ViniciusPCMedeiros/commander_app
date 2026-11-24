import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAICompletion } from "@/lib/ai";
import { commanderLabel, formatDate, HIDDEN_PLAYER } from "@/lib/format";
import type { MatchWithParticipants } from "@/lib/types";

export const MATCH_SELECT = `
  *,
  match_participants (
    *,
    pilot:users!match_participants_pilot_id_fkey ( name ),
    owner:users!match_participants_deck_owner_id_fkey ( name ),
    deck:decks ( name, commander_image_url )
  )
`;

interface WeekSummary {
  weekStart: Date;
  weekEnd: Date;
  matches: MatchWithParticipants[];
  winsByPlayer: [string, number][];
  gamesByPlayer: [string, number][];
  winningCommanders: [string, number][];
  winConditions: [string, number][];
  borrowed: { pilot: string; owner: string; commander: string; won: boolean }[];
  /** Quem mais eliminou oponentes na semana (pelo campo "eliminado por"). */
  killsByPlayer: [string, number][];
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined): [string, number][] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export async function buildWeekSummary(supabase: SupabaseClient, days = 7): Promise<WeekSummary> {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const { data } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("status", "approved")
    .gte("played_at", weekStart.toISOString())
    .lte("played_at", weekEnd.toISOString())
    .order("played_at", { ascending: true });

  const matches = (data ?? []) as MatchWithParticipants[];
  const parts = matches.flatMap((m) => m.match_participants);
  const winners = parts.filter((p) => p.is_winner);

  return {
    weekStart,
    weekEnd,
    matches,
    winsByPlayer: countBy(winners, (p) => p.pilot?.name ?? HIDDEN_PLAYER),
    gamesByPlayer: countBy(parts, (p) => p.pilot?.name ?? HIDDEN_PLAYER),
    winningCommanders: countBy(winners, (p) => commanderLabel(p.commander_snapshot)),
    winConditions: countBy(matches, (m) => m.win_condition),
    killsByPlayer: countBy(
      parts.filter((p) => p.eliminated_by),
      (p) => parts.find((q) => q.match_id === p.match_id && q.pilot_id === p.eliminated_by)?.pilot?.name ?? HIDDEN_PLAYER,
    ),
    borrowed: parts
      .filter((p) => p.pilot_id !== p.deck_owner_id)
      .map((p) => ({
        pilot: p.pilot?.name ?? HIDDEN_PLAYER,
        owner: p.owner?.name ?? HIDDEN_PLAYER,
        commander: commanderLabel(p.commander_snapshot),
        won: p.is_winner,
      })),
  };
}

function summaryToPrompt(s: WeekSummary): string {
  const lines = s.matches.map((m, i) => {
    const players = [...m.match_participants]
      .sort((a, b) => (a.seat_order ?? 9) - (b.seat_order ?? 9))
      .map((p) => {
        const loan = p.pilot_id !== p.deck_owner_id ? ` (deck emprestado de ${p.owner?.name ?? HIDDEN_PLAYER})` : "";
        const killer = p.eliminated_by
          ? m.match_participants.find((q) => q.pilot_id === p.eliminated_by)?.pilot?.name ?? HIDDEN_PLAYER
          : null;
        const result = p.is_winner
          ? "VENCEU"
          : `eliminado (${p.elimination_reason ?? "motivo não informado"})${killer ? ` por ${killer}` : ""}`;
        return `${p.pilot?.name ?? HIDDEN_PLAYER} com ${commanderLabel(p.commander_snapshot)}${loan} — ${result}`;
      })
      .join("; ");
    return `Partida ${i + 1} (${formatDate(m.played_at)}), condição de vitória: ${m.win_condition ?? "não informada"}. ${players}. Notas: ${m.notes ?? "-"}`;
  });

  return [
    `Semana de ${formatDate(s.weekStart)} a ${formatDate(s.weekEnd)}. Total de partidas validadas: ${s.matches.length}.`,
    `Vitórias por jogador: ${s.winsByPlayer.map(([n, c]) => `${n}: ${c}`).join(", ") || "nenhuma"}.`,
    `Partidas por jogador: ${s.gamesByPlayer.map(([n, c]) => `${n}: ${c}`).join(", ") || "nenhuma"}.`,
    `Eliminações causadas: ${s.killsByPlayer.map(([n, c]) => `${n}: ${c}`).join(", ") || "não registradas"}.`,
    "",
    ...lines,
  ].join("\n");
}

function fallbackNewspaper(s: WeekSummary): string {
  if (s.matches.length === 0) {
    return [
      "# Semana de silêncio no Mesão",
      "",
      "### 📰 Gazeta do Mesão (Edição Automática)",
      "",
      `Nenhuma partida validada entre ${formatDate(s.weekStart)} e ${formatDate(s.weekEnd)}. As cartas descansaram nas sleeves — mas os rumores de novos decks continuam.`,
    ].join("\n");
  }

  const leaderWins = s.winsByPlayer[0]?.[1] ?? 0;
  const leaders = s.winsByPlayer.filter(([, c]) => c === leaderWins).map(([n]) => n);
  const leadersText = leaders.length > 1 ? `${leaders.slice(0, -1).join(", ")} e ${leaders.at(-1)}` : leaders[0];
  const [topCmd] = s.winningCommanders[0] ?? ["?"];
  const [topCond] = s.winConditions[0] ?? ["?"];
  const plural = (n: number) => `${n} vitória${n === 1 ? "" : "s"}`;

  return [
    leaders.length > 1
      ? `# Empate no topo: ${leadersText} com ${plural(leaderWins)} cada`
      : `# ${leadersText} domina a semana com ${plural(leaderWins)}`,
    "",
    "### 📰 Gazeta do Mesão (Edição Automática)",
    "",
    `Semana movimentada nas mesas! Foram **${s.matches.length} partidas validadas** entre ${formatDate(s.weekStart)} e ${formatDate(s.weekEnd)}.`,
    "",
    `${leaders.length > 1 ? `**${leadersText}** dividiram a liderança` : `**${leadersText}** saiu na frente`}, e o comandante mais temido foi **${topCmd}**. A forma de vitória mais comum: _${topCond}_.`,
    "",
    "#### 🏆 Placar da semana",
    ...s.winsByPlayer.map(([n, c]) => `- ${n}: ${c} vitória${c === 1 ? "" : "s"}`),
    "",
    "#### 🎲 Quem mais sentou à mesa",
    ...s.gamesByPlayer.map(([n, c]) => `- ${n}: ${c} partida${c === 1 ? "" : "s"}`),
    ...(s.killsByPlayer.length
      ? ["", "#### ⚔️ Quem mais eliminou", ...s.killsByPlayer.map(([n, c]) => `- ${n}: ${c} eliminaç${c === 1 ? "ão" : "ões"}`)]
      : []),
    ...(s.borrowed.length
      ? [
          "",
          "#### 🔁 Empréstimos",
          ...s.borrowed.map(
            (b) => `- ${b.pilot} pilotou ${b.commander} de ${b.owner}${b.won ? " — e venceu! 😱" : ""}`,
          ),
        ]
      : []),
    "",
    "_Crônica gerada localmente (IA não configurada ou indisponível)._",
  ].join("\n");
}

const NEWSPAPER_SYSTEM = `Você é o editor-chefe da "Gazeta do Mesão", o jornal semanal bem-humorado de um playgroup de Magic: The Gathering (formato Commander/EDH).
Escreva em português do Brasil, em Markdown, com no máximo ~350 palavras.
A PRIMEIRA linha deve ser a manchete no formato "# Manchete" (curta e chamativa).
Depois: um lead, destaques das partidas (cite jogadores e comandantes), uma seção "🏆 Placar da semana" e uma "🔁 Empréstimos" se houver decks emprestados.
Use emojis com moderação. Não invente partidas nem resultados: use apenas os dados fornecidos.`;

/** Separa a manchete ("# ...") do corpo. */
export function splitHeadline(markdown: string, fallbackHeadline: string) {
  const lines = markdown.trim().split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("#")) {
    return {
      headline: first.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim() || fallbackHeadline,
      content: lines.slice(1).join("\n").trim(),
    };
  }
  return { headline: fallbackHeadline, content: markdown.trim() };
}

export async function generateNewspaper(supabase: SupabaseClient) {
  const summary = await buildWeekSummary(supabase);
  const { content: raw, source } = await generateAICompletion(
    summaryToPrompt(summary),
    NEWSPAPER_SYSTEM,
    () => fallbackNewspaper(summary),
  );
  const { headline, content } = splitHeadline(raw, `Gazeta do Mesão — ${summary.matches.length} partidas na semana`);
  return { summary, headline, content, source };
}
