"use client";

import { useOptimistic, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { setCardProxy } from "@/lib/actions/decks";
import { cn } from "@/lib/utils";
import type { DeckCard } from "@/lib/types";

/** Lista do deck; o dono alterna "proxy" por carta (com atualização otimista). */
export function DeckCardList({
  cards,
  rotatingIds,
  canEdit,
}: {
  cards: DeckCard[];
  rotatingIds: string[];
  canEdit: boolean;
}) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    cards,
    (state, update: { id: string; is_proxy: boolean }) =>
      state.map((c) => (c.id === update.id ? { ...c, is_proxy: update.is_proxy } : c)),
  );
  const rotating = new Set(rotatingIds);

  const toggle = (card: DeckCard) =>
    startTransition(async () => {
      setOptimistic({ id: card.id, is_proxy: !card.is_proxy });
      const res = await setCardProxy(card.id, !card.is_proxy);
      if (res.error) toast.error(res.error);
    });

  return (
    <ul className="max-h-96 columns-1 gap-6 overflow-y-auto text-sm sm:columns-2">
      {optimistic.map((c) => (
        <li key={c.id} className="flex items-center gap-2 break-inside-avoid py-0.5">
          <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{c.quantity}</span>
          <span className={cn("min-w-0 truncate", c.is_commander && "font-semibold text-amber-300", c.is_proxy && "text-muted-foreground")}>
            {c.card_name}
          </span>
          {rotating.has(c.id) && !c.is_proxy && <AlertTriangle className="size-3.5 shrink-0 text-amber-400" aria-label="Rotacionada" />}
          {canEdit ? (
            <button
              type="button"
              onClick={() => toggle(c)}
              aria-pressed={c.is_proxy}
              title={c.is_proxy ? "É proxy — clique para marcar como original" : "Marcar como proxy"}
              className={cn(
                "ml-auto shrink-0 rounded border px-1.5 py-px text-[10px] font-medium uppercase transition-colors",
                c.is_proxy
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                  : "border-transparent text-muted-foreground/40 hover:border-border hover:text-muted-foreground",
              )}
            >
              proxy
            </button>
          ) : (
            c.is_proxy && (
              <span className="ml-auto shrink-0 rounded border border-violet-500/50 bg-violet-500/15 px-1.5 py-px text-[10px] font-medium text-violet-300 uppercase">
                proxy
              </span>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

