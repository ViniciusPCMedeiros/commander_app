"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { AlertTriangle, ClipboardPaste, Crown, Loader2, Minus, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CardListTextarea } from "@/components/card-list-textarea";
import { ScryfallSearch } from "@/components/scryfall-search";
import { addDeckCard, removeDeckCard, replaceDecklist, setCardProxy, setDeckCardQuantity } from "@/lib/actions/decks";
import type { DeckCardInfo } from "@/lib/deck-card-info";
import { PROXY_MARKER } from "@/lib/scryfall";
import type { DeckCard } from "@/lib/types";
import { cn } from "@/lib/utils";

const DECK_SIZE = 100;

/** Ordem dos grupos (como no Moxfield): o primeiro tipo que bater na face frontal decide. */
const GROUPS = [
  { type: "Creature", label: "Criaturas" },
  { type: "Planeswalker", label: "Planeswalkers" },
  { type: "Battle", label: "Batalhas" },
  { type: "Instant", label: "Instantâneas" },
  { type: "Sorcery", label: "Feitiços" },
  { type: "Artifact", label: "Artefatos" },
  { type: "Enchantment", label: "Encantamentos" },
  { type: "Land", label: "Terrenos" },
] as const;

const key = (name: string) => name.split(" // ")[0].trim().toLowerCase();

type Change =
  | { kind: "qty"; id: string; quantity: number }
  | { kind: "remove"; id: string }
  | { kind: "proxy"; id: string; is_proxy: boolean };

export function DeckListEditor({
  deckId,
  cards,
  info,
  deckColors,
}: {
  deckId: string;
  cards: DeckCard[];
  info: Record<string, DeckCardInfo>;
  deckColors: string[];
}) {
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const [list, apply] = useOptimistic(cards, (state, c: Change) =>
    c.kind === "remove"
      ? state.filter((x) => x.id !== c.id)
      : state.map((x) =>
          x.id !== c.id ? x : c.kind === "qty" ? { ...x, quantity: c.quantity } : { ...x, is_proxy: c.is_proxy },
        ),
  );

  const change = (c: Change, action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      apply(c);
      const res = await action();
      if (res.error) toast.error(res.error);
    });

  const add = (name: string) => {
    setAddQuery("");
    setAdding(true);
    startTransition(async () => {
      const res = await addDeckCard(deckId, name);
      setAdding(false);
      if (res.error) toast.error(res.error);
      else toast.success(`+1 ${res.name}`);
    });
  };

  const total = list.reduce((s, c) => s + c.quantity, 0);
  const commanders = list.filter((c) => c.is_commander);
  const main = list.filter((c) => !c.is_commander);

  const offColor = (c: DeckCard) => {
    const ci = info[key(c.card_name)]?.color_identity;
    return !!ci && ci.some((x) => !deckColors.includes(x));
  };
  const notSingleton = (c: DeckCard) => c.quantity > 1 && info[key(c.card_name)] && !info[key(c.card_name)].any_number;
  const offColorCount = main.filter(offColor).length;
  const repeatedCount = main.filter(notSingleton).length;

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const visible = main.filter((c) => !q || c.card_name.toLowerCase().includes(q));
    const byGroup = new Map<string, DeckCard[]>();
    for (const c of visible) {
      const type = (info[key(c.card_name)]?.type_line ?? "").split(" // ")[0];
      const label = GROUPS.find((g) => type.includes(g.type))?.label ?? "Outras";
      byGroup.set(label, [...(byGroup.get(label) ?? []), c]);
    }
    const cmc = (c: DeckCard) => info[key(c.card_name)]?.cmc ?? 0;
    return [...GROUPS.map((g) => g.label), "Outras"]
      .filter((label) => byGroup.has(label))
      .map((label) => ({
        label,
        cards: byGroup.get(label)!.sort((a, b) => cmc(a) - cmc(b) || a.card_name.localeCompare(b.card_name)),
      }));
  }, [main, filter, info]);

  const previewInfo = preview ? info[key(preview)] : null;
  const listText = main.map((c) => `${c.quantity} ${c.card_name}${c.is_proxy ? ` ${PROXY_MARKER}` : ""}`).join("\n");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Cartas</span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-sm tabular-nums",
              total === DECK_SIZE
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
            title="Commander: 100 cartas contando o(s) comandante(s)"
          >
            {total}/{DECK_SIZE}
          </span>
        </CardTitle>
        <CardDescription>
          Cada mudança é salva na hora. Passe o mouse numa carta para ver a imagem.
          {(offColorCount > 0 || repeatedCount > 0) && (
            <span className="mt-1 flex flex-wrap gap-x-3 text-amber-300">
              {offColorCount > 0 && <span>{offColorCount} fora da identidade de cor</span>}
              {repeatedCount > 0 && <span>{repeatedCount} com mais de uma cópia</span>}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <ScryfallSearch
              value={addQuery}
              onChange={setAddQuery}
              onSelect={add}
              placeholder="Adicionar carta ao deck…"
            />
            {adding && (
              <Loader2 className="absolute top-1/2 right-9 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <PasteListDialog deckId={deckId} currentList={listText} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
          <div className="min-w-0 space-y-4">
            {main.length > 8 && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar a lista"
                  aria-label="Filtrar a lista"
                  className="pl-8"
                />
              </div>
            )}

            <section>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
                <Crown className="size-3.5" /> Comandante{commanders.length > 1 && "s"}
              </h3>
              <ul>
                {commanders.map((c) => (
                  <li
                    key={c.id}
                    onMouseEnter={() => setPreview(c.card_name)}
                    className="flex items-center gap-2 rounded px-1 py-1 text-sm font-semibold text-amber-300"
                  >
                    <Thumb src={info[key(c.card_name)]?.image_url} />
                    {c.card_name}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      troque no formulário acima
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {main.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma carta ainda. Busque acima para adicionar uma a uma, ou use “Colar lista”.
              </p>
            )}

            {groups.map((g) => (
              <section key={g.label}>
                <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {g.label} ({g.cards.reduce((s, c) => s + c.quantity, 0)})
                </h3>
                <ul className="divide-y divide-border/50">
                  {g.cards.map((c) => (
                    <li
                      key={c.id}
                      onMouseEnter={() => setPreview(c.card_name)}
                      className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-muted/40"
                    >
                      <Thumb src={info[key(c.card_name)]?.image_url} />
                      <span className={cn("min-w-0 truncate", c.is_proxy && "text-muted-foreground")}>
                        {c.card_name}
                      </span>
                      {offColor(c) && (
                        <span title="Fora da identidade de cor do comandante">
                          <AlertTriangle
                            className="size-3.5 shrink-0 text-rose-400"
                            aria-label="Fora da identidade de cor"
                          />
                        </span>
                      )}
                      {notSingleton(c) && (
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 border-amber-500/40 px-1.5 text-[10px] text-amber-300"
                          title="Commander é singleton: só 1 cópia de cada carta (exceto básicos)"
                        >
                          singleton
                        </Badge>
                      )}

                      <div className="ml-auto flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={c.quantity <= 1}
                          onClick={() =>
                            change({ kind: "qty", id: c.id, quantity: c.quantity - 1 }, () =>
                              setDeckCardQuantity(c.id, c.quantity - 1),
                            )
                          }
                          aria-label={`Diminuir ${c.card_name}`}
                        >
                          <Minus />
                        </Button>
                        <span className="w-5 text-center tabular-nums">{c.quantity}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() =>
                            change({ kind: "qty", id: c.id, quantity: c.quantity + 1 }, () =>
                              setDeckCardQuantity(c.id, c.quantity + 1),
                            )
                          }
                          aria-label={`Aumentar ${c.card_name}`}
                        >
                          <Plus />
                        </Button>
                        <button
                          type="button"
                          onClick={() =>
                            change({ kind: "proxy", id: c.id, is_proxy: !c.is_proxy }, () =>
                              setCardProxy(c.id, !c.is_proxy),
                            )
                          }
                          aria-pressed={c.is_proxy}
                          title={c.is_proxy ? "É proxy — clique para marcar como original" : "Marcar como proxy"}
                          className={cn(
                            "mx-1 rounded border px-1.5 py-px text-[10px] font-medium uppercase transition-colors",
                            c.is_proxy
                              ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                              : "border-transparent text-muted-foreground/50 hover:border-border hover:text-muted-foreground",
                          )}
                        >
                          proxy
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-red-400 hover:text-red-300"
                          onClick={() => change({ kind: "remove", id: c.id }, () => removeDeckCard(c.id))}
                          aria-label={`Remover ${c.card_name}`}
                          title="Remover do deck"
                        >
                          <X />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Pré-visualização da carta sob o mouse (só em telas largas) */}
          <div className="hidden lg:block">
            <div className="sticky top-20">
              {previewInfo?.image_url ? (
                <img
                  src={previewInfo.image_url}
                  alt={preview ?? ""}
                  className="w-full rounded-[4.5%/3.3%] shadow-xl shadow-black/50 ring-1 ring-white/10"
                />
              ) : (
                <div className="flex aspect-[488/680] items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Passe o mouse numa carta da lista
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Thumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="h-8 w-6 shrink-0 rounded-sm object-cover object-top" />
  ) : (
    <div className="h-8 w-6 shrink-0 rounded-sm bg-muted" />
  );
}

/** Troca a lista inteira de uma vez (os comandantes são mantidos). */
function PasteListDialog({ deckId, currentList }: { deckId: string; currentList: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(currentList);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setList(currentList);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClipboardPaste /> Colar lista
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Colar lista</DialogTitle>
          <DialogDescription>
            Substitui a lista atual (os comandantes são mantidos). Adicione <code>{PROXY_MARKER}</code> no fim da linha
            para marcar um proxy.
          </DialogDescription>
        </DialogHeader>
        <CardListTextarea rows={14} value={list} onChange={setList} aria-label="Lista de cartas" />
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
  );
}
