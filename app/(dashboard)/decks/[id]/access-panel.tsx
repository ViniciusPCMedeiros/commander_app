"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { grantDeckPermission, revokeDeckPermission } from "@/lib/actions/deck-permissions";
import { initials } from "@/lib/format";

export function AccessPanel({
  deckId,
  ownerId,
  ownerName,
  allowed,
  players,
  canManage,
  currentUserId,
}: {
  deckId: string;
  ownerId: string;
  ownerName: string;
  allowed: { user_id: string; name: string }[];
  players: { id: string; name: string }[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");

  const allowedIds = new Set(allowed.map((a) => a.user_id));
  const candidates = players.filter((p) => p.id !== ownerId && !allowedIds.has(p.id));

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        after?.();
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" /> Quem pode usar
        </CardTitle>
        <CardDescription>
          Além de {ownerName}, estes membros estão liberados para jogar com o deck.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {allowed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Só {ownerName} por enquanto.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {allowed.map((a) => {
              const canRemove = canManage || a.user_id === currentUserId;
              return (
                <li key={a.user_id} className="flex items-center gap-2 rounded-full border bg-muted/40 py-1 pr-1 pl-1">
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">{initials(a.name)}</AvatarFallback>
                  </Avatar>
                  <Link href={`/players/${a.user_id}`} className="text-sm hover:underline">
                    {a.name}
                  </Link>
                  {canRemove ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6 rounded-full"
                      disabled={pending}
                      aria-label={a.user_id === currentUserId ? "Abrir mão da permissão" : `Remover ${a.name}`}
                      title={a.user_id === currentUserId ? "Abrir mão" : "Remover"}
                      onClick={() => run(() => revokeDeckPermission(deckId, a.user_id), `${a.name} não pode mais usar o deck`)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="w-1" />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canManage && candidates.length > 0 && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = players.find((p) => p.id === userId)?.name;
              run(() => grantDeckPermission(deckId, userId), `${name} agora pode usar o deck`, () => setUserId(""));
            }}
          >
            <NativeSelect aria-label="Liberar para" value={userId} onChange={(e) => setUserId(e.target.value)} className="flex-1">
              <option value="">Liberar para…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={pending || !userId}>
              {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} Liberar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
