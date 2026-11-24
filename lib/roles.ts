import type { Role } from "@/lib/types";

/**
 * Hierarquia de papéis:
 *   member — joga, registra partidas (pendentes), cuida dos próprios decks e coleção
 *   admin  — + modera/exclui partidas, cria membros, promove membro → admin
 *   root   — tudo, inclusive editar decks de outros e gerenciar qualquer papel
 */
export const ROLE_LABEL: Record<Role, string> = { member: "Membro", admin: "Admin", root: "Root" };

export const ROLES: Role[] = ["member", "admin", "root"];

export const isRoot = (role: Role) => role === "root";

/** Moderar/excluir partidas, registrar partida já aprovada e criar membros. */
export const isModerator = (role: Role) => role === "admin" || role === "root";

/** Papéis que o ator pode dar ao criar uma conta. */
export function creatableRoles(actor: Role): Role[] {
  if (actor === "root") return ROLES;
  if (actor === "admin") return ["member", "admin"];
  return [];
}

/** O ator pode mudar o papel de alguém de `from` para `to`? (A própria conta é bloqueada à parte.) */
export function canChangeRole(actor: Role, from: Role, to: Role): boolean {
  if (from === to) return false;
  if (actor === "root") return true;
  if (actor === "admin") return from === "member" && to === "admin";
  return false;
}
