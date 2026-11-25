import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { syncAchievements } from "@/lib/achievement-sync";
import { refreshWeeklyInsights } from "@/lib/insights";
import { publishWeeklyNewspaper } from "@/lib/newspaper";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Chamado pelo agendador interno (instrumentation.ts) a cada 5 minutos. Grava as
 * conquistas novas (rede de segurança: as ações já sincronizam na hora), publica a
 * Gazeta da última semana completa e refaz as análises de quem jogou — essas duas
 * uma única vez por semana; nas outras chamadas não fazem nada.
 * Protegido pela service role key, que só o próprio servidor conhece.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const result: { achievements?: unknown; newspaper?: unknown; insights?: string[]; error?: string } = {};
  try {
    // Antes da Gazeta, para ela já ver as conquistas da semana
    result.achievements = await syncAchievements(admin);
    const newspaper = await publishWeeklyNewspaper(admin);
    result.newspaper = newspaper;
    if (newspaper.status === "published") {
      console.log(`Gazeta: edição #${newspaper.edition} publicada (${newspaper.week}, ${newspaper.source}).`);
      revalidatePath("/");
      revalidatePath("/newspapers");
    }
    result.insights = await refreshWeeklyInsights(admin);
    if (result.insights.length) {
      console.log(`Análises semanais: ${result.insights.length} jogador(es) atualizado(s).`);
      for (const id of result.insights) revalidatePath(`/players/${id}`);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Agendador semanal: falha:", error);
    return NextResponse.json({ ...result, error: "Falha na rotina semanal." }, { status: 500 });
  }
}
