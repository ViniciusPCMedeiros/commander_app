import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { syncAchievements } from "@/lib/achievement-sync";
import { refreshWeeklyInsights } from "@/lib/insights";
import { publishSeasonNewspaper } from "@/lib/season-newspaper";
import { closeDueSeasons, seasonsMissingNewspaper } from "@/lib/seasons-data";
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
  const result: {
    achievements?: unknown;
    seasons?: number[];
    newspaper?: unknown;
    insights?: string[];
    error?: string;
  } = {};
  try {
    // Antes da Gazeta, para ela já ver as conquistas da semana
    result.achievements = await syncAchievements(admin);
    // Temporadas vencidas (sem partidas pendentes do período): pódio, campeão, Coroa e Lenda
    const closed = await closeDueSeasons(admin);
    if (closed.length) {
      result.seasons = closed.map((c) => c.number);
      console.log(`Temporada(s) encerrada(s): ${closed.map((c) => `T${c.number}`).join(", ")}.`);
      revalidatePath("/", "layout");
    }
    // Edição de encerramento: também refaz as que falharam em rodadas anteriores.
    // Uma falha aqui não impede a Gazeta semanal.
    for (const season of await seasonsMissingNewspaper(admin)) {
      try {
        const res = await publishSeasonNewspaper(admin, season);
        if (res.status === "published") {
          console.log(`Gazeta: edição de encerramento da T${season.number} publicada (${res.source}).`);
          revalidatePath("/newspapers");
        }
      } catch (error) {
        console.error(`Gazeta: falha na edição de encerramento da T${season.number}:`, error);
      }
    }
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
