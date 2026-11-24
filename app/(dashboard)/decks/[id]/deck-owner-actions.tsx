"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, ListPlus, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { replaceDecklist, toggleDeckActive } from "@/lib/actions/decks";

export function DeckOwnerActions({ deckId, isActive, currentList }: { deckId: string; isActive: boolean; currentList: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(currentList);

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <ListPlus /> Editar lista
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista de cartas</DialogTitle>
            <DialogDescription>
              Substitui a lista atual (os comandantes são mantidos). Adicione <code>[proxy]</code> no fim da linha para marcar um proxy.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={14} className="font-mono text-xs" value={list} onChange={(e) => setList(e.target.value)} />
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await replaceDecklist(deckId, list);
                  if (res.error) toast.error(res.error);
                  else {
                    toast.success(`${res.count} cartas salvas`);
                    setOpen(false);
                  }
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Salvar lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    </div>
  );
}
