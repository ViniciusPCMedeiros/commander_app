import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAICompletion } from "@/lib/ai";
import { commanderLabel, formatDate, HIDDEN_PLAYER } from "@/lib/format";
import { scoreMatch } from "@/lib/scoring";
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
  /** Placar de pontos da semana (regra do ranking). */
  weekScores: { name: string; points: number; wins: number; kills: number; deaths: number; games: number }[];
  /** Ranking geral por pontos no fim da semana, com a posição antes dela (null = estreou). */
  standings: { name: string; points: number; position: number; before: number | null }[];
  /** Marcos da semana: primeira partida e primeira vitória de alguém. */
  firstMatches: string[];
  firstWins: string[];
  /** Sequências de vitórias em andamento (2+). */
  streaks: [string, number][];
}

interface ScoredRow {
  match_id: string;
  pilot_id: string;
  is_winner: boolean;
  elimination_reason: string | null;
  eliminated_by: string | null;
  played_at: string;
}

/** Ranking geral por pontos a partir das participações (mesma regra e desempate do ranking). */
function standingsOf(rows: ScoredRow[]) {
  const totals = new Map<string, { points: number; wins: number; kills: number }>();
  for (const ps of Map.groupBy(rows, (r) => r.match_id).values()) {
    const scores = scoreMatch(ps);
    for (const p of ps) {
      const t = totals.get(p.pilot_id) ?? { points: 0, wins: 0, kills: 0 };
      const sc = scores.get(p.pilot_id)!;
      t.points += sc.points;
      t.kills += sc.kills;
      if (p.is_winner) t.wins++;
      totals.set(p.pilot_id, t);
    }
  }
  return [...totals.entries()].sort(
    (a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins || b[1].kills - a[1].kills,
  );
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined): [string, number][] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/** Horário de Brasília (UTC−3, sem horário de verão desde 2019). */
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const spDate = (d: Date) => new Date(d.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Última semana completa, de segunda 00:00 a domingo 23:59:59.999 (horário de
 * Brasília). Na madrugada de segunda, é a semana que acabou de fechar.
 */
export function lastCompletedWeek(now = new Date()) {
  const local = new Date(now.getTime() - SP_OFFSET_MS); // relógio de Brasília nos campos UTC
  const sinceMonday = (local.getUTCDay() + 6) % 7; // 0 = segunda
  const thisMonday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday);
  const nextStart = new Date(thisMonday + SP_OFFSET_MS); // segunda desta semana, 00:00 em Brasília
  const start = new Date(nextStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(nextStart.getTime() - 1);
  return { start, end, startDate: spDate(start), endDate: spDate(end) };
}

export async function buildWeekSummary(supabase: SupabaseClient, weekStart: Date, weekEnd: Date): Promise<WeekSummary> {
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

  // Contexto geral: todas as partidas aprovadas até o fim da semana
  const [{ data: history }, { data: users }, { data: milestones }] = await Promise.all([
    supabase
      .from("approved_participations")
      .select("match_id, pilot_id, is_winner, elimination_reason, eliminated_by, played_at")
      .lte("played_at", weekEnd.toISOString())
      .order("played_at", { ascending: true })
      .returns<ScoredRow[]>(),
    supabase.from("users").select("id, name, role"),
    supabase.from("player_milestones").select("user_id, player_name, first_match_at, first_win_at"),
  ]);
  // O root é invisível para o grupo: o jornal fica salvo e é lido por todos, então
  // mesmo quando o root gera a edição o nome dele não pode aparecer.
  const hidden = new Set((users ?? []).filter((u) => u.role === "root").map((u) => u.id as string));
  for (const p of parts) {
    if (hidden.has(p.pilot_id)) p.pilot = null;
    if (hidden.has(p.deck_owner_id)) p.owner = null;
  }
  const nameOf = (id: string) => (hidden.has(id) ? undefined : (users ?? []).find((u) => u.id === id)?.name);
  // Pontos calculados com todas as participações (abate sobre o root conta, como no
  // ranking); o root só some das listas.
  const rows = history ?? [];
  const shown = <T>(list: [string, T][]) => list.filter(([id]) => nameOf(id));
  const inWeek = (iso: string | null) => !!iso && iso >= weekStart.toISOString() && iso <= weekEnd.toISOString();

  const weekRows = rows.filter((r) => inWeek(r.played_at));
  const weekScores = shown(standingsOf(weekRows)).map(([id, t]) => {
    const mine = weekRows.filter((r) => r.pilot_id === id);
    return {
      name: nameOf(id)!,
      points: t.points,
      wins: t.wins,
      kills: t.kills,
      deaths: mine.filter((r) => !r.is_winner).length,
      games: mine.length,
    };
  });
  const beforeRank = new Map(
    shown(standingsOf(rows.filter((r) => r.played_at < weekStart.toISOString()))).map(([id], i) => [id, i + 1]),
  );
  const standings = shown(standingsOf(rows)).map(([id, t], i) => ({
    name: nameOf(id)!,
    points: t.points,
    position: i + 1,
    before: beforeRank.get(id) ?? null,
  }));

  // Sequências em andamento ao fim da semana
  const streak = new Map<string, number>();
  for (const r of rows) streak.set(r.pilot_id, r.is_winner ? (streak.get(r.pilot_id) ?? 0) + 1 : 0);
  const streaks = shown([...streak.entries()])
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => [nameOf(id)!, n] as [string, number])
    .sort((a, b) => b[1] - a[1]);

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
      (p) =>
        parts.find((q) => q.match_id === p.match_id && q.pilot_id === p.eliminated_by)?.pilot?.name ?? HIDDEN_PLAYER,
    ),
    weekScores,
    standings,
    firstMatches: (milestones ?? [])
      .filter((m) => !hidden.has(m.user_id) && inWeek(m.first_match_at))
      .map((m) => m.player_name),
    firstWins: (milestones ?? [])
      .filter((m) => !hidden.has(m.user_id) && inWeek(m.first_win_at))
      .map((m) => m.player_name),
    streaks,
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
          ? (m.match_participants.find((q) => q.pilot_id === p.eliminated_by)?.pilot?.name ?? HIDDEN_PLAYER)
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
    "PONTOS DA SEMANA (vitória +4; abate +1 ou +2 conforme o tipo; morte por conta própria −1):",
    ...s.weekScores.map(
      (w) => `- ${w.name}: ${w.points} pts (${w.wins}V, ${w.kills} abates, ${w.deaths} mortes em ${w.games} partidas)`,
    ),
    "",
    "RANKING GERAL POR PONTOS (posição atual; entre parênteses, a posição antes desta semana):",
    ...s.standings.map(
      (r) =>
        `- ${r.position}º ${r.name}: ${r.points} pts (${r.before === null ? "estreou no ranking esta semana" : `antes ${r.before}º`})`,
    ),
    "",
    `Primeira partida no grupo esta semana: ${s.firstMatches.join(", ") || "ninguém"}.`,
    `Primeira vitória da vida no grupo esta semana: ${s.firstWins.join(", ") || "ninguém"}.`,
    `Sequências de vitórias em andamento: ${s.streaks.map(([n, c]) => `${n} (${c} seguidas)`).join(", ") || "nenhuma"}.`,
    "",
    "PARTIDAS DA SEMANA:",
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
    ...s.weekScores.map(
      (w) =>
        `- ${w.name}: ${w.points} pts · ${w.wins} vitória${w.wins === 1 ? "" : "s"} · ⚔ ${w.kills} · ☠ ${w.deaths}`,
    ),
    "",
    "#### 🎲 Quem mais sentou à mesa",
    ...s.gamesByPlayer.map(([n, c]) => `- ${n}: ${c} partida${c === 1 ? "" : "s"}`),
    ...(s.killsByPlayer.length
      ? [
          "",
          "#### ⚔️ Quem mais eliminou",
          ...s.killsByPlayer.map(([n, c]) => `- ${n}: ${c} eliminaç${c === 1 ? "ão" : "ões"}`),
        ]
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

const NEWSPAPER_SYSTEM = `Você é o editor-chefe da "Gazeta do Mesão", o jornal semanal bem-humorado de um playgroup de Magic: The Gathering no formato Commander (EDH).
Escreva em português do Brasil, em Markdown, entre 300 e 500 palavras, com EXATAMENTE esta estrutura:

# <Manchete curta e chamativa sobre o fato mais marcante da semana>
Um lead de 2 ou 3 frases com o resumo da semana (quantas partidas, quem dominou, a maior surpresa).

#### 🎲 Mesa a mesa
Um parágrafo curto por partida (no máximo 6; se houver mais, agrupe as menos marcantes): quem venceu, com qual comandante, como e quem eliminou quem.

#### 🏆 Placar da semana
Uma lista com os pontos de cada jogador na semana, do maior para o menor, com vitórias, abates e mortes.

#### 📈 Sobe e desce
Movimentos no ranking geral: quem subiu, quem caiu, quem estreou, sequências e primeiras vitórias.

#### 🔁 Empréstimos
Só se houver decks emprestados: quem pilotou o deck de quem e como foi.

#### 🔮 De olho na próxima rodada
1 ou 2 frases provocativas baseadas nos dados (rivalidades, sequências, quem precisa reagir).

Regras:
- Use apenas os dados fornecidos; nunca invente partidas, jogadas, cartas ou resultados.
- Linguagem neutra em gênero: use os nomes dos jogadores, sem adjetivos no masculino ou feminino.
- Emojis com moderação, tom de crônica esportiva. Não use tabelas.`;

/** Separa a manchete ("# ...") do corpo. */
export function splitHeadline(markdown: string, fallbackHeadline: string) {
  const lines = markdown.trim().split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("#")) {
    return {
      headline:
        first
          .replace(/^#+\s*/, "")
          .replace(/\*\*/g, "")
          .trim() || fallbackHeadline,
      content: lines.slice(1).join("\n").trim(),
    };
  }
  return { headline: fallbackHeadline, content: markdown.trim() };
}

export async function generateNewspaper(supabase: SupabaseClient, week = lastCompletedWeek()) {
  const summary = await buildWeekSummary(supabase, week.start, week.end);
  // Semana sem partidas não gasta chamada de IA
  const { content: raw, source } = summary.matches.length
    ? await generateAICompletion(summaryToPrompt(summary), NEWSPAPER_SYSTEM, () => fallbackNewspaper(summary))
    : { content: fallbackNewspaper(summary), source: "fallback" as const };
  const { headline, content } = splitHeadline(raw, `Gazeta do Mesão — ${summary.matches.length} partidas na semana`);
  return { summary, headline, content, source };
}

let publishing: Promise<PublishResult> | null = null;

export type PublishResult =
  | { status: "published"; id: string; edition: number; source: "ai" | "fallback"; week: string }
  | { status: "exists" | "empty"; week: string };

/**
 * Publica a edição da última semana completa (segunda a domingo), uma única vez:
 * se ela já existe, não faz nada; semana sem partidas aprovadas não gera edição.
 * Chamado pelo agendador (instrumentation.ts) logo depois da meia-noite de domingo
 * para segunda e, se o servidor estava desligado, assim que ele voltar.
 * Usa a service role: a edição é do grupo, não de quem estiver logado.
 */
export function publishWeeklyNewspaper(admin: SupabaseClient, now = new Date()): Promise<PublishResult> {
  // Uma publicação por vez neste processo; o índice único em week_start cobre o resto
  publishing ??= (async () => {
    const week = lastCompletedWeek(now);
    const label = `${week.startDate} a ${week.endDate}`;
    const { data: existing } = await admin
      .from("weekly_newspapers")
      .select("id")
      .eq("week_start", week.startDate)
      .eq("automatic", true)
      .maybeSingle();
    if (existing) return { status: "exists", week: label } as const;

    const { count } = await admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("played_at", week.start.toISOString())
      .lte("played_at", week.end.toISOString());
    if (!count) return { status: "empty", week: label } as const;

    const { summary, headline, content, source } = await generateNewspaper(admin, week);
    const { data, error } = await admin
      .from("weekly_newspapers")
      .insert({
        week_start: week.startDate,
        week_end: week.endDate,
        headline,
        content,
        matches_count: summary.matches.length,
        generated_by: null,
        source,
        automatic: true,
      })
      .select("id, edition_number")
      .single();
    if (error) {
      // 23505 = outra execução publicou a mesma semana antes (índice único)
      if (error.code === "23505") return { status: "exists", week: label } as const;
      throw new Error(error.message);
    }
    return { status: "published", id: data.id, edition: data.edition_number, source, week: label } as const;
  })().finally(() => {
    publishing = null;
  });
  return publishing;
}

/** Semana (segunda a domingo) a partir da data da segunda-feira, "AAAA-MM-DD". */
export function weekFromStartDate(startDate: string) {
  const start = new Date(`${startDate}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { start, end, startDate, endDate: spDate(end) };
}

/** Refaz o texto de uma edição automática (mesma semana), ex.: quando a IA falhou. */
export async function regenerateNewspaper(admin: SupabaseClient, id: string) {
  const { data: edition } = await admin
    .from("weekly_newspapers")
    .select("id, week_start, automatic")
    .eq("id", id)
    .maybeSingle();
  if (!edition) throw new Error("Edição não encontrada.");
  if (!edition.automatic) throw new Error("Só edições semanais automáticas podem ser refeitas.");

  const { summary, headline, content, source } = await generateNewspaper(admin, weekFromStartDate(edition.week_start));
  const { error } = await admin
    .from("weekly_newspapers")
    .update({ headline, content, source, matches_count: summary.matches.length })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { source };
}
