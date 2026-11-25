"use client";

/* eslint-disable @next/next/no-img-element */
import { useActionState, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPips } from "@/components/color-pips";
import { NativeSelect } from "@/components/native-select";
import { CardListTextarea } from "@/components/card-list-textarea";
import { ScryfallSearch } from "@/components/scryfall-search";
import { createDeck, updateDeck, type DeckFormState } from "@/lib/actions/decks";
import {
  autocompleteCommanders,
  canBeCommander,
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
  editing,
}: {
  players: { id: string; name: string }[];
  canChooseOwner: boolean;
  currentUserId: string;
  /** Deck existente: edita nome, link e comandantes (a lista fica no "Editar lista"). */
  editing?: {
    deckId: string;
    name: string;
    moxfieldUrl: string | null;
    commander: ScryfallCard | null;
    partner: ScryfallCard | null;
  };
}) {
  const [state, formAction, pending] = useActionState<DeckFormState, FormData>(
    editing ? updateDeck.bind(null, editing.deckId) : createDeck,
    {},
  );
  const [commanderQuery, setCommanderQuery] = useState(editing?.commander?.name ?? "");
  const [partnerQuery, setPartnerQuery] = useState(editing?.partner?.name ?? "");
  const [commander, setCommander] = useState<ScryfallCard | null>(editing?.commander ?? null);
  const [partner, setPartner] = useState<ScryfallCard | null>(editing?.partner ?? null);
  const [loadingCard, setLoadingCard] = useState(false);

  /** Carrega a carta (nome exato ou aproximado) e normaliza o texto do campo para o nome oficial. */
  const load = async (name: string, set: (c: ScryfallCard | null) => void, setQuery: (v: string) => void) => {
    setLoadingCard(true);
    try {
      let card = await getCardByName(name);
      if (!card) {
        // Nome ambíguo (ex.: "Atraxa") ou incompleto: usa a sugestão se ela for única
        const options = await autocompleteCommanders(name);
        if (options.length === 1) card = await getCardByName(options[0]);
        else if (options.length > 1) {
          toast.error(
            `Mais de uma carta com "${name}": ${options.slice(0, 4).join(", ")}${options.length > 4 ? "…" : ""}. Escolha na lista.`,
          );
          return;
        }
      }
      if (card && !canBeCommander(card)) {
        toast.error(`${card.name} não pode ser comandante. Escolha uma criatura lendária na lista.`);
        return;
      }
      set(card);
      if (card) setQuery(card.name);
      else toast.error(`Comandante "${name}" não encontrado na Scryfall.`);
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
          commandersOnly
          name="commander"
          value={commanderQuery}
          onChange={(v) => {
            setCommanderQuery(v);
            if (commander && v !== commander.name) setCommander(null);
          }}
          onSelect={(n) => load(n, setCommander, setCommanderQuery)}
          onCommit={(v) => {
            if (commander?.name !== v) load(v, setCommander, setCommanderQuery);
          }}
          placeholder="Ex.: Esika, Atraxa, Tymna…"
          autoFocus={!editing}
        />
        {commander && <CardPreview card={commander} />}
        {commander && !commanderPartner && (
          <p className="text-xs text-muted-foreground">
            Este comandante não tem Partner, Friends Forever, Background nem Doctor&apos;s Companion, então o deck tem
            um comandante só.
          </p>
        )}
      </div>

      {commanderPartner && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <Label htmlFor="partner" className="flex items-center gap-2">
            <Users className="size-4" /> Segundo comandante ({partnerLabel(commanderPartner)})
          </Label>
          <p className="text-xs text-muted-foreground">{partnerHint(commanderPartner)} — opcional.</p>
          <ScryfallSearch
            id="partner"
            commandersOnly
            name="partner"
            value={partnerQuery}
            onChange={(v) => {
              setPartnerQuery(v);
              if (partner && v !== partner.name) setPartner(null);
            }}
            onSelect={(n) => load(n, setPartner, setPartnerQuery)}
            onCommit={(v) => {
              if (partner?.name !== v) load(v, setPartner, setPartnerQuery);
            }}
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
          <Input
            id="name"
            name="name"
            defaultValue={editing?.name}
            placeholder={commander?.name.split(" // ")[0] ?? "Ex.: Atraxa Superfriends"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="moxfield_url">Link (Moxfield/Archidekt)</Label>
          <Input
            id="moxfield_url"
            name="moxfield_url"
            type="url"
            defaultValue={editing?.moxfieldUrl ?? undefined}
            placeholder="https://www.moxfield.com/decks/…"
          />
        </div>
      </div>

      {canChooseOwner && !editing && (
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

      {!editing && (
        <div className="space-y-2">
          <Label htmlFor="decklist">Lista de cartas (opcional)</Label>
          <CardListTextarea
            id="decklist"
            name="decklist"
            rows={8}
            placeholder={"1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n…"}
          />
          <p className="text-xs text-muted-foreground">
            Uma carta por linha, formato do Moxfield/MTGO. Adicione <code>[proxy]</code> no fim da linha para marcar um
            proxy (ex.: <code>1 Sol Ring [proxy]</code>). Usada para detectar cartas rotacionadas na sua coleção.
          </p>
        </div>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {editing && state.savedAt && !state.error && !pending && (
        <p className="text-sm text-emerald-400" role="status">
          Alterações salvas.
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={pending || loadingCard || !commanderQuery || Boolean(pairInvalid)}
      >
        {(pending || loadingCard) && <Loader2 className="animate-spin" />}{" "}
        {editing ? "Salvar alterações" : "Salvar deck"}
      </Button>
    </form>
  );
}
