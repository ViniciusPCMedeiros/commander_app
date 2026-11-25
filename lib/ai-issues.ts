import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAIConfigured } from "@/lib/ai";

export interface AIIssues {
  configured: boolean;
  /** Jogadores cuja análise mais recente saiu pelo gerador local. */
  insights: { userId: string; name: string; createdAt: string }[];
  /** Última edição automática da Gazeta, se ela saiu pelo gerador local. */
  newspaper: { id: string; edition: number; weekStart: string; weekEnd: string } | null;
  total: number;
}

/**
 * O que a IA deixou no modo local (IA fora do ar ou cota esgotada na hora da
 * rotina semanal). Só o root vê o aviso e pode refazer cada item na mão.
 */
export async function loadAIIssues(admin: SupabaseClient): Promise<AIIssues> {
  const configured = isAIConfigured();
  if (!configured) return { configured, insights: [], newspaper: null, total: 0 };

  const [{ data: insights }, { data: users }, { data: newspaper }] = await Promise.all([
    admin
      .from("ai_insights")
      .select("user_id, source, created_at")
      .eq("insight_type", "player_profile")
      .order("created_at", { ascending: false }),
    admin.from("users").select("id, name, role"),
    admin
      .from("weekly_newspapers")
      .select("id, edition_number, week_start, week_end, source")
      .eq("automatic", true)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latest = new Map<string, { source: string | null; created_at: string }>();
  for (const i of insights ?? []) if (!latest.has(i.user_id)) latest.set(i.user_id, i);
  const fallbackInsights = (users ?? [])
    .filter((u) => u.role !== "root" && latest.get(u.id)?.source === "fallback")
    .map((u) => ({ userId: u.id as string, name: u.name as string, createdAt: latest.get(u.id)!.created_at }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const paper =
    newspaper?.source === "fallback"
      ? {
          id: newspaper.id,
          edition: newspaper.edition_number,
          weekStart: newspaper.week_start,
          weekEnd: newspaper.week_end,
        }
      : null;

  return { configured, insights: fallbackInsights, newspaper: paper, total: fallbackInsights.length + (paper ? 1 : 0) };
}
