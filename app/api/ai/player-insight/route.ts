import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { generatePlayerInsight } from "@/lib/insights";
import { isRoot } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Gera o perfil de estilo de jogo (IA) de um jogador fora do calendário. Só o root:
 * para os demais, a análise é refeita automaticamente uma vez por semana
 * (refreshWeeklyInsights), poupando a cota gratuita de pedidos.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!isRoot(session.profile.role)) {
    return NextResponse.json({ error: "A análise é atualizada automaticamente toda segunda-feira." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId;
  if (!userId) return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });

  try {
    const { content, source, gamesSnapshot } = await generatePlayerInsight(session.supabase, userId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_insights")
      .insert({ user_id: userId, insight_type: "player_profile", content, source, games_snapshot: gamesSnapshot })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidatePath(`/players/${userId}`);
    revalidatePath("/", "layout"); // aviso do root
    return NextResponse.json({ insight: data, source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 404 });
  }
}
