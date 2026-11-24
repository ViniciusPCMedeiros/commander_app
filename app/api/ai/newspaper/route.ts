import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { generateNewspaper } from "@/lib/newspaper";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Gera a edição do Jornal Semanal com base nos últimos 7 dias. Se já existe
 * uma edição para a mesma semana, ela é atualizada (sem duplicar edições).
 */
export async function POST() {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { summary, headline, content, source } = await generateNewspaper(session.supabase);
  const week_start = summary.weekStart.toISOString().slice(0, 10);
  const week_end = summary.weekEnd.toISOString().slice(0, 10);
  const fields = {
    headline,
    content,
    matches_count: summary.matches.length,
    generated_by: session.profile.id,
    source,
  };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("weekly_newspapers")
    .select("id")
    .eq("week_start", week_start)
    .eq("week_end", week_end)
    .order("edition_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = existing
    ? await admin.from("weekly_newspapers").update(fields).eq("id", existing.id).select("*").single()
    : await admin.from("weekly_newspapers").insert({ ...fields, week_start, week_end }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  revalidatePath("/newspapers");
  revalidatePath(`/newspapers/${data.id}`);
  return NextResponse.json({ newspaper: data, source, updated: Boolean(existing) });
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
