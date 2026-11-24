"use client";

/* eslint-disable @next/next/no-img-element */
import { useActionState, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPips } from "@/components/color-pips";
import { NativeSelect } from "@/components/native-select";
import { ScryfallSearch } from "@/components/scryfall-search";
import { createDeck, type DeckFormState } from "@/lib/actions/decks";
import {
  canPair,
  getCardByName,
  getCardImage,
  getPartnerInfo,
  mergeColorIdentity,
  partnerHint,
  partnerLabel,
  type ScryfallCard,
} from "@/lib/scryfall";

function CardPreview({ card }: { card: ScryfallCard }) {
  const img = getCardImage(card, "normal");
  const partner = getPartnerInfo(card);
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      {img && <img src={img} alt={card.name} className="w-28 rounded-md" />}
      <div className="min-w-0 space-y-2 text-sm">
        <div className="font-semibold">{card.name}</div>
        <div className="text-xs text-muted-foreground">{card.type_line}</div>
        <ColorPips colors={card.color_identity} />
        {partner && <Badge variant="secondary">{partnerLabel(partner)}</Badge>}
        {card.card_faces && card.card_faces.length > 1 && (
          <Badge variant="outline" className="ml-1">
            Dupla-face
          </Badge>
        )}
      </div>
    </div>
  );
}

export function DeckForm({
  players,
  canChooseOwner,
  currentUserId,
}: {
  players: { id: string; name: string }[];
  canChooseOwner: boolean;
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState<DeckFormState, FormData>(createDeck, {});
  const [commanderQuery, setCommanderQuery] = useState("");
  const [partnerQuery, setPartnerQuery] = useState("");
  const [commander, setCommander] = useState<ScryfallCard | null>(null);
  const [partner, setPartner] = useState<ScryfallCard | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);

  const load = async (name: string, set: (c: ScryfallCard | null) => void) => {
    setLoadingCard(true);
    try {
      set(await getCardByName(name));
    } finally {
      setLoadingCard(false);
    }
  };

  const commanderPartner = commander ? getPartnerInfo(commander) : null;
  const pairInvalid = commander && partner && !canPair(commander, partner);
  const colors = mergeColorIdentity(commander?.color_identity, partner?.color_identity);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="commander">Comandante</Label>
        <ScryfallSearch
          id="commander"
          name="commander"
          value={commanderQuery}
          onChange={(v) => {
            setCommanderQuery(v);
            if (commander && v !== commander.name) setCommander(null);
          }}
          onSelect={(n) => load(n, setCommander)}
          placeholder="Ex.: Esika, Atraxa, Tymna…"
          autoFocus
        />
        {commander && <CardPreview card={commander} />}
      </div>

      {commanderPartner && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <Label htmlFor="partner" className="flex items-center gap-2">
            <Users className="size-4" /> Segundo comandante ({partnerLabel(commanderPartner)})
          </Label>
          <p className="text-xs text-muted-foreground">{partnerHint(commanderPartner)} — opcional.</p>
          <ScryfallSearch
            id="partner"
            name="partner"
            value={partnerQuery}
            onChange={(v) => {
              setPartnerQuery(v);
              if (partner && v !== partner.name) setPartner(null);
            }}
            onSelect={(n) => load(n, setPartner)}
            placeholder="Parceiro / Background / Companion"
          />
          {partner && <CardPreview card={partner} />}
          {pairInvalid && (
            <Alert variant="destructive">
              <AlertDescription>Essas duas cartas não podem ser comandantes juntas.</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {commander && (
        <div className="flex items-center gap-2 text-sm">
          Identidade de cor do deck: <ColorPips colors={colors} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome do deck</Label>
          <Input id="name" name="name" placeholder={commander?.name.split(" // ")[0] ?? "Ex.: Atraxa Superfriends"} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="moxfield_url">Link (Moxfield/Archidekt)</Label>
          <Input id="moxfield_url" name="moxfield_url" type="url" placeholder="https://www.moxfield.com/decks/…" />
        </div>
      </div>

      {canChooseOwner && (
        <div className="space-y-2">
          <Label htmlFor="owner_id">Dono do deck</Label>
          <NativeSelect id="owner_id" name="owner_id" defaultValue={currentUserId}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="decklist">Lista de cartas (opcional)</Label>
        <Textarea
          id="decklist"
          name="decklist"
          rows={8}
          className="font-mono text-xs"
          placeholder={"1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…"}
        />
        <p className="text-xs text-muted-foreground">
          Uma carta por linha, formato do Moxfield/MTGO. Adicione <code>[proxy]</code> no fim da linha para marcar um proxy
          (ex.: <code>1 Sol Ring [proxy]</code>). Usada para detectar cartas rotacionadas na sua coleção.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending || loadingCard || !commanderQuery || Boolean(pairInvalid)}>
        {(pending || loadingCard) && <Loader2 className="animate-spin" />} Salvar deck
      </Button>
    </form>
  );
}
