"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPips } from "@/components/color-pips";
import { deleteCollectionCard, updateCollectionCard } from "@/lib/actions/collection";
import type { CollectionStatus, ProxyCard, UsageStatus } from "@/lib/types";

const STATUS: Record<UsageStatus, { label: string; className: string }> = {
  free: { label: "Livre", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  partial_free: { label: "Parcial livre", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  allocated: { label: "Alocada", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  shared_rotation: { label: "Rotacionada", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

export type CollectionFilter = "all" | "free" | "allocated" | "shared_rotation" | "trade" | "proxies" | "needed";

type Row = { kind: "card"; card: CollectionStatus } | { kind: "proxy"; proxy: ProxyCard };

function CardThumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <img src={src} alt="" className="h-12 w-9 shrink-0 rounded object-cover" loading="lazy" />
  ) : (
    <div className="h-12 w-9 shrink-0 rounded bg-muted" />
  );
}

function DeckLinks({ names, ids }: { names: string[]; ids: string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={`${ids[i]}-${i}`}>
          {i > 0 && ", "}
          <Link href={`/decks/${ids[i]}`} className="hover:underline">
            {name}
          </Link>
        </span>
      ))}
    </>
  );
}

export function CollectionTable({
  cards,
  proxies,
  editable,
  initialFilter = "all",
}: {
  cards: CollectionStatus[];
  proxies: ProxyCard[];
  editable: boolean;
  initialFilter?: CollectionFilter;
}) {
  const [filter, setFilter] = useState<CollectionFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: cards.length + proxies.length,
      free: cards.filter((c) => c.usage_status === "free" || c.usage_status === "partial_free").length,
      allocated: cards.filter((c) => c.usage_status === "allocated").length,
      shared_rotation: cards.filter((c) => c.usage_status === "shared_rotation").length,
      trade: cards.filter((c) => c.available_for_trade).length,
      proxies: proxies.length,
      needed: proxies.filter((p) => p.needed_qty > 0).length,
    }),
    [cards, proxies],
  );

  const rows: Row[] = useMemo(() => {
    const matches = (name: string) => !query || name.toLowerCase().includes(query.toLowerCase());
    const cardRows: Row[] = cards
      .filter((c) => matches(c.card_name))
      .filter((c) => {
        switch (filter) {
          case "all":
            return true;
          case "free":
            return c.usage_status === "free" || c.usage_status === "partial_free";
          case "trade":
            return c.available_for_trade;
          case "proxies":
          case "needed":
            return false;
          default:
            return c.usage_status === filter;
        }
      })
      .map((card) => ({ kind: "card", card }));
    const proxyRows: Row[] =
      filter === "all" || filter === "proxies" || filter === "needed"
        ? proxies
            .filter((p) => matches(p.card_name) && (filter !== "needed" || p.needed_qty > 0))
            .map((proxy) => ({ kind: "proxy", proxy }))
        : [];
    const nameOf = (r: Row) => (r.kind === "card" ? r.card.card_name : r.proxy.card_name);
    return [...cardRows, ...proxyRows].sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || (a.kind === "card" ? -1 : 1));
  }, [cards, proxies, filter, query]);

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as CollectionFilter)} className="max-w-full overflow-x-auto">
          <TabsList>
            <TabsTrigger value="all">Todas ({counts.all})</TabsTrigger>
            <TabsTrigger value="free">Livres ({counts.free})</TabsTrigger>
            <TabsTrigger value="allocated">Alocadas ({counts.allocated})</TabsTrigger>
            <TabsTrigger value="shared_rotation">Rotacionadas ({counts.shared_rotation})</TabsTrigger>
            <TabsTrigger value="trade">Troca ({counts.trade})</TabsTrigger>
            <TabsTrigger value="proxies">Proxies ({counts.proxies})</TabsTrigger>
            <TabsTrigger value="needed">Precisa ({counts.needed})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome" className="pl-8" />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Carta</TableHead>
              <TableHead className="text-center">Qtd</TableHead>
              <TableHead className="hidden text-center sm:table-cell">Em decks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Troca</TableHead>
              {editable && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhuma carta.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              if (row.kind === "proxy") {
                const p = row.proxy;
                return (
                  <TableRow key={`proxy-${p.card_name}`} className="bg-violet-500/[0.03]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <CardThumb src={p.image_url} />
                          <span className="absolute inset-x-0 bottom-0 rounded-b bg-violet-600/90 text-center text-[8px] font-bold text-white uppercase">
                            proxy
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.card_name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{p.type_line}</span>
                            {p.color_identity && (
                              <ColorPips colors={p.color_identity} className="hidden sm:inline-flex [&>span]:size-4 [&>span]:text-[8px]" />
                            )}
                          </div>
                          <div className="truncate text-xs text-violet-300/80">
                            ↳ proxy em <DeckLinks names={p.proxy_in_decks} ids={p.proxy_in_deck_ids} />
                          </div>
                          {p.owned_originals > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {p.owned_originals} original(is) na coleção, {p.free_originals} livre(s)
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-violet-300 tabular-nums">{p.proxy_qty}</TableCell>
                    <TableCell className="hidden text-center tabular-nums sm:table-cell">{p.proxy_in_decks.length}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline" className="border-violet-500/40 bg-violet-500/15 text-violet-300">
                          Proxy
                        </Badge>
                        {p.needed_qty > 0 ? (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                            Precisa de {p.needed_qty}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300" title="Há cópia original livre: dá para trocar o proxy">
                            Original livre
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-48 text-xs md:table-cell">
                      {p.needed_qty > 0 && p.trade_offers?.length ? (
                        <span className="text-emerald-300">
                          Para troca com{" "}
                          {p.trade_offers.map((o, i) => (
                            <span key={o.user_id}>
                              {i > 0 && ", "}
                              <Link href={`/players/${o.user_id}`} className="underline">
                                {o.name}
                              </Link>
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {editable && <TableCell />}
                  </TableRow>
                );
              }

              const c = row.card;
              const st = STATUS[c.usage_status];
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CardThumb src={c.image_url} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.card_name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{c.type_line}</span>
                          <ColorPips colors={c.color_identity} className="hidden sm:inline-flex [&>span]:size-4 [&>span]:text-[8px]" />
                        </div>
                        {c.used_in_decks.length > 0 && (
                          <div className="truncate text-xs text-muted-foreground">
                            ↳ <DeckLinks names={c.used_in_decks} ids={c.used_in_deck_ids} />
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {editable ? (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={pending || c.owned_qty <= 1}
                          onClick={() => run(() => updateCollectionCard(c.id, { quantity: c.owned_qty - 1 }))}
                          aria-label="Diminuir"
                        >
                          <Minus />
                        </Button>
                        <span className="w-5 tabular-nums">{c.owned_qty}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={pending}
                          onClick={() => run(() => updateCollectionCard(c.id, { quantity: c.owned_qty + 1 }))}
                          aria-label="Aumentar"
                        >
                          <Plus />
                        </Button>
                      </div>
                    ) : (
                      <span className="tabular-nums">{c.owned_qty}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-center tabular-nums sm:table-cell">{c.in_decks_count}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={st.className}>
                      {st.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Switch
                      checked={c.available_for_trade}
                      disabled={!editable || pending}
                      onCheckedChange={(v) => run(() => updateCollectionCard(c.id, { available_for_trade: v }))}
                      aria-label="Disponível para troca"
                    />
                  </TableCell>
                  {editable && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-red-400"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Remover ${c.card_name} da coleção?`)) run(() => deleteCollectionCard(c.id));
                        }}
                        aria-label="Remover"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
