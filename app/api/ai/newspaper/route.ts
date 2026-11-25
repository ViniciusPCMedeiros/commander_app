import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { regenerateNewspaper } from "@/lib/newspaper";
import { isRoot } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Refaz uma edição semanal (mesma semana de segunda a domingo). Só o root: a
 * Gazeta sai sozinha toda segunda; isto é para quando a IA falhou na hora.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!isRoot(session.profile.role)) {
    return NextResponse.json({ error: "A Gazeta sai automaticamente toda segunda-feira." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  try {
    const { source } = await regenerateNewspaper(createAdminClient(), body.id);
    revalidatePath("/", "layout");
    return NextResponse.json({ source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

/** Última edição arquivada. */
export async function GET() {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data } = await session.supabase
    .from("weekly_newspapers")
    .select("*")
    .order("edition_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ newspaper: data });
}
