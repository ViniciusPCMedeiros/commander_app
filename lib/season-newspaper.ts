import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAICompletion } from "@/lib/ai";
import { formatDate } from "@/lib/format";
import { splitHeadline } from "@/lib/newspaper";
import { loadRanking, sortRows } from "@/lib/ranking";
import { RARITY_LABEL } from "@/lib/achievements";
import { seasonLabel, titleFor, type Season } from "@/lib/seasons";
import { loadSeasonBoard, loadSeasonUnlocks } from "@/lib/seasons-data";

/**
 * Edição especial da Gazeta no encerramento de uma temporada: classificação
 * final, campeão, títulos (Coroa e Lenda) e as conquistas de cada um. O texto
 * segue o clima do tema.
 */

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const spDate = (iso: string) => new Date(new Date(iso).getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

async function buildSeasonSummary(admin: SupabaseClient, season: Season) {
  const board = await loadSeasonBoard(admin, season);
  const [ranking, unlocks, { data: users }] = await Promise.all([
    loadRanking(admin, "all", { start: new Date(season.starts_at), end: new Date(season.ends_at) }, board.bonuses),
    loadSeasonUnlocks(admin, season.id),
    admin.from("users").select("id, name, role"),
  ]);
  // O root é invisível para o grupo
  const names = new Map((users ?? []).filter((u) => u.role !== "root").map((u) => [u.id as string, u.name as string]));
  const standings = sortRows(
    ranking.players.filter((p) => names.has(p.id)),
    "points",
  );
  const holders = (key: string) =>
    unlocks.filter((u) => u.achievement_key === key && names.has(u.user_id)).map((u) => names.get(u.user_id)!);
  const perPlayer = [...names.entries()]
    .map(([id, name]) => ({
      name,
      count: unlocks.filter((u) => u.user_id === id && season.achievements.some((a) => a.key === u.achievement_key))
        .length,
    }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    season,
    matches: ranking.matches,
    standings,
    coroa: holders("coroa"),
    lenda: holders("lenda"),
    achievements: season.achievements.map((a) => ({ ...a, holders: holders(a.key) })),
    perPlayer,
    regicides: [
      ...Map.groupBy(
        board.bonuses.filter((b) => b.kind === "regicidio" && names.has(b.playerId)),
        (b) => names.get(b.playerId)!,
      ),
    ]
      .map(([n, list]) => [n, list.length] as const)
      .sort((a, b) => b[1] - a[1]),
    contracts: board.bonuses
      .filter((b) => b.kind === "contrato" && names.has(b.playerId))
      .map((b) => `${names.get(b.playerId)} — ${b.label} (+${b.points})`),
  };
}

type Summary = Awaited<ReturnType<typeof buildSeasonSummary>>;

function summaryToPrompt(s: Summary): string {
  const t = s.season.theme;
  return [
    `TEMPORADA ${s.season.number}: ${t.name}${t.description ? ` — ${t.description}` : ""}`,
    `Período: ${formatDate(s.season.starts_at)} a ${formatDate(s.season.ends_at)}. Partidas aprovadas: ${s.matches}.`,
    "",
    "CLASSIFICAÇÃO FINAL (vitória +4; abate de 0 a +2 conforme o tipo; morte por conta própria −1; Regicídio +2; contratos +1 a +3):",
    ...s.standings.map(
      (p, i) =>
        `- ${i + 1}º ${p.name}: ${p.points} pts (${p.wins}V, ${p.kills} abates, ${p.deaths} mortes em ${p.games} partidas)`,
    ),
    "",
    `Título Coroa (1º lugar) — "${titleFor(s.season, "coroa").label}": ${s.coroa.join(", ") || "ninguém"}.`,
    `Título Lenda (completou todas as conquistas) — "${titleFor(s.season, "lenda").label}": ${s.lenda.join(", ") || "ninguém"}.`,
    "",
    "CONQUISTAS DA TEMPORADA (quem liberou):",
    ...s.achievements.map(
      (a) =>
        `- ${a.name} (${RARITY_LABEL[a.rarity].toLowerCase()}${a.source === "tema" ? ", do tema" : ""}: ${a.description}): ${a.holders.join(", ") || "ninguém"}`,
    ),
    "",
    `Quem mais liberou conquistas: ${s.perPlayer.map((p) => `${p.name} (${p.count})`).join(", ") || "ninguém"}.`,
    `Regicídios (eliminar o Rei da Mesa): ${s.regicides.map(([n, c]) => `${n} (${c})`).join(", ") || "nenhum"}.`,
    `Contratos semanais cumpridos: ${s.contracts.join("; ") || "nenhum"}.`,
  ].join("\n");
}

function system(s: Summary) {
  const t = s.season.theme;
  return `Você é o editor-chefe da "Gazeta do Mesão", o jornal de um playgroup de Magic: The Gathering no formato Commander (EDH).
Escreva a EDIÇÃO ESPECIAL DE ENCERRAMENTO da Temporada ${s.season.number} — "${t.name}". Escreva no clima desse tema${t.description ? ` (${t.description})` : ""}.
Português do Brasil, Markdown, entre 350 e 550 palavras, com EXATAMENTE esta estrutura:

# <Manchete sobre o desfecho da temporada>
Um lead de 2 ou 3 frases: quantas partidas, quem levou e o clima da temporada.

#### 🏆 O grande vencedor
Quem terminou em 1º, com os números que explicam a conquista, e como foi a briga pelo pódio.

#### 📊 Classificação final
Uma lista com a posição, o nome e os pontos de cada jogador.

#### ✨ Títulos
Quem ganhou a Coroa e quem virou Lenda (ou que ninguém completou tudo), em tom de cerimônia.

#### 🎖️ Conquistas da temporada
Os feitos mais raros e quem os conseguiu; destaque quem mais liberou conquistas.

#### 🔮 Até a próxima temporada
1 ou 2 frases de despedida e provocação para a próxima.

Regras:
- Use apenas os dados fornecidos; nunca invente partidas, jogadas, cartas ou resultados.
- Linguagem neutra em gênero: use os nomes, sem adjetivos no masculino ou feminino.
- Emojis com moderação. Não use tabelas.`;
}

function fallback(s: Summary): string {
  const t = s.season.theme;
  const champion = s.standings[0];
  return [
    champion
      ? `# ${champion.name} vence a Temporada ${s.season.number} — ${t.name}`
      : `# Fim da Temporada ${s.season.number} — ${t.name}`,
    "",
    "### 📰 Gazeta do Mesão — Edição de encerramento",
    "",
    `A temporada **${seasonLabel(s.season)}** terminou depois de **${s.matches} partidas** (${formatDate(s.season.starts_at)} a ${formatDate(s.season.ends_at)}).`,
    "",
    "#### 📊 Classificação final",
    ...s.standings.map((p, i) => `- ${i + 1}º ${p.name}: ${p.points} pts · ${p.wins}V · ⚔ ${p.kills} · ☠ ${p.deaths}`),
    "",
    "#### ✨ Títulos",
    `- Coroa (“${titleFor(s.season, "coroa").label}”): ${s.coroa.join(", ") || "ninguém"}`,
    `- Lenda (“${titleFor(s.season, "lenda").label}”): ${s.lenda.join(", ") || "ninguém completou tudo"}`,
    ...(s.perPlayer.length
      ? ["", "#### 🎖️ Quem mais liberou conquistas", ...s.perPlayer.map((p) => `- ${p.name}: ${p.count}`)]
      : []),
    "",
    "_Crônica gerada localmente (IA não configurada ou indisponível)._",
  ].join("\n");
}

export async function generateSeasonNewspaper(admin: SupabaseClient, season: Season) {
  const summary = await buildSeasonSummary(admin, season);
  const { content: raw, source } = summary.matches
    ? await generateAICompletion(summaryToPrompt(summary), system(summary), () => fallback(summary))
    : { content: fallback(summary), source: "fallback" as const };
  const { headline, content } = splitHeadline(raw, `Fim da Temporada ${season.number} — ${season.theme.name}`);
  return { headline, content, source, matches: summary.matches };
}

/** Publica a edição de encerramento (uma por temporada, garantido pelo índice único). */
export async function publishSeasonNewspaper(admin: SupabaseClient, season: Season) {
  const { data: existing } = await admin
    .from("weekly_newspapers")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();
  if (existing) return { status: "exists" as const };
  const { headline, content, source, matches } = await generateSeasonNewspaper(admin, season);
  const { error } = await admin.from("weekly_newspapers").insert({
    week_start: spDate(season.starts_at),
    week_end: spDate(season.ends_at),
    headline,
    content,
    matches_count: matches,
    generated_by: null,
    source,
    automatic: false,
    season_id: season.id,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  return { status: "published" as const, source };
}
