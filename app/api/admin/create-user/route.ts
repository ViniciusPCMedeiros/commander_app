import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { creatableRoles, isModerator, ROLE_LABEL } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!isModerator(session.profile.role)) return NextResponse.json({ error: "Apenas admins." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  } | null;

  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";
  const role = (body?.role ?? "member") as Role;

  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "A senha precisa de ao menos 6 caracteres." }, { status: 400 });
  }
  if (!creatableRoles(session.profile.role).includes(role)) {
    return NextResponse.json(
      { error: `${ROLE_LABEL[session.profile.role]} não pode criar contas com o papel "${body?.role}".` },
      { status: 403 },
    );
  }

  // Service role: cria o usuário já confirmado; o trigger gera o perfil em public.users.
  // O papel fica em app_metadata (o usuário não consegue alterar).
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
    app_metadata: { role },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // O GoTrue grava app_metadata depois do INSERT, então o trigger cria o perfil
  // como "member"; o papel escolhido é aplicado aqui.
  if (role !== "member") {
    const { error: roleError } = await admin.from("users").update({ role }).eq("id", data.user.id);
    if (roleError) return NextResponse.json({ error: `Conta criada, mas falhou ao definir o papel: ${roleError.message}` }, { status: 500 });
  }
  return NextResponse.json({ id: data.user.id, email, name, role }, { status: 201 });
}
