import "server-only";
import { frontFaceName, getCardImage, getCardsCollection, getManaCost } from "@/lib/scryfall";

/** Dados da Scryfall que o editor de deck mostra para cada carta. */
export interface DeckCardInfo {
  type_line: string | null;
  image_url: string | null;
  mana_cost: string | null;
  cmc: number;
  color_identity: string[];
  /** "A deck can have any number of cards named…" (Relentless Rats etc.) ou terreno básico. */
  any_number: boolean;
}

export const cardKey = (name: string) => frontFaceName(name).toLowerCase();

/** Busca em lote (cache de 24h) e indexa pelo nome da face frontal, em minúsculas. */
export async function loadDeckCardInfo(names: string[]): Promise<Record<string, DeckCardInfo>> {
  if (!names.length) return {};
  const { found } = await getCardsCollection(names, { next: { revalidate: 86_400 } }).catch(() => ({
    found: [],
    notFound: names,
  }));
  const info: Record<string, DeckCardInfo> = {};
  for (const card of found) {
    const typeLine = card.type_line ?? card.card_faces?.[0]?.type_line ?? null;
    const oracle = [card.oracle_text, ...(card.card_faces ?? []).map((f) => f.oracle_text)].join("\n");
    info[cardKey(card.name)] = {
      type_line: typeLine,
      image_url: getCardImage(card, "normal"),
      mana_cost: getManaCost(card),
      cmc: card.cmc ?? 0,
      color_identity: card.color_identity,
      any_number: /basic land/i.test(typeLine ?? "") || /any number of cards named/i.test(oracle),
    };
  }
  return info;
}
