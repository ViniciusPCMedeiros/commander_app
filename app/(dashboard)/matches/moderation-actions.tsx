"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMatch, moderateMatch } from "@/lib/actions/matches";

export function ModerationActions({ matchId, status, canEdit }: { matchId: string; status: string; canEdit?: boolean }) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(ok);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "approved" && (
        <Button
          size="sm"
          disabled={pending}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
          onClick={() => run(() => moderateMatch(matchId, "approved"), "Partida aprovada")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Aprovar
        </Button>
      )}
      {status !== "rejected" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => moderateMatch(matchId, "rejected"), "Partida rejeitada")}
        >
          <X /> Rejeitar
        </Button>
      )}
      {canEdit && (
        <Button asChild size="sm" variant="outline" disabled={pending}>
          <Link href={`/matches/${matchId}/edit`}>
            <Pencil /> Editar
          </Link>
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        className="text-red-400 hover:text-red-300"
        onClick={() => {
          if (confirm("Excluir esta partida definitivamente?")) run(() => deleteMatch(matchId), "Partida excluída");
        }}
      >
        <Trash2 /> Excluir
      </Button>
    </div>
  );
}
