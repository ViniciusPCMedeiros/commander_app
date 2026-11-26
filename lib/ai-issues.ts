import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAIConfigured } from "@/lib/ai";

export interface AIIssues {
  configured: boolean;
  /** Jogadores cuja análise mais recente saiu pelo gerador local. */
  insights: { userId: string; name: string; createdAt: string }[];
  /** Última edição semanal e última de encerramento de temporada que saíram pelo gerador local. */
  newspapers: { id: string; edition: number; weekStart: string; weekEnd: string }[];
  total: number;
}

/**
 * O que a IA deixou no modo local (IA fora do ar ou cota esgotada na hora da
 * rotina semanal). Só o root vê o aviso e pode refazer cada item na mão.
 */
export async function loadAIIssues(admin: SupabaseClient): Promise<AIIssues> {
  const configured = isAIConfigured();
  if (!configured) return { configured, insights: [], newspapers: [], total: 0 };

  const latestEdition = (kind: "weekly" | "season") => {
    const q = admin.from("weekly_newspapers").select("id, edition_number, week_start, week_end, source");
    return (kind === "weekly" ? q.eq("automatic", true) : q.not("season_id", "is", null))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  };
  // A semanal e a de encerramento separadas: as duas podem sair na mesma rodada
  const [{ data: insights }, { data: users }, { data: weekly }, { data: season }] = await Promise.all([
    admin
      .from("ai_insights")
      .select("user_id, source, created_at")
      .eq("insight_type", "player_profile")
      .order("created_at", { ascending: false }),
    admin.from("users").select("id, name, role"),
    latestEdition("weekly"),
    latestEdition("season"),
  ]);

  const latest = new Map<string, { source: string | null; created_at: string }>();
  for (const i of insights ?? []) if (!latest.has(i.user_id)) latest.set(i.user_id, i);
  const fallbackInsights = (users ?? [])
    .filter((u) => u.role !== "root" && latest.get(u.id)?.source === "fallback")
    .map((u) => ({ userId: u.id as string, name: u.name as string, createdAt: latest.get(u.id)!.created_at }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const papers = [weekly, season]
    .filter((n) => n?.source === "fallback")
    .map((n) => ({ id: n!.id, edition: n!.edition_number, weekStart: n!.week_start, weekEnd: n!.week_end }));

  return { configured, insights: fallbackInsights, newspapers: papers, total: fallbackInsights.length + papers.length };
}
