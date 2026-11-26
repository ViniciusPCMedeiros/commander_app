import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  CONTRACT_REWARD,
  WEEKLY_CONTRACTS,
  type ContractTemplate,
  type SeasonContract,
} from "@/lib/contracts";
import {
  closeDeadline,
  computeSeasonUnlocks,
  finalAwards,
  SEASON_LEADER_MIN_GAMES,
  seasonScoreboard,
  spWeekStart,
  type ApprovedClaim,
  seasonStatus,
  type Season,
  type SeasonPart,
  type SeasonTheme,
  type SeasonAchievementInput,
} from "@/lib/seasons";

export interface ThemeRow extends SeasonTheme {
  id: string;
  achievements: SeasonAchievementInput[];
  created_at: string;
}

export interface SeasonUnlockRow {
  season_id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: string;
  match_id: string | null;
}

export async function loadSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data } = await supabase.from("seasons").select("*").order("number");
  return (data ?? []) as Season[];
}

/** Temporada em andamento (ou a que terminou e ainda não foi encerrada). */
export function currentSeason(seasons: Season[], now = new Date()): Season | null {
  return seasons.find((s) => ["active", "ended"].includes(seasonStatus(s, now))) ?? null;
}

/** Início sugerido para lançar: logo depois da última temporada aberta, ou a próxima hora cheia. */
export function suggestedStart(seasons: Season[], now = new Date()): Date {
  const lastEnd = seasons.filter((s) => seasonStatus(s, now) !== "closed").at(-1)?.ends_at;
  if (lastEnd && new Date(lastEnd) > now) return new Date(lastEnd);
  return new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
}

export async function loadThemes(supabase: SupabaseClient): Promise<ThemeRow[]> {
  const { data } = await supabase.from("season_themes").select("*").order("created_at");
  return (data ?? []) as ThemeRow[];
}

export async function loadCustomBase(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("season_base_achievements")
    .select("id, definition, created_at")
    .order("created_at");
  return (data ?? []) as { id: string; definition: SeasonAchievementInput; created_at: string }[];
}

export async function loadSeasonUnlocks(supabase: SupabaseClient, seasonId?: string): Promise<SeasonUnlockRow[]> {
  return fetchAll<SeasonUnlockRow>((from, to) => {
    let q = supabase.from("season_unlocks").select("season_id, user_id, achievement_key, unlocked_at, match_id");
    if (seasonId) q = q.eq("season_id", seasonId);
    return q.order("unlocked_at").order("user_id").order("achievement_key").range(from, to);
  });
}

export async function seasonParts(supabase: SupabaseClient, season: Pick<Season, "starts_at" | "ends_at">): Promise<SeasonPart[]> {
  return fetchAll<SeasonPart>((from, to) =>
    supabase
      .from("approved_participations")
      .select(
        "match_id, pilot_id, deck_id, deck_owner_id, color_identity_snapshot, is_winner, seat_order, elimination_reason, eliminated_by, played_at",
      )
      .gte("played_at", season.starts_at)
      .lt("played_at", season.ends_at)
      .order("played_at")
      .order("id")
      .range(from, to),
  );
}

/** Contratos aprovados da temporada (com o título, para os selos e a Gazeta). */
export async function loadApprovedClaims(supabase: SupabaseClient, seasonId: string): Promise<ApprovedClaim[]> {
  const rows = await fetchAll<{ match_id: string; user_id: string; points: number; contract: { title: string } }>(
    (from, to) =>
      supabase
        .from("contract_claims")
        .select("match_id, user_id, points, contract:season_contracts!inner ( title, season_id )")
        .eq("status", "approved")
        .eq("contract.season_id", seasonId)
        .order("created_at")
        .order("id")
        .range(from, to)
        .returns<{ match_id: string; user_id: string; points: number; contract: { title: string } }[]>(),
  );
  return rows.map((r) => ({ match_id: r.match_id, user_id: r.user_id, points: r.points, title: r.contract.title }));
}

/**
 * Classificação da temporada com Rei da Mesa, Regicídio e contratos (ver
 * seasonScoreboard). Serve para o ranking, a página da temporada e os selos.
 */
export async function loadSeasonBoard(supabase: SupabaseClient, season: Season, until?: Date) {
  const endsAt = until && until < new Date(season.ends_at) ? until.toISOString() : season.ends_at;
  const [parts, claims, visible] = await Promise.all([
    seasonParts(supabase, { starts_at: season.starts_at, ends_at: endsAt }),
    loadApprovedClaims(supabase, season.id),
    visiblePlayers(supabase),
  ]);
  return seasonScoreboard(parts, claims, visible);
}

/** Rei da Mesa atual: o líder da temporada em andamento (com o mínimo de partidas). */
export async function currentKing(supabase: SupabaseClient, seasons: Season[]) {
  const season = seasons.find((s) => seasonStatus(s) === "active");
  if (!season) return { season: null, board: null, king: null };
  const board = await loadSeasonBoard(supabase, season);
  const [first] = board.standings;
  return { season, board, king: first && first[1].games >= SEASON_LEADER_MIN_GAMES ? first[0] : null };
}

/** Jogadores que podem ganhar conquistas (todos menos o root), com o nome para o desempate. */
export async function visiblePlayers(admin: SupabaseClient) {
  const { data, error } = await admin.from("users").select("id, name, role");
  // Sem a lista, a temporada fecharia sem ninguém na classificação: melhor falhar e tentar de novo
  if (error || !data) throw new Error(`Falha ao carregar os jogadores: ${error?.message}`);
  return new Map(data.filter((u) => u.role !== "root").map((u) => [u.id as string, u.name as string]));
}

/** Partidas do período e reivindicações de contrato da temporada ainda esperando moderação. */
export async function pendingMatchesIn(supabase: SupabaseClient, season: Season): Promise<number> {
  const [matches, claims] = await Promise.all([
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("played_at", season.starts_at)
      .lt("played_at", season.ends_at),
    supabase
      .from("contract_claims")
      .select("id, contract:season_contracts!inner ( season_id )", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("contract.season_id", season.id),
  ]);
  if (matches.error) throw matches.error;
  if (claims.error) throw claims.error;
  return (matches.count ?? 0) + (claims.count ?? 0);
}

const CHUNK = 200;

/**
 * Grava as conquistas de partida de cada temporada já iniciada e o progresso.
 * Mesmas regras das conquistas gerais: uma vez gravada, fica — só sai se a
 * partida que a deu for rejeitada (aqui) ou excluída (ON DELETE CASCADE).
 */
export async function syncSeasons(admin: SupabaseClient): Promise<{ added: number; removed: number }> {
  const now = new Date();
  const seasons = (await loadSeasons(admin)).filter((s) => seasonStatus(s, now) !== "upcoming");
  if (!seasons.length) return { added: 0, removed: 0 };
  const visible = await visiblePlayers(admin);

  // Partidas que deixaram de estar aprovadas levam as conquistas junto
  const linked = await fetchAll<{ match_id: string; match: { status: string } | null }>((from, to) =>
    admin
      .from("season_unlocks")
      .select("match_id, match:matches ( status )")
      .not("match_id", "is", null)
      .order("season_id")
      .order("user_id")
      .order("achievement_key")
      .range(from, to)
      .returns<{ match_id: string; match: { status: string } | null }[]>(),
  );
  const invalid = [...new Set(linked.filter((r) => r.match?.status !== "approved").map((r) => r.match_id))];
  let removed = 0;
  for (let i = 0; i < invalid.length; i += CHUNK) {
    const { error, count } = await admin
      .from("season_unlocks")
      .delete({ count: "exact" })
      .in("match_id", invalid.slice(i, i + CHUNK));
    if (error) throw error;
    removed += count ?? 0;
  }

  const stored = await loadSeasonUnlocks(admin);
  const have = new Set(stored.map((r) => `${r.season_id}:${r.user_id}:${r.achievement_key}`));
  let added = 0;
  for (const season of seasons) {
    const { unlocks, progress } = computeSeasonUnlocks(
      season,
      await seasonParts(admin, season),
      visible,
      await loadApprovedClaims(admin, season.id),
    );
    const rows = unlocks
      .filter((u) => !have.has(`${season.id}:${u.playerId}:${u.key}`))
      .map((u) => ({
        season_id: season.id,
        user_id: u.playerId,
        achievement_key: u.key,
        unlocked_at: u.at,
        match_id: u.matchId,
      }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await admin
        .from("season_unlocks")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "season_id,user_id,achievement_key", ignoreDuplicates: true });
      if (error) throw error;
    }
    added += rows.length;
    // Progresso só muda enquanto a temporada não fecha
    if (seasonStatus(season, now) !== "closed") {
      // Quem ficou sem partida aprovada no período (ex.: a única foi rejeitada) perde a linha
      const keep = [...progress.keys()];
      let stale = admin.from("season_progress").delete().eq("season_id", season.id);
      if (keep.length) stale = stale.not("user_id", "in", `(${keep.join(",")})`);
      const { error: staleError } = await stale;
      if (staleError) throw staleError;
      const progressRows = [...progress.entries()].map(([userId, p]) => ({
        season_id: season.id,
        user_id: userId,
        progress: p,
        updated_at: now.toISOString(),
      }));
      for (let i = 0; i < progressRows.length; i += CHUNK) {
        const { error } = await admin
          .from("season_progress")
          .upsert(progressRows.slice(i, i + CHUNK), { onConflict: "season_id,user_id" });
        if (error) throw error;
      }
    }
  }
  return { added, removed };
}

/**
 * Encerra as temporadas que passaram da data de fim: pódio, campeão, Coroa e
 * Lenda (gravados com a data de fim) e marca closed_at. Espera as partidas do
 * período serem aprovadas (ou rejeitadas), até CLOSE_GRACE_DAYS depois do fim,
 * para os prêmios saírem com o resultado final. Chame depois de syncSeasons,
 * para a Lenda ver todas as conquistas de partida.
 */
export async function closeDueSeasons(admin: SupabaseClient): Promise<Season[]> {
  const now = new Date();
  const ended = (await loadSeasons(admin)).filter((s) => seasonStatus(s, now) === "ended");
  if (!ended.length) return [];
  const visible = await visiblePlayers(admin);
  const closed: Season[] = [];

  for (const season of ended) {
    if (now < closeDeadline(season) && (await pendingMatchesIn(admin, season)) > 0) continue;

    // Prêmios antes de marcar closed_at: se algo falhar no meio, a próxima rodada
    // tenta de novo (o upsert ignora o que já foi gravado)
    const { standings } = computeSeasonUnlocks(
      season,
      await seasonParts(admin, season),
      visible,
      await loadApprovedClaims(admin, season.id),
    );
    const stored = await loadSeasonUnlocks(admin, season.id);
    const have = new Map<string, Set<string>>();
    for (const r of stored) have.set(r.user_id, new Set([...(have.get(r.user_id) ?? []), r.achievement_key]));
    const awards = finalAwards(season, standings, have).map((a) => ({
      season_id: season.id,
      user_id: a.playerId,
      achievement_key: a.key,
      unlocked_at: season.ends_at,
      match_id: null,
    }));
    if (awards.length) {
      const { error } = await admin
        .from("season_unlocks")
        .upsert(awards, { onConflict: "season_id,user_id,achievement_key", ignoreDuplicates: true });
      if (error) throw error;
    }

    // Duas rotinas ao mesmo tempo: só uma marca (e publica a Gazeta)
    const { data: claimed, error } = await admin
      .from("seasons")
      .update({ closed_at: now.toISOString() })
      .eq("id", season.id)
      .is("closed_at", null)
      .select("id");
    if (error) throw error;
    if (claimed?.length) closed.push({ ...season, closed_at: now.toISOString() });
  }
  return closed;
}

/** Temporadas encerradas há pouco que ainda não têm a edição de encerramento da Gazeta. */
export async function seasonsMissingNewspaper(admin: SupabaseClient): Promise<Season[]> {
  const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recent = (await loadSeasons(admin)).filter((s) => s.closed_at && new Date(s.closed_at).getTime() > since);
  if (!recent.length) return [];
  const { data, error } = await admin
    .from("weekly_newspapers")
    .select("season_id")
    .in(
      "season_id",
      recent.map((s) => s.id),
    );
  if (error) throw error;
  const done = new Set((data ?? []).map((r) => r.season_id as string));
  return recent.filter((s) => !done.has(s.id));
}

// ------------------------------------------------------------------ Contratos

export async function loadContractTemplates(supabase: SupabaseClient): Promise<ContractTemplate[]> {
  const { data } = await supabase.from("contract_templates").select("id, title, description, rarity, active").order("created_at");
  return (data ?? []) as ContractTemplate[];
}

export async function loadSeasonContracts(supabase: SupabaseClient, seasonId: string): Promise<SeasonContract[]> {
  const { data } = await supabase
    .from("season_contracts")
    .select("id, season_id, template_id, title, description, rarity, reward, starts_at, ends_at")
    .eq("season_id", seasonId)
    .order("starts_at", { ascending: false })
    .order("created_at");
  return (data ?? []) as SeasonContract[];
}

/**
 * Sorteia `n` modelos ativos e abre os contratos da semana. Evita repetir os que
 * já estão em jogo e os da semana anterior (se o catálogo permitir).
 */
export async function drawContracts(admin: SupabaseClient, season: Season, n: number, at = new Date()) {
  const [templates, current] = await Promise.all([loadContractTemplates(admin), loadSeasonContracts(admin, season.id)]);
  const { start } = spWeekStart(at);
  const lastWeek = new Date(start.getTime() - WEEK_MS);
  const recent = new Set(current.filter((c) => new Date(c.ends_at) > lastWeek).map((c) => c.template_id));
  const active = templates.filter((t) => t.active);
  const fresh = active.filter((t) => !recent.has(t.id));
  const shuffle = <T,>(list: T[]) => {
    // Fisher–Yates
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  // Primeiro os inéditos; se faltar, completa com os outros
  const picked = [...shuffle(fresh), ...shuffle(active.filter((t) => recent.has(t.id)))].slice(0, n);
  const startsAt = new Date(Math.max(start.getTime(), new Date(season.starts_at).getTime()));
  const endsAt = new Date(Math.min(start.getTime() + WEEK_MS, new Date(season.ends_at).getTime()));
  const rows = picked.map((t) => ({
    season_id: season.id,
    template_id: t.id,
    title: t.title,
    description: t.description,
    rarity: t.rarity,
    reward: CONTRACT_REWARD[t.rarity],
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  }));
  if (!rows.length) return 0;
  const { error } = await admin.from("season_contracts").insert(rows);
  if (error) throw error;
  return rows.length;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rotina dos contratos (a cada rodada do agendador; só age uma vez por semana):
 * sorteia os contratos da semana enquanto a temporada está em andamento. Os da
 * semana anterior que ninguém cumpriu expiram sozinhos (o prazo era a semana).
 */
export async function runContractWeek(admin: SupabaseClient, now = new Date()) {
  const seasons = (await loadSeasons(admin)).filter((s) => seasonStatus(s, now) === "active");
  let drawn = 0;
  for (const season of seasons) {
    const { day } = spWeekStart(now);
    const { error: lockError } = await admin.from("contract_draws").insert({ season_id: season.id, week_start: day });
    if (lockError) {
      if (lockError.code === "23505") continue; // já sorteado nesta semana
      throw lockError;
    }
    try {
      drawn += await drawContracts(admin, season, WEEKLY_CONTRACTS, now);
    } catch (error) {
      // Libera a trava para a próxima rodada tentar de novo
      await admin.from("contract_draws").delete().eq("season_id", season.id).eq("week_start", day);
      throw error;
    }
  }
  return { drawn };
}

/** Contratos em aberto agora (temporada em andamento, no prazo e sem dono), para o Painel. */
export async function loadOpenContracts(supabase: SupabaseClient, now = new Date()) {
  const season = (await loadSeasons(supabase)).find((s) => seasonStatus(s, now) === "active");
  if (!season) return { season: null, contracts: [] as (SeasonContract & { takers: string[]; inReview: boolean })[] };
  const contracts = (await loadSeasonContracts(supabase, season.id)).filter((c) => new Date(c.ends_at) > now);
  if (!contracts.length) return { season, contracts: [] };
  const ids = contracts.map((c) => c.id);
  const [{ data: winners }, { data: takers }] = await Promise.all([
    supabase.from("contract_claims").select("contract_id, status").neq("status", "rejected").in("contract_id", ids),
    supabase.from("contract_takers").select("contract_id, user_id").in("contract_id", ids).order("created_at"),
  ]);
  const claimed = new Set((winners ?? []).filter((w) => w.status === "approved").map((w) => w.contract_id as string));
  const inReview = new Set((winners ?? []).filter((w) => w.status === "pending").map((w) => w.contract_id as string));
  return {
    season,
    contracts: contracts
      .filter((c) => !claimed.has(c.id))
      .map((c) => ({
        ...c,
        inReview: inReview.has(c.id),
        takers: (takers ?? []).filter((t) => t.contract_id === c.id).map((t) => t.user_id as string),
      }))
      .sort((a, b) => b.reward - a.reward || a.ends_at.localeCompare(b.ends_at)),
  };
}
