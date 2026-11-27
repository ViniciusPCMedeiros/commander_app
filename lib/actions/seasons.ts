"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { syncAchievements } from "@/lib/achievement-sync";
import { RARITY_LABEL, type Rarity } from "@/lib/achievements";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import {
  BASE_SEASON_ACHIEVEMENTS,
  freezeAchievements,
  KILL_REASONS,
  SEASON_ICONS,
  seasonStatus,
  TEMPLATE_BY_ID,
  THEME_COLORS,
  titleFor,
  type Season,
  type SeasonAchievementInput,
} from "@/lib/seasons";
import { publishSeasonNewspaper } from "@/lib/season-newspaper";
import { closeDueSeasons, loadCustomBase, loadSeasons, pendingMatchesIn } from "@/lib/seasons-data";
import { createAdminClient } from "@/lib/supabase/server";

type Result = { error?: string };

async function requireRoot() {
  const ctx = await requireUser();
  if (!isRoot(ctx.profile.role)) throw new Error("Só o root gerencia as temporadas.");
  return ctx;
}

function revalidateSeasons() {
  revalidatePath("/admin/seasons");
  revalidatePath("/seasons");
  revalidatePath("/ranking");
  revalidatePath("/", "layout");
}

/** Confere uma conquista montada no editor (modelo, parâmetros, ícone, raridade). */
function validateAchievement(a: SeasonAchievementInput, i: number): string | null {
  const where = `Conquista ${i + 1}`;
  if (!a.name?.trim() || a.name.trim().length > 40) return `${where}: dê um nome de até 40 caracteres.`;
  const tpl = TEMPLATE_BY_ID.get(a.template);
  if (!tpl) return `${where}: escolha a condição.`;
  if (!(a.icon in SEASON_ICONS)) return `${where}: ícone inválido.`;
  if (!(a.rarity in RARITY_LABEL)) return `${where}: raridade inválida.`;
  const p = a.params ?? {};
  if (tpl.params.includes("n") && !(Number.isInteger(p.n) && p.n! >= 1 && p.n! <= 999))
    return `${where}: a quantidade deve ser de 1 a 999.`;
  if (p.reason && !KILL_REASONS.includes(p.reason)) return `${where}: tipo de abate inválido.`;
  if (tpl.params.includes("color") && !["W", "U", "B", "R", "G"].includes(p.color ?? "")) return `${where}: escolha a cor.`;
  if (tpl.params.includes("k") && !(Number.isInteger(p.k ?? 0) && (p.k ?? 0) >= 0 && (p.k ?? 0) <= 5))
    return `${where}: número de cores de 0 a 5.`;
  return null;
}

/** Só os parâmetros que o modelo usa (descarta sobras do formulário). */
function cleanAchievement(a: SeasonAchievementInput, key: string): SeasonAchievementInput {
  const tpl = TEMPLATE_BY_ID.get(a.template)!;
  const params = Object.fromEntries(
    tpl.params.map((k) => [k, a.params?.[k]]).filter(([, v]) => v !== undefined && v !== ""),
  ) as SeasonAchievementInput["params"];
  return { key, name: a.name.trim(), icon: a.icon, rarity: a.rarity as Rarity, template: a.template, params };
}

const randomKey = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export interface ThemeInput {
  id?: string;
  name: string;
  description: string;
  color: string;
  banner: string;
  banner_credit: string;
  title_lenda: string;
  title_coroa: string;
  achievements: SeasonAchievementInput[];
}

export async function saveTheme(input: ThemeInput): Promise<Result & { id?: string }> {
  const { supabase, profile } = await requireRoot();
  if (!input.name.trim() || input.name.trim().length > 60) return { error: "Dê um nome ao tema (até 60 caracteres)." };
  if (!input.title_lenda.trim() || input.title_lenda.length > 40) return { error: "Preencha o título da Lenda (até 40)." };
  if (!input.title_coroa.trim() || input.title_coroa.length > 40) return { error: "Preencha o título da Coroa (até 40)." };
  if (input.description.length > 500) return { error: "Descrição com no máximo 500 caracteres." };
  if (!(input.color in THEME_COLORS)) return { error: "Cor inválida." };
  if (input.banner && !fs.existsSync(path.join(process.cwd(), "public", "banners", path.basename(input.banner))))
    return { error: "Arte não encontrada em public/banners." };
  if (input.achievements.length > 12) return { error: "No máximo 12 conquistas temáticas." };
  for (const [i, a] of input.achievements.entries()) {
    const problem = validateAchievement(a, i);
    if (problem) return { error: problem };
    if (TEMPLATE_BY_ID.get(a.template)?.final) return { error: `Conquista ${i + 1}: pódio e campeão já estão na lista base.` };
  }
  const row = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    color: input.color,
    banner: input.banner ? path.basename(input.banner) : null,
    banner_credit: input.banner_credit.trim() || null,
    title_lenda: input.title_lenda.trim(),
    title_coroa: input.title_coroa.trim(),
    achievements: input.achievements.map((a) => cleanAchievement(a, a.key || randomKey("tema"))),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = input.id
    ? await supabase.from("season_themes").update(row).eq("id", input.id).select("id").single()
    : await supabase
        .from("season_themes")
        .insert({ ...row, created_by: profile.id })
        .select("id")
        .single();
  if (error) return { error: error.message };
  revalidateSeasons();
  return { id: data.id };
}

export async function deleteTheme(id: string): Promise<Result> {
  const { supabase } = await requireRoot();
  // Temporadas já lançadas guardam uma cópia do tema: excluir não muda nada nelas
  const { error } = await supabase.from("season_themes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateSeasons();
  return {};
}

/**
 * Relançar uma temporada encerrada: devolve o tema dela. Se o tema foi excluído,
 * recria a partir da cópia guardada na temporada (nome, cor, arte, títulos e as
 * conquistas do tema), para poder editar as conquistas antes de lançar de novo.
 */
export async function themeForRelaunch(seasonId: string): Promise<Result & { id?: string }> {
  const { supabase, profile } = await requireRoot();
  const { data: season } = await supabase
    .from("seasons")
    .select("theme_id, theme, achievements")
    .eq("id", seasonId)
    .single<Pick<Season, "theme_id" | "theme" | "achievements">>();
  if (!season) return { error: "Temporada não encontrada." };
  if (season.theme_id) return { id: season.theme_id };

  const t = season.theme;
  const { data, error } = await supabase
    .from("season_themes")
    .insert({
      name: t.name,
      description: t.description,
      color: t.color,
      banner: t.banner,
      banner_credit: t.banner_credit,
      title_lenda: t.title_lenda,
      title_coroa: t.title_coroa,
      achievements: season.achievements.filter((a) => a.source === "tema").map((a) => cleanAchievement(a, a.key)),
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  // A temporada passa a apontar para o tema recriado (um próximo Relançar usa o mesmo)
  await supabase.from("seasons").update({ theme_id: data.id }).eq("id", seasonId);
  revalidateSeasons();
  return { id: data.id };
}

export async function addBaseAchievement(input: SeasonAchievementInput): Promise<Result> {
  const { supabase, profile } = await requireRoot();
  const problem = validateAchievement(input, 0);
  if (problem) return { error: problem.replace("Conquista 1: ", "") };
  const { error } = await supabase
    .from("season_base_achievements")
    .insert({ definition: cleanAchievement(input, randomKey("base")), created_by: profile.id });
  if (error) return { error: error.message };
  revalidateSeasons();
  return {};
}

export async function deleteBaseAchievement(id: string): Promise<Result> {
  const { supabase } = await requireRoot();
  // Só sai das próximas temporadas: as já lançadas têm a lista congelada
  const { error } = await supabase.from("season_base_achievements").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateSeasons();
  return {};
}

export async function launchSeason(input: { themeId: string; startsAt: string; endsAt: string }): Promise<Result> {
  const { supabase, profile } = await requireRoot();
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "Datas inválidas." };
  if (end <= start) return { error: "O fim precisa ser depois do início." };
  if (end <= new Date()) return { error: "O fim precisa estar no futuro." };
  if (end.getTime() - start.getTime() < 24 * 60 * 60 * 1000) return { error: "A temporada precisa ter pelo menos 1 dia." };

  const { data: theme } = await supabase.from("season_themes").select("*").eq("id", input.themeId).single();
  if (!theme) return { error: "Tema não encontrado." };
  const [seasons, customBase] = await Promise.all([loadSeasons(supabase), loadCustomBase(supabase)]);
  const achievements = freezeAchievements(
    [...BASE_SEASON_ACHIEVEMENTS, ...customBase.map((b) => b.definition)],
    theme.achievements as SeasonAchievementInput[],
    start,
    end,
  );
  const { error } = await supabase.from("seasons").insert({
    number: (seasons.at(-1)?.number ?? 0) + 1,
    theme_id: theme.id,
    theme: {
      name: theme.name,
      description: theme.description,
      color: theme.color,
      banner: theme.banner,
      banner_credit: theme.banner_credit,
      title_lenda: theme.title_lenda,
      title_coroa: theme.title_coroa,
    },
    achievements,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    created_by: profile.id,
  });
  if (error) return { error: error.code === "23P01" ? "Já existe uma temporada nesse período." : error.message };
  revalidateSeasons();
  // Partidas já jogadas dentro do período contam na hora
  await syncAchievements(createAdminClient());
  return {};
}

/** Muda a data de fim (só antes de encerrar). As conquistas continuam travadas. */
export async function updateSeasonEnd(seasonId: string, endsAt: string): Promise<Result> {
  const { supabase } = await requireRoot();
  const end = new Date(endsAt);
  const season = (await loadSeasons(supabase)).find((s) => s.id === seasonId);
  if (!season) return { error: "Temporada não encontrada." };
  if (season.closed_at) return { error: "Temporada já encerrada." };
  if (Number.isNaN(end.getTime()) || end <= new Date() || end <= new Date(season.starts_at))
    return { error: "O novo fim precisa estar no futuro e depois do início." };
  const { error } = await supabase.from("seasons").update({ ends_at: end.toISOString() }).eq("id", seasonId);
  if (error) return { error: error.code === "23P01" ? "O novo fim invade a próxima temporada." : error.message };
  revalidateSeasons();
  return {};
}

/**
 * Encerra agora: o fim vira este momento. Pódio, campeão e títulos saem na hora
 * se não houver partida pendente do período; senão, assim que forem moderadas.
 */
export async function endSeasonNow(seasonId: string): Promise<Result & { waiting?: number }> {
  const { supabase } = await requireRoot();
  const season = (await loadSeasons(supabase)).find((s) => s.id === seasonId);
  if (!season) return { error: "Temporada não encontrada." };
  if (seasonStatus(season) !== "active" && seasonStatus(season) !== "ended")
    return { error: "Só dá para encerrar uma temporada em andamento." };
  const admin = createAdminClient();
  const endsAt = seasonStatus(season) === "active" ? new Date().toISOString() : season.ends_at;
  if (endsAt !== season.ends_at) {
    const { error } = await admin.from("seasons").update({ ends_at: endsAt }).eq("id", seasonId);
    if (error) return { error: error.message };
  }
  await syncAchievements(admin);
  const closed = await closeDueSeasons(admin);
  // Edição especial da Gazeta (a IA pode levar alguns segundos); se falhar, a rotina tenta de novo
  for (const s of closed) await publishSeasonNewspaper(admin, s).catch((e) => console.error("Gazeta de encerramento:", e));
  revalidateSeasons();
  revalidatePath("/newspapers");
  if (!closed.length) return { waiting: await pendingMatchesIn(admin, { ...season, ends_at: endsAt }) };
  return {};
}

/** Cancela uma temporada que ainda não começou. */
export async function cancelSeason(seasonId: string): Promise<Result> {
  const { supabase } = await requireRoot();
  const season = (await loadSeasons(supabase)).find((s) => s.id === seasonId);
  if (!season) return { error: "Temporada não encontrada." };
  if (seasonStatus(season) !== "upcoming") return { error: "Só dá para cancelar uma temporada que ainda não começou." };
  const { error } = await supabase.from("seasons").delete().eq("id", seasonId);
  if (error) return { error: error.message };
  revalidateSeasons();
  return {};
}

/** Escolhe o título exibido ao lado do nome (ou nenhum). Confere que o jogador tem o título. */
export async function setDisplayTitle(key: string | null): Promise<Result> {
  const { supabase, profile } = await requireUser();
  const admin = createAdminClient();
  if (!key) {
    await admin.from("users").update({ display_title: null }).eq("id", profile.id);
  } else {
    const [num, kind] = key.split(":");
    if (kind !== "lenda" && kind !== "coroa") return { error: "Título inválido." };
    const season: Season | undefined = (await loadSeasons(supabase)).find((s) => s.number === Number(num));
    if (!season) return { error: "Temporada não encontrada." };
    const { data: owned } = await supabase
      .from("season_unlocks")
      .select("achievement_key")
      .eq("season_id", season.id)
      .eq("user_id", profile.id)
      .eq("achievement_key", kind)
      .maybeSingle();
    if (!owned) return { error: "Você ainda não tem esse título." };
    await admin.from("users").update({ display_title: titleFor(season, kind) }).eq("id", profile.id);
  }
  revalidatePath("/", "layout");
  return {};
}
