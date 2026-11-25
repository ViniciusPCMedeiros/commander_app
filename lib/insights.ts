import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAICompletion } from "@/lib/ai";
import { commanderLabel, formatDate, formatPct, HIDDEN_PLAYER } from "@/lib/format";
import { lastCompletedWeek } from "@/lib/newspaper";
import { loadRanking, sortRows } from "@/lib/ranking";
import { scoreMatch } from "@/lib/scoring";
import type { PlayerStats } from "@/lib/types";

const COLOR_NAMES: Record<string, string> = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };

interface Part {
  match_id: string;
  pilot_id: string;
  deck_id: string;
  deck_owner_id: string;
  commander_snapshot: string;
  color_identity_snapshot: string[] | null;
  is_winner: boolean;
  seat_order: number | null;
  elimination_reason: string | null;
  eliminated_by: string | null;
  win_condition: string | null;
  played_at: string;
}

const list = (entries: [string, number][]) => entries.map(([n, c]) => `${n} (${c})`).join(", ") || "-";

function tally<T>(rows: T[], keyFn: (r: T) => string | string[] | null | undefined): [string, number][] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = keyFn(r);
    for (const k of Array.isArray(v) ? v : v ? [v] : []) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Dossiê do jogador para a IA: ranking e médias do grupo, abates/mortes por tipo,
 * forma recente, assentos, decks, confrontos diretos e rivalidades.
 */
async function buildPlayerDossier(supabase: SupabaseClient, userId: string) {
  const [{ data: stats }, { data: all }, { data: users }, { data: decks }, ranking] = await Promise.all([
    supabase.from("player_stats").select("*").eq("user_id", userId).single<PlayerStats>(),
    supabase
      .from("approved_participations")
      .select(
        "match_id, pilot_id, deck_id, deck_owner_id, commander_snapshot, color_identity_snapshot, is_winner, seat_order, elimination_reason, eliminated_by, win_condition, played_at",
      )
      .order("played_at", { ascending: true })
      .returns<Part[]>(),
    supabase.from("users").select("id, name, role"),
    supabase.from("decks").select("id, name"),
    loadRanking(supabase, "all"),
  ]);
  if (!stats) throw new Error("Jogador não encontrado");

  // O root é invisível para o grupo (mesmo quando a análise é gerada pelo servidor)
  const hidden = new Set((users ?? []).filter((u) => u.role === "root").map((u) => u.id as string));
  const nameOf = (id: string | null | undefined) =>
    (id && !hidden.has(id) && (users ?? []).find((u) => u.id === id)?.name) || HIDDEN_PLAYER;
  const deckName = (id: string) => (decks ?? []).find((d) => d.id === id)?.name ?? "deck removido";
  const parts = all ?? [];
  const mine = parts.filter((p) => p.pilot_id === userId);
  const byMatch = Map.groupBy(parts, (p) => p.match_id);
  const scores = new Map([...byMatch.entries()].map(([id, ps]) => [id, scoreMatch(ps)]));
  const myScore = (p: Part) => scores.get(p.match_id)!.get(userId)!;

  // Ranking por pontos e médias do grupo
  const players = sortRows(ranking.players.filter((r) => !hidden.has(r.id)), "points");
  const pos = players.findIndex((r) => r.id === userId);
  const me = players[pos];
  const avg = (fn: (r: (typeof players)[number]) => number) =>
    players.length ? players.reduce((s, r) => s + fn(r), 0) / players.length : 0;
  const fmt = (n: number) => n.toFixed(1).replace(".", ",");
  // Taxa geral (vitórias ÷ participações): não infla com quem jogou pouco
  const totalGames = players.reduce((sum, r) => sum + r.games, 0);
  const groupWinrate = totalGames ? (players.reduce((sum, r) => sum + r.wins, 0) / totalGames) * 100 : 0;

  // Abates por tipo (quem este jogador eliminou) e mortes por tipo
  const killed = parts.filter((p) => p.eliminated_by === userId && !p.is_winner);
  const deaths = mine.filter((p) => !p.is_winner);

  // Forma recente: últimas 8 partidas, da mais antiga para a mais recente
  const recent = mine
    .slice(-8)
    .map((p) => (p.is_winner ? "V" : "D"))
    .join(" ");

  // Assento (ordem de turno)
  const seats = [
    ...Map.groupBy(
      mine.filter((p) => p.seat_order),
      (p) => p.seat_order!,
    ),
  ]
    .sort((a, b) => a[0] - b[0])
    .map(([seat, ps]) => `${seat}º a jogar: ${ps.filter((p) => p.is_winner).length}V/${ps.length}J`)
    .join("; ");

  // Decks pilotados
  const deckLines = [...Map.groupBy(mine, (p) => p.deck_id)]
    .map(([deckId, ps]) => {
      const owner = ps[0].deck_owner_id === userId ? "próprio" : `emprestado de ${nameOf(ps[0].deck_owner_id)}`;
      const k = ps.reduce((s, p) => s + myScore(p).kills, 0);
      const pts = ps.reduce((s, p) => s + myScore(p).points, 0);
      return {
        games: ps.length,
        line: `- ${deckName(deckId)} (${commanderLabel(ps[0].commander_snapshot)}, ${owner}): ${ps.length}J, ${ps.filter((p) => p.is_winner).length}V, ${k} abate(s), ${pts} pts`,
      };
    })
    .sort((a, b) => b.games - a.games)
    .map((d) => d.line);

  // Confrontos diretos: partidas em que estavam juntos
  const h2h = new Map<string, { together: number; mine: number; theirs: number; iKilled: number; killedMe: number }>();
  for (const p of mine) {
    for (const o of byMatch.get(p.match_id) ?? []) {
      if (o.pilot_id === userId) continue;
      const r = h2h.get(o.pilot_id) ?? { together: 0, mine: 0, theirs: 0, iKilled: 0, killedMe: 0 };
      r.together++;
      if (p.is_winner) r.mine++;
      if (o.is_winner) r.theirs++;
      if (o.eliminated_by === userId) r.iKilled++;
      if (p.eliminated_by === o.pilot_id) r.killedMe++;
      h2h.set(o.pilot_id, r);
    }
  }
  const h2hLines = [...h2h.entries()]
    .sort((a, b) => b[1].together - a[1].together)
    .map(
      ([id, r]) =>
        `- vs ${nameOf(id)}: ${r.together} partida(s) juntos; ${stats.player_name} venceu ${r.mine}, ${nameOf(id)} venceu ${r.theirs}; ${stats.player_name} eliminou ${r.iKilled}x, foi eliminado(a) ${r.killedMe}x`,
    );

  const victims = tally(killed, (p) => nameOf(p.pilot_id));
  const executioners = tally(
    deaths.filter((p) => p.eliminated_by),
    (p) => nameOf(p.eliminated_by),
  );

  const facts = [
    `JOGADOR: ${stats.player_name}`,
    `Grupo: ${players.length} jogadores com partidas, ${ranking.matches} partidas aprovadas no total.`,
    me
      ? `Ranking por pontos: ${pos + 1}º de ${players.length}, com ${me.points} pts (média do grupo: ${fmt(avg((r) => r.points))} pts). Regra: vitória +4; abate +1 ou +2 conforme o tipo; morte por conta própria −1.`
      : "Ainda fora do ranking (sem partidas aprovadas).",
    `Partidas: ${stats.total_games}; vitórias: ${stats.total_wins} (${formatPct(stats.overall_winrate)}; taxa geral do grupo: ${formatPct(groupWinrate)}).`,
    me
      ? `Abates: ${me.kills} (média do grupo: ${fmt(avg((r) => r.kills))}); mortes: ${me.deaths}; mortes por conta própria: ${me.selfDeaths}.`
      : "",
    me ? `Sequência atual de vitórias: ${me.currentStreak}; melhor sequência: ${me.bestStreak}.` : "",
    `Forma recente (mais antiga → mais recente, V = vitória, D = derrota): ${recent || "-"}`,
    `Desempenho por assento: ${seats || "-"}`,
    `Com decks próprios: ${stats.own_deck_wins}V/${stats.own_deck_games}J; com decks emprestados: ${stats.borrowed_deck_wins}V/${stats.borrowed_deck_games}J.`,
    `Cores mais jogadas: ${list(tally(mine, (p) => (p.color_identity_snapshot ?? []).map((c) => COLOR_NAMES[c] ?? c)))}`,
    `Como vence: ${list(tally(mine, (p) => (p.is_winner ? p.win_condition : null)))}`,
    `Abates por tipo: ${list(tally(killed, (p) => p.elimination_reason))}`,
    `Mortes por tipo: ${list(tally(deaths, (p) => p.elimination_reason ?? "não informado"))}`,
    `Quem mais eliminou ${stats.player_name} (carrasco): ${list(executioners)}`,
    `Quem ${stats.player_name} mais eliminou: ${list(victims)}`,
    mine.length
      ? `Primeira partida: ${formatDate(mine[0].played_at)}; última: ${formatDate(mine.at(-1)!.played_at)}.`
      : "",
    "",
    "DECKS PILOTADOS:",
    ...(deckLines.length ? deckLines : ["- nenhum"]),
    "",
    "CONFRONTOS DIRETOS:",
    ...(h2hLines.length ? h2hLines : ["- nenhum"]),
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { stats, facts, mine, deaths, executioners, victims, me };
}

const INSIGHT_SYSTEM = `Você é o analista de dados e cronista de um playgroup de Magic: The Gathering no formato Commander (EDH).
Escreva em português do Brasil, em Markdown, entre 250 e 400 palavras, com EXATAMENTE esta estrutura:

### 🔮 Perfil de <nome>
**Arquétipo:** <um nome criativo para o estilo> — uma frase que o resuma.

#### 📊 Em números
3 ou 4 itens com os números mais reveladores, sempre comparando com a média do grupo quando ela for dada.

#### 💪 Pontos fortes
2 ou 3 itens, cada um apoiado em um dado concreto.

#### 🩸 Pontos fracos
2 ou 3 itens, cada um apoiado em um dado concreto.

#### ⚔️ Rivalidades
Confrontos diretos, carrasco e vítima favorita: quem é a pedra no sapato e quem é a presa.

#### 🎯 Para a próxima mesa
2 dicas práticas e específicas (deck, assento, contra quem tomar cuidado, como evitar o tipo de morte mais comum).

#### 🃏 Comandante sugerido
Um comandante real de Magic, com uma justificativa de 1 a 2 frases ligada aos dados (cores, estilo, fraquezas).

Regras:
- Use apenas os dados fornecidos e cite números; nunca invente partidas, cartas jogadas ou resultados.
- Com menos de 5 partidas, avise que a amostra é pequena e trate as conclusões como tendência.
- Linguagem neutra em gênero: refira-se ao jogador pelo nome ou com termos neutros (ex.: "quem joga", "a pessoa"), sem adjetivos no masculino ou feminino.
- Tom bem-humorado de mesa de jogo, sem clichês vazios. Não use tabelas.`;

export async function generatePlayerInsight(supabase: SupabaseClient, userId: string) {
  const { stats, facts, mine, deaths, executioners, victims, me } = await buildPlayerDossier(supabase, userId);

  const fallback = () => {
    if (stats.total_games === 0) {
      return `### 🔮 Perfil de ${stats.player_name}\n\nAinda não há partidas validadas suficientes para traçar um perfil. Bora pra mesa!`;
    }
    const winConds = tally(mine, (p) => (p.is_winner ? p.win_condition : null));
    const commanders = tally(mine, (p) => commanderLabel(p.commander_snapshot));
    const colors = tally(mine, (p) => p.color_identity_snapshot ?? []);
    const deathTypes = tally(deaths, (p) => p.elimination_reason);
    const style =
      winConds[0]?.[0] === "Combo"
        ? "um estilo **combeiro** e paciente, que espera a janela certa"
        : winConds[0]?.[0]?.includes("Stax")
          ? "um estilo de **controle**, que gosta de travar a mesa"
          : stats.total_wins > 0
            ? "um estilo **agressivo**, que vence no combate"
            : "um estilo de **sobrevivência**, ainda à procura da primeira vitória";
    return [
      `### 🔮 Perfil de ${stats.player_name}`,
      "",
      `Com ${stats.total_games} partidas e ${formatPct(stats.overall_winrate)} de vitórias, ${stats.player_name} mostra ${style}.`,
      "",
      ...(me ? [`- **Pontos:** ${me.points} · ⚔ ${me.kills} abate(s) · ☠ ${me.deaths} morte(s)`] : []),
      `- **Comandante favorito:** ${commanders[0]?.[0] ?? "-"}`,
      `- **Cor predominante:** ${colors[0] ? (COLOR_NAMES[colors[0][0]] ?? colors[0][0]) : "Incolor"}`,
      `- **Calcanhar de Aquiles:** costuma cair por ${deathTypes[0]?.[0]?.toLowerCase() ?? "nada ainda"}`,
      ...(executioners[0] ? [`- **Carrasco:** ${executioners[0][0]} (${executioners[0][1]}x)`] : []),
      ...(victims[0] ? [`- **Vítima favorita:** ${victims[0][0]} (${victims[0][1]}x)`] : []),
      `- **Empréstimos:** ${stats.borrowed_deck_games} partidas com deck alheio (${stats.borrowed_deck_wins} vitórias)`,
      "",
      "_Análise gerada localmente (IA não configurada ou indisponível)._",
    ].join("\n");
  };

  const result = await generateAICompletion(facts, INSIGHT_SYSTEM, fallback);
  return { ...result, gamesSnapshot: stats.total_games };
}

let refreshing: Promise<string[]> | null = null;

/** Quantas análises no máximo por ciclo do agendador (5 min), com pausa entre elas. */
const INSIGHTS_PER_TICK = 3;
const PAUSE_MS = 15_000;

/**
 * Análise semanal automática (chamada pelo agendador junto com a Gazeta): refaz
 * o estilo de jogo de quem teve partidas novas desde a última análise, no máximo
 * uma vez por semana por jogador. Quem não jogou mantém a análise anterior e não
 * gasta pedido de IA. Fora disso, só o root gera (rota /api/ai/player-insight).
 */
export function refreshWeeklyInsights(admin: SupabaseClient, now = new Date()): Promise<string[]> {
  refreshing ??= (async () => {
    const cycleStart = new Date(lastCompletedWeek(now).end.getTime() + 1).toISOString(); // segunda 00:00
    const [{ data: stats }, { data: users }, { data: insights }] = await Promise.all([
      admin.from("player_stats").select("user_id, total_games").gt("total_games", 0),
      admin.from("users").select("id, role"),
      admin
        .from("ai_insights")
        .select("user_id, games_snapshot, created_at")
        .eq("insight_type", "player_profile")
        .order("created_at", { ascending: false }),
    ]);
    const roots = new Set((users ?? []).filter((u) => u.role === "root").map((u) => u.id));
    const latest = new Map<string, { games_snapshot: number; created_at: string }>();
    for (const i of insights ?? []) if (!latest.has(i.user_id)) latest.set(i.user_id, i);

    const due = (stats ?? []).filter((p) => {
      const last = latest.get(p.user_id);
      if (roots.has(p.user_id)) return false;
      if (last && last.created_at >= cycleStart) return false; // já feita nesta semana
      return !last || last.games_snapshot !== p.total_games; // só com partidas novas
    });

    const done: string[] = [];
    for (const p of due.slice(0, INSIGHTS_PER_TICK)) {
      if (done.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
      const { content, source, gamesSnapshot } = await generatePlayerInsight(admin, p.user_id);
      const { error } = await admin
        .from("ai_insights")
        .insert({ user_id: p.user_id, insight_type: "player_profile", content, source, games_snapshot: gamesSnapshot });
      if (!error) done.push(p.user_id);
    }
    return done;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
