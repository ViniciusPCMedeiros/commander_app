import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPips } from "@/components/color-pips";
import { CommanderArt } from "@/components/commander-art";
import { PlayerLevel } from "@/components/player-level";
import { requireUser } from "@/lib/auth";
import { commanderLabel, formatPct } from "@/lib/format";
import type { DeckStats } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Decks" };

function DeckGrid({ decks, allowedByDeck }: { decks: DeckStats[]; allowedByDeck: Map<string, string[]> }) {
  if (!decks.length) return <p className="text-sm text-muted-foreground">Nenhum deck aqui.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {decks.map((d) => (
        <Link key={d.deck_id} href={`/decks/${d.deck_id}`}>
          <Card className="h-full gap-0 overflow-hidden py-0 transition-colors hover:border-foreground/30">
            <CommanderArt
              image={d.commander_image_url}
              partnerImage={d.partner_image_url}
              alt={d.commander_name}
              className="aspect-[16/9] w-full"
            />
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{d.deck_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {commanderLabel(d.commander_name, d.partner_name)}
                  </div>
                </div>
                <ColorPips colors={d.color_identity} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  de {d.owner_name} <PlayerLevel id={d.owner_id} />
                </span>
                <div className="flex gap-1">
                  {allowedByDeck.has(d.deck_id) && (
                    <Badge variant="outline" className="border-sky-500/40 text-sky-300" title={allowedByDeck.get(d.deck_id)!.join(", ")}>
                      +{allowedByDeck.get(d.deck_id)!.length} podem usar
                    </Badge>
                  )}
                  {!d.is_active && <Badge variant="outline">Inativo</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-center text-xs">
                <div>
                  <div className="font-semibold text-foreground tabular-nums">
                    {d.total_wins}/{d.total_games}
                  </div>
                  <div className="text-muted-foreground">{formatPct(d.overall_winrate)} geral</div>
                </div>
                <div>
                  <div className="font-semibold text-foreground tabular-nums">
                    {d.owner_wins}/{d.owner_games}
                  </div>
                  <div className="text-muted-foreground">com o dono</div>
                </div>
                <div>
                  <div className="font-semibold text-foreground tabular-nums">
                    {d.borrowed_wins}/{d.borrowed_games}
                  </div>
                  <div className="text-muted-foreground">emprestado</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default async function DecksPage() {
  const { supabase, profile } = await requireUser();
  const { data } = await supabase
    .from("deck_stats")
    .select("*")
    .order("total_wins", { ascending: false })
    .order("deck_name")
    .returns<DeckStats[]>();
  const decks = data ?? [];

  const { data: permissions } = await supabase
    .from("deck_permissions")
    .select("deck_id, user_id, user:users!deck_permissions_user_id_fkey ( name )")
    .order("created_at")
    .returns<{ deck_id: string; user_id: string; user: { name: string } | null }[]>();
  const allowedByDeck = new Map<string, string[]>();
  for (const p of permissions ?? []) {
    allowedByDeck.set(p.deck_id, [...(allowedByDeck.get(p.deck_id) ?? []), p.user?.name ?? "?"]);
  }
  const allowedForMe = new Set((permissions ?? []).filter((p) => p.user_id === profile.id).map((p) => p.deck_id));
  const active = decks.filter((d) => d.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        banner="decks"
        eyebrow="Arsenal"
        title="Decks"
        description="Desempenho de cada deck: no geral, nas mãos do dono e emprestado."
        actions={
          <Button asChild>
            <Link href="/decks/new">
              <Plus /> Novo deck
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Ativos ({active.length})</TabsTrigger>
          <TabsTrigger value="mine">Meus</TabsTrigger>
          <TabsTrigger value="allowed">Liberados p/ mim ({active.filter((d) => allowedForMe.has(d.deck_id)).length})</TabsTrigger>
          <TabsTrigger value="inactive">Aposentados</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <DeckGrid decks={active} allowedByDeck={allowedByDeck} />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <DeckGrid decks={decks.filter((d) => d.owner_id === profile.id)} allowedByDeck={allowedByDeck} />
        </TabsContent>
        <TabsContent value="allowed" className="mt-4">
          <DeckGrid decks={active.filter((d) => allowedForMe.has(d.deck_id))} allowedByDeck={allowedByDeck} />
        </TabsContent>
        <TabsContent value="inactive" className="mt-4">
          <DeckGrid decks={decks.filter((d) => !d.is_active)} allowedByDeck={allowedByDeck} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
