"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { setUserRole } from "@/lib/actions/admin";
import { canChangeRole, ROLE_LABEL, ROLES } from "@/lib/roles";
import type { Role } from "@/lib/types";

/** Mostra só as mudanças de papel que o ator pode fazer neste usuário. */
export function RoleSelect({ userId, role, actorRole, isSelf }: { userId: string; role: Role; actorRole: Role; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const options = ROLES.filter((r) => r === role || (!isSelf && canChangeRole(actorRole, role, r)));

  return (
    <NativeSelect
      aria-label="Papel"
      value={role}
      disabled={pending || options.length <= 1}
      title={options.length <= 1 ? (isSelf ? "Você não pode alterar o seu próprio papel" : "Sem permissão para alterar") : undefined}
      className="w-32"
      onChange={(e) =>
        startTransition(async () => {
          const res = await setUserRole(userId, e.target.value as Role);
          if (res.error) toast.error(res.error);
          else toast.success("Papel atualizado");
        })
      }
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </NativeSelect>
  );
}
