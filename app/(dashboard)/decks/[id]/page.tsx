import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, PackageX, ScanLine } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPips } from "@/components/color-pips";
import { MatchCard } from "@/components/match-card";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import { commanderLabel, formatPct } from "@/lib/format";
import { MATCH_SELECT } from "@/lib/newspaper";
import type { CollectionStatus, DeckCard, DeckStats, MatchWithParticipants } from "@/lib/types";
import { AccessPanel } from "./access-panel";
import { PROXY_MARKER } from "@/lib/scryfall";
import { DeckCardList } from "./deck-card-list";
import { DeckOwnerActions } from "./deck-owner-actions";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Deck" };

const front = (n: string) => n.split(" // ")[0].toLowerCase();

export default async function DeckPage(props: PageProps<"/decks/[id]">) {
  const { id } = await props.params;
  const { supabase, profile } = await requireUser();

  const { data: deck } = await supabase.from("deck_stats").select("*").eq("deck_id", id).maybeSingle<DeckStats>();
  if (!deck) notFound();

  const [{ data: cards }, { data: collection }, { data: deckRow }, { data: matchIds }, { data: permissions }, { data: players }] = await Promise.all([
    supabase.from("deck_cards").select("*").eq("deck_id", id).order("is_commander", { ascending: false }).order("card_name").returns<DeckCard[]>(),
    supabase.from("user_collection_status").select("*").eq("user_id", deck.owner_id).returns<CollectionStatus[]>(),
    supabase.from("decks").select("moxfield_url").eq("id", id).single(),
    supabase.from("match_participants").select("match_id").eq("deck_id", id),
    supabase
      .from("deck_permissions")
      .select("user_id, user:users!deck_permissions_user_id_fkey ( name )")
      .eq("deck_id", id)
      .order("created_at")
      .returns<{ user_id: string; user: { name: string } | null }[]>(),
    supabase.from("users").select("id, name").order("name"),
  ]);

  const { data: matches } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .in("id", (matchIds ?? []).map((m) => m.match_id))
    .order("played_at", { ascending: false })
    .limit(6)
    .returns<MatchWithParticipants[]>();

  const byName = new Map((collection ?? []).map((c) => [front(c.card_name), c]));
  const mainCards = (cards ?? []).filter((c) => !c.is_commander);
  const proxies = (cards ?? []).filter((c) => c.is_proxy);
  // Proxies não consomem cópia física: ficam fora dos alertas da coleção
  const physical = mainCards.filter((c) => !c.is_proxy);

  // Checklist pré-jogo
  const rotating = physical
    .map((c) => ({ card: c, status: byName.get(front(c.card_name)) }))
    .filter((x) => x.status?.usage_status === "shared_rotation");
  const missing = physical.filter((c) => !byName.has(front(c.card_name)));

  const canEdit = isRoot(profile.role) || profile.id === deck.owner_id;
  const listText = mainCards
    .map((c) => `${c.quantity} ${c.card_name}${c.is_proxy ? ` ${PROXY_MARKER}` : ""}`)
    .join("\n");

  return (
    <div className="space-y-6">
      <PageHeader
        banner="decks"
        eyebrow="Arsenal"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {deck.deck_name}
            {!deck.is_active && <Badge variant="outline">Aposentado</Badge>}
          </span>
        }
        description={
          <>
            {commanderLabel(deck.commander_name, deck.partner_name)} · de{" "}
            <Link href={`/players/${deck.owner_id}`} className="underline">
              {deck.owner_name}
            </Link>
          </>
        }
        actions={
          deckRow?.moxfield_url || canEdit ? (
            <>
              {deckRow?.moxfield_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={deckRow.moxfield_url} target="_blank" rel="noreferrer">
                    <ExternalLink /> Lista online
                  </a>
                </Button>
              )}
              {canEdit && <DeckOwnerActions deckId={id} isActive={deck.is_active} currentList={listText} />}
            </>
          ) : undefined
        }
      >
        <ColorPips colors={deck.color_identity} className="mt-2 text-lg" />
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Geral", w: deck.total_wins, g: deck.total_games, pct: deck.overall_winrate },
          { label: "Com o dono", w: deck.owner_wins, g: deck.owner_games, pct: deck.owner_winrate },
          { label: "Emprestado", w: deck.borrowed_wins, g: deck.borrowed_games, pct: deck.borrowed_winrate },
        ].map((s) => (
          <Card key={s.label} className="gap-1 py-4 text-center">
            <CardDescription className="text-xs">{s.label}</CardDescription>
            <div className="text-2xl font-bold tabular-nums">{formatPct(s.pct)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {s.w}V / {s.g}J
            </div>
          </Card>
        ))}
      </div>

      <AccessPanel
        deckId={id}
        ownerId={deck.owner_id}
        ownerName={deck.owner_name}
        allowed={(permissions ?? []).map((p) => ({ user_id: p.user_id, name: p.user?.name ?? "?" }))}
        players={players ?? []}
        canManage={canEdit}
        currentUserId={profile.id}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5" /> Checklist pré-jogo
            </CardTitle>
            <CardDescription>Cruza a lista do deck com a coleção física de {deck.owner_name}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mainCards.length === 0 && (
              <p className="text-sm text-muted-foreground">Cadastre a lista de cartas para gerar o checklist.</p>
            )}
            {mainCards.length > 0 && rotating.length === 0 && missing.length === 0 && (
              <Alert>
                <CheckCircle2 className="text-emerald-400" />
                <AlertTitle>Tudo certo!</AlertTitle>
                <AlertDescription>Nenhuma carta física compartilhada com outro deck.</AlertDescription>
              </Alert>
            )}
            {proxies.length > 0 && (
              <Alert className="border-violet-500/40 bg-violet-500/5">
                <ScanLine className="text-violet-400" />
                <AlertTitle>{proxies.length} proxy(s) neste deck</AlertTitle>
                <AlertDescription>
                  {proxies.map((c) => c.card_name).join(", ")}. Não contam como cópias físicas da coleção.
                </AlertDescription>
              </Alert>
            )}
            {rotating.length > 0 && (
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <AlertTriangle className="text-amber-400" />
                <AlertTitle>{rotating.length} carta(s) rotacionada(s) entre decks</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1">
                    {rotating.map(({ card, status }) => (
                      <li key={card.id}>
                        <strong>{card.card_name}</strong> — {status!.owned_qty} cópia(s) para {status!.in_decks_count} uso(s):{" "}
                        {status!.used_in_decks.join(", ")}. Confira se está neste deck!
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {missing.length > 0 && (
              <Alert>
                <PackageX />
                <AlertTitle>{missing.length} carta(s) fora da coleção cadastrada</AlertTitle>
                <AlertDescription>
                  {missing
                    .slice(0, 20)
                    .map((c) => c.card_name)
                    .join(", ")}
                  {missing.length > 20 && "…"}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista ({(cards ?? []).reduce((s, c) => s + c.quantity, 0)} cartas)</CardTitle>
            {canEdit && <CardDescription>Toque em “proxy” para marcar as cartas que não são originais.</CardDescription>}
          </CardHeader>
          <CardContent>
            <DeckCardList cards={cards ?? []} rotatingIds={rotating.map((r) => r.card.id)} canEdit={canEdit} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Partidas recentes</h2>
        {(matches ?? []).length === 0 && <p className="text-sm text-muted-foreground">Ainda não jogou.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {(matches ?? []).map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
