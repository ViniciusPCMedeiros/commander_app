"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canChangeRole, ROLE_LABEL } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export async function setUserRole(userId: string, role: Role) {
  const { profile } = await requireUser();
  if (userId === profile.id) return { error: "Você não pode alterar o seu próprio papel." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("role").eq("id", userId).single<{ role: Role }>();
  if (!target) return { error: "Usuário não encontrado." };
  if (!canChangeRole(profile.role, target.role, role)) {
    return { error: `Seu papel (${ROLE_LABEL[profile.role]}) não pode mudar ${ROLE_LABEL[target.role]} para ${ROLE_LABEL[role]}.` };
  }

  const { error } = await admin.from("users").update({ role }).eq("id", userId);
  if (error) return { error: error.message };
  // app_metadata: só a service role escreve (o usuário não consegue se promover)
  await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
  revalidatePath("/admin");
  return {};
}
