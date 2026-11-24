import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { generatePlayerInsight } from "@/lib/insights";
import { createAdminClient } from "@/lib/supabase/server";

/** Gera o perfil de estilo de jogo (IA) de um jogador e salva em ai_insights. */
export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId;
  if (!userId) return NextResponse.json({ error: "userId é obrigatório." }, { status: 400 });

  try {
    const { content, source, gamesSnapshot } = await generatePlayerInsight(session.supabase, userId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ai_insights")
      .insert({ user_id: userId, insight_type: "player_profile", content, games_snapshot: gamesSnapshot })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    revalidatePath(`/players/${userId}`);
    return NextResponse.json({ insight: data, source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 404 });
  }
}
