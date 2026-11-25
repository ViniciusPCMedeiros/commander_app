"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { LayoutGrid, List, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPips } from "@/components/color-pips";
import { NativeSelect } from "@/components/native-select";
import { deleteCollectionCard, updateCollectionCard } from "@/lib/actions/collection";
import type { CollectionStatus, ProxyCard, UsageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<UsageStatus, { label: string; className: string }> = {
  free: { label: "Livre", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  partial_free: { label: "Parcial livre", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  allocated: { label: "Alocada", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  shared_rotation: { label: "Rotacionada", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

export type CollectionFilter = "all" | "free" | "allocated" | "shared_rotation" | "trade" | "proxies" | "needed";

type Row = { kind: "card"; card: CollectionStatus } | { kind: "proxy"; proxy: ProxyCard };

const nameOf = (r: Row) => (r.kind === "card" ? r.card.card_name : r.proxy.card_name);
const typeOf = (r: Row) => (r.kind === "card" ? r.card.type_line : r.proxy.type_line) ?? "";
const colorsOf = (r: Row) => (r.kind === "card" ? r.card.color_identity : r.proxy.color_identity) ?? [];
const decksOf = (r: Row) => (r.kind === "card" ? r.card.used_in_decks : r.proxy.proxy_in_decks);
const qtyOf = (r: Row) => (r.kind === "card" ? r.card.owned_qty : r.proxy.proxy_qty);

/** Tipos pelo type_line em inglês da Scryfall. */
const TYPES = [
  { value: "Creature", label: "Criaturas" },
  { value: "Instant", label: "Instantâneas" },
  { value: "Sorcery", label: "Feitiços" },
  { value: "Artifact", label: "Artefatos" },
  { value: "Enchantment", label: "Encantamentos" },
  { value: "Planeswalker", label: "Planeswalkers" },
  { value: "Land", label: "Terrenos" },
  { value: "Battle", label: "Batalhas" },
] as const;

const COLORS = [
  { value: "W", label: "Branco" },
  { value: "U", label: "Azul" },
  { value: "B", label: "Preto" },
  { value: "R", label: "Vermelho" },
  { value: "G", label: "Verde" },
  { value: "C", label: "Incolor" },
] as const;
const WUBRG = "WUBRG";

type Sort = "name" | "qty" | "decks" | "color";
const SORTS: { value: Sort; label: string }[] = [
  { value: "name", label: "Nome (A–Z)" },
  { value: "qty", label: "Mais cópias" },
  { value: "decks", label: "Mais usadas em decks" },
  { value: "color", label: "Cor" },
];

/** Modo de visualização lembrado no navegador (conveniência de cada pessoa). */
type View = "list" | "grid";
const VIEW_KEY = "mesao:collection-view";
const VIEW_EVENT = "mesao:collection-view";
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}
function subscribeView(cb: () => void) {
  window.addEventListener(VIEW_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(VIEW_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {}
  window.dispatchEvent(new Event(VIEW_EVENT));
}

type Run = (fn: () => Promise<{ error?: string }>) => void;

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

/* Ações de edição de uma carta — as mesmas na lista e na galeria. */

function QtyStepper({
  card,
  editable,
  pending,
  run,
}: {
  card: CollectionStatus;
  editable: boolean;
  pending: boolean;
  run: Run;
}) {
  if (!editable) return <span className="tabular-nums">{card.owned_qty}</span>;
  return (
    <div className="inline-flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={pending || card.owned_qty <= 1}
        onClick={() => run(() => updateCollectionCard(card.id, { quantity: card.owned_qty - 1 }))}
        aria-label="Diminuir"
      >
        <Minus />
      </Button>
      <span className="w-5 text-center tabular-nums">{card.owned_qty}</span>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={pending}
        onClick={() => run(() => updateCollectionCard(card.id, { quantity: card.owned_qty + 1 }))}
        aria-label="Aumentar"
      >
        <Plus />
      </Button>
    </div>
  );
}

function TradeSwitch({
  card,
  editable,
  pending,
  run,
}: {
  card: CollectionStatus;
  editable: boolean;
  pending: boolean;
  run: Run;
}) {
  return (
    <Switch
      checked={card.available_for_trade}
      disabled={!editable || pending}
      onCheckedChange={(v) => run(() => updateCollectionCard(card.id, { available_for_trade: v }))}
      aria-label="Disponível para troca"
    />
  );
}

function RemoveButton({ card, pending, run }: { card: CollectionStatus; pending: boolean; run: Run }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8 text-red-400"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remover ${card.card_name} da coleção?`)) run(() => deleteCollectionCard(card.id));
      }}
      aria-label="Remover"
      title="Remover da coleção"
    >
      <Trash2 />
    </Button>
  );
}

function ProxyNeedBadge({ proxy }: { proxy: ProxyCard }) {
  return proxy.needed_qty > 0 ? (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
      Precisa de {proxy.needed_qty}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      title="Há cópia original livre: dá para trocar o proxy"
    >
      Original livre
    </Badge>
  );
}

function TradeOffers({ proxy }: { proxy: ProxyCard }) {
  if (!(proxy.needed_qty > 0 && proxy.trade_offers?.length)) return null;
  return (
    <span className="text-emerald-300">
      Para troca com{" "}
      {proxy.trade_offers.map((o, i) => (
        <span key={o.user_id}>
          {i > 0 && ", "}
          <Link href={`/players/${o.user_id}`} className="underline">
            {o.name}
          </Link>
        </span>
      ))}
    </span>
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
  const [type, setType] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("name");
  const view = useSyncExternalStore(subscribeView, readView, () => "list" as View);
  const [pending, startTransition] = useTransition();
  const hasFilters = !!(query || type || colors.length || sort !== "name");

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
    const cardRows: Row[] = cards
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
        ? proxies.filter((p) => filter !== "needed" || p.needed_qty > 0).map((proxy) => ({ kind: "proxy", proxy }))
        : [];

    // Cores: o que cabe na identidade escolhida (incolor cabe em todas); só "incolor" = só as incolores
    const wubrg = colors.filter((c) => c !== "C");
    const matchesColors = (ci: string[]) =>
      !colors.length || (wubrg.length ? ci.every((c) => wubrg.includes(c)) : ci.length === 0);

    // Busca por nome, tipo ou deck; tipo; e cores
    const q = query.trim().toLowerCase();
    const filtered = [...cardRows, ...proxyRows].filter(
      (r) =>
        (!q || [nameOf(r), typeOf(r), ...decksOf(r)].some((t) => t.toLowerCase().includes(q))) &&
        (!type || typeOf(r).includes(type)) &&
        matchesColors(colorsOf(r)),
    );

    const colorKey = (r: Row) => {
      const cs = colorsOf(r);
      // Mono-cor na ordem WUBRG, depois multicolor, incolor por último
      return cs.length === 0 ? 99 : cs.length > 1 ? 10 + cs.length : WUBRG.indexOf(cs[0]);
    };
    const byName = (a: Row, b: Row) => nameOf(a).localeCompare(nameOf(b)) || (a.kind === "card" ? -1 : 1);
    const compare: Record<Sort, (a: Row, b: Row) => number> = {
      name: byName,
      qty: (a, b) => qtyOf(b) - qtyOf(a) || byName(a, b),
      decks: (a, b) => decksOf(b).length - decksOf(a).length || byName(a, b),
      color: (a, b) => colorKey(a) - colorKey(b) || byName(a, b),
    };
    return filtered.sort(compare[sort]);
  }, [cards, proxies, filter, query, type, colors, sort]);

  const run: Run = (fn) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as CollectionFilter)}
          className="max-w-full overflow-x-auto"
        >
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative basis-full sm:min-w-52 sm:flex-1 sm:basis-auto">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, tipo ou deck"
              aria-label="Buscar cartas"
              className="h-10 pl-8"
            />
          </div>
          <NativeSelect
            aria-label="Tipo de carta"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-[calc(50%-0.25rem)] sm:w-40"
          >
            <option value="">Todos os tipos</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="w-[calc(50%-0.25rem)] sm:w-48"
          >
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
          <div
            role="group"
            aria-label="Cores (mostra o que cabe nessa identidade)"
            title="Mostra as cartas que cabem num deck dessas cores (incolor sozinho: só as incolores)"
            className="flex h-10 items-center gap-1 rounded-md border border-input px-2 dark:bg-input/30"
          >
            {COLORS.map((c) => {
              const on = colors.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setColors((cs) => (on ? cs.filter((x) => x !== c.value) : [...cs, c.value]))}
                  className={cn(
                    "rounded-full p-0.5 transition",
                    on ? "ring-2 ring-primary" : "opacity-40 grayscale hover:opacity-80 hover:grayscale-0",
                  )}
                >
                  <img src={`/mana/${c.value}.svg`} alt="" className="size-5" />
                </button>
              );
            })}
          </div>
          <div
            role="group"
            aria-label="Modo de visualização"
            className="flex h-10 items-center rounded-md border border-input p-0.5 dark:bg-input/30"
          >
            {(
              [
                { v: "list", label: "Lista", Icon: List },
                { v: "grid", label: "Galeria", Icon: LayoutGrid },
              ] as const
            ).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                title={label}
                onClick={() => saveView(v)}
                className={cn(
                  "flex h-full items-center gap-1.5 rounded px-2.5 text-sm transition-colors",
                  view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} {rows.length === 1 ? "carta" : "cartas"}
            {colors.length > 0 && (colors.every((c) => c === "C") ? " incolores" : " que cabem nessas cores")}
          </span>
          {hasFilters && (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => {
                setQuery("");
                setType("");
                setColors([]);
                setSort("name");
              }}
            >
              <X className="size-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {view === "grid" ? (
        <CardGallery rows={rows} editable={editable} pending={pending} run={run} />
      ) : (
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
                                <ColorPips
                                  colors={p.color_identity}
                                  className="hidden sm:inline-flex [&>span]:size-4 [&>span]:text-[8px]"
                                />
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
                      <TableCell className="hidden text-center tabular-nums sm:table-cell">
                        {p.proxy_in_decks.length}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className="border-violet-500/40 bg-violet-500/15 text-violet-300">
                            Proxy
                          </Badge>
                          <ProxyNeedBadge proxy={p} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-48 text-xs md:table-cell">
                        <TradeOffers proxy={p} />
                        {!(p.needed_qty > 0 && p.trade_offers?.length) && (
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
                            <ColorPips
                              colors={c.color_identity}
                              className="hidden sm:inline-flex [&>span]:size-4 [&>span]:text-[8px]"
                            />
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
                      <QtyStepper card={c} editable={editable} pending={pending} run={run} />
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums sm:table-cell">{c.in_decks_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.className}>
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <TradeSwitch card={c} editable={editable} pending={pending} run={run} />
                    </TableCell>
                    {editable && (
                      <TableCell>
                        <RemoveButton card={c} pending={pending} run={run} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Galeria: a carta inteira, como numa pasta de fichário, com as mesmas ações da lista. */
function CardGallery({ rows, editable, pending, run }: { rows: Row[]; editable: boolean; pending: boolean; run: Run }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma carta.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {rows.map((row) => {
        const isProxy = row.kind === "proxy";
        const name = nameOf(row);
        const image = row.kind === "card" ? row.card.image_url : row.proxy.image_url;
        const decks = decksOf(row);
        const deckIds = row.kind === "card" ? row.card.used_in_deck_ids : row.proxy.proxy_in_deck_ids;
        return (
          <div key={isProxy ? `proxy-${name}` : row.card.id} className="group min-w-0">
            <div
              className={cn(
                "relative aspect-[488/680] overflow-hidden rounded-[4.5%/3.3%] bg-muted shadow-lg shadow-black/40 ring-1 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-xl",
                isProxy ? "ring-violet-500/50" : "ring-white/10 group-hover:ring-primary/50",
              )}
            >
              {image ? (
                <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-3 text-center font-display text-sm text-muted-foreground">
                  {name}
                </div>
              )}
              <span className="absolute top-[12%] right-[7%] rounded-full bg-black/80 px-2 py-0.5 text-xs font-bold text-white tabular-nums ring-1 ring-white/20">
                ×{qtyOf(row)}
              </span>
              {isProxy && (
                <span className="absolute inset-x-0 bottom-0 bg-violet-600/90 py-0.5 text-center text-[10px] font-bold tracking-widest text-white uppercase">
                  Proxy
                </span>
              )}
            </div>

            <div className="mt-2 space-y-1.5 px-0.5">
              <div className="truncate text-sm font-medium" title={name}>
                {name}
              </div>

              {row.kind === "card" ? (
                <>
                  <div className="flex min-h-7 items-center justify-between gap-1">
                    <Badge variant="outline" className={STATUS[row.card.usage_status].className}>
                      {STATUS[row.card.usage_status].label}
                    </Badge>
                    <QtyStepper card={row.card} editable={editable} pending={pending} run={run} />
                  </div>
                  <div className="flex min-h-8 items-center justify-between gap-1">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TradeSwitch card={row.card} editable={editable} pending={pending} run={run} />
                      Troca
                    </label>
                    {editable && <RemoveButton card={row.card} pending={pending} run={run} />}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-h-7 flex-wrap items-center gap-1">
                    <ProxyNeedBadge proxy={row.proxy} />
                  </div>
                  {row.proxy.owned_originals > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {row.proxy.owned_originals} original(is), {row.proxy.free_originals} livre(s)
                    </div>
                  )}
                  <div className="text-xs">
                    <TradeOffers proxy={row.proxy} />
                  </div>
                </>
              )}

              {decks.length > 0 && (
                <div className={cn("truncate text-xs", isProxy ? "text-violet-300/80" : "text-muted-foreground")}>
                  ↳ {isProxy && "proxy em "}
                  <DeckLinks names={decks} ids={deckIds} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
