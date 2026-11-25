"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteDeck, toggleDeckActive } from "@/lib/actions/decks";

export function DeckOwnerActions({
  deckId,
  deckName,
  isActive,
  hasMatches,
}: {
  deckId: string;
  deckName: string;
  isActive: boolean;
  hasMatches: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/decks/${deckId}/edit`}>
          <Pencil /> Editar deck
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await toggleDeckActive(deckId, !isActive);
            if (res.error) toast.error(res.error);
            else toast.success(isActive ? "Deck aposentado" : "Deck reativado");
          })
        }
      >
        {isActive ? <Archive /> : <ArchiveRestore />} {isActive ? "Aposentar" : "Reativar"}
      </Button>
      {!isActive && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={hasMatches}
              title={hasMatches ? "Decks que já jogaram partidas ficam no histórico" : undefined}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 /> Excluir
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir “{deckName}”?</DialogTitle>
              <DialogDescription>
                O deck nunca entrou em partida. A lista de cartas e as permissões de uso são apagadas junto. Não dá para
                desfazer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteDeck(deckId);
                    if (res?.error) toast.error(res.error);
                  })
                }
              >
                {pending && <Loader2 className="animate-spin" />} Excluir deck
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
