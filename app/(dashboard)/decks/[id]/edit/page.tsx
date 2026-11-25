import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { loadDeckCardInfo } from "@/lib/deck-card-info";
import { isRoot } from "@/lib/roles";
import { getCardByName } from "@/lib/scryfall";
import type { DeckCard } from "@/lib/types";
import { DeckForm } from "../../new/deck-form";
import { DeckListEditor } from "./deck-list-editor";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Editar deck" };

export default async function EditDeckPage(props: PageProps<"/decks/[id]/edit">) {
  const { id } = await props.params;
  const { supabase, profile } = await requireUser();

  const [{ data: deck }, { data: cards }] = await Promise.all([
    supabase
      .from("decks")
      .select("id, owner_id, name, moxfield_url, commander_name, partner_name, color_identity")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("deck_cards").select("*").eq("deck_id", id).order("card_name").returns<DeckCard[]>(),
  ]);
  if (!deck || (deck.owner_id !== profile.id && !isRoot(profile.role))) notFound();

  const [commander, partner, info] = await Promise.all([
    getCardByName(deck.commander_name),
    deck.partner_name ? getCardByName(deck.partner_name) : null,
    loadDeckCardInfo((cards ?? []).map((c) => c.card_name)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        banner="decks"
        eyebrow="Arsenal"
        title={`Editar ${deck.name}`}
        description="As partidas já jogadas guardam o comandante e a lista da época: editar aqui não muda o histórico."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/decks/${id}`}>
              <ArrowLeft /> Voltar ao deck
            </Link>
          </Button>
        }
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Comandantes e informações</CardTitle>
          <CardDescription>Nome, link e comandante(s). Clique em “Salvar alterações” para aplicar.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeckForm
            players={[]}
            canChooseOwner={false}
            currentUserId={profile.id}
            editing={{ deckId: deck.id, name: deck.name, moxfieldUrl: deck.moxfield_url, commander, partner }}
          />
        </CardContent>
      </Card>

      <DeckListEditor deckId={deck.id} cards={cards ?? []} info={info} deckColors={deck.color_identity ?? []} />
    </div>
  );
}
