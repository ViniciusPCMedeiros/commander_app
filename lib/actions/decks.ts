"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import {
  canPair,
  getCardByName,
  getCardImage,
  getPartnerInfo,
  mergeColorIdentity,
  parseDecklist,
  partnerLabel,
} from "@/lib/scryfall";

export type DeckFormState = { error?: string };

export async function createDeck(_prev: DeckFormState, formData: FormData): Promise<DeckFormState> {
  const { supabase, profile } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const commanderName = String(formData.get("commander") ?? "").trim();
  const partnerName = String(formData.get("partner") ?? "").trim();
  const moxfieldUrl = String(formData.get("moxfield_url") ?? "").trim() || null;
  const decklist = String(formData.get("decklist") ?? "");
  const requestedOwner = String(formData.get("owner_id") ?? "").trim();
  const ownerId = isRoot(profile.role) && requestedOwner ? requestedOwner : profile.id;

  if (!commanderName) return { error: "Escolha o comandante." };

  const commander = await getCardByName(commanderName);
  if (!commander) return { error: `Comandante "${commanderName}" não encontrado na Scryfall.` };
  if (!/legendary/i.test(commander.type_line ?? "") && !/can be your commander/i.test(commander.oracle_text ?? "")) {
    return { error: `${commander.name} não é uma criatura lendária / comandante válido.` };
  }

  let partner = null;
  if (partnerName) {
    partner = await getCardByName(partnerName);
    if (!partner) return { error: `Parceiro "${partnerName}" não encontrado na Scryfall.` };
    if (!canPair(commander, partner)) {
      return {
        error: `${commander.name} (${partnerLabel(getPartnerInfo(commander))}) e ${partner.name} (${partnerLabel(getPartnerInfo(partner))}) não podem ser comandantes juntos.`,
      };
    }
  }

  const { data: deck, error } = await supabase
    .from("decks")
    .insert({
      owner_id: ownerId,
      name: name || commander.name.split(" // ")[0],
      commander_name: commander.name,
      commander_image_url: getCardImage(commander, "art_crop"),
      partner_name: partner?.name ?? null,
      partner_image_url: partner ? getCardImage(partner, "art_crop") : null,
      color_identity: mergeColorIdentity(commander.color_identity, partner?.color_identity),
      moxfield_url: moxfieldUrl,
    })
    .select("id")
    .single();

  if (error || !deck) return { error: `Erro ao salvar o deck: ${error?.message}` };

  const commanders = [commander.name, partner?.name].filter(Boolean) as string[];
  const commanderKeys = new Set(commanders.map((c) => c.split(" // ")[0].toLowerCase()));
  const rows = [
    ...commanders.map((card_name) => ({ deck_id: deck.id, card_name, quantity: 1, is_commander: true })),
    ...parseDecklist(decklist)
      .filter((c) => !commanderKeys.has(c.name.split(" // ")[0].toLowerCase()))
      .map((c) => ({ deck_id: deck.id, card_name: c.name, quantity: c.quantity, is_commander: false, is_proxy: c.isProxy })),
  ];
  const { error: cardsError } = await supabase.from("deck_cards").insert(rows);
  if (cardsError) return { error: `Deck criado, mas falhou ao salvar a lista: ${cardsError.message}` };

  revalidatePath("/decks");
  redirect(`/decks/${deck.id}`);
}

export async function toggleDeckActive(deckId: string, isActive: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("decks").update({ is_active: isActive }).eq("id", deckId);
  if (error) return { error: error.message };
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/collection");
  return {};
}

export async function replaceDecklist(deckId: string, decklist: string) {
  const { supabase } = await requireUser();
  const { data: commanders } = await supabase
    .from("deck_cards")
    .select("card_name")
    .eq("deck_id", deckId)
    .eq("is_commander", true);
  const commanderKeys = new Set((commanders ?? []).map((c) => c.card_name.split(" // ")[0].toLowerCase()));

  const { error: delError } = await supabase.from("deck_cards").delete().eq("deck_id", deckId).eq("is_commander", false);
  if (delError) return { error: delError.message };

  const rows = parseDecklist(decklist)
    .filter((c) => !commanderKeys.has(c.name.split(" // ")[0].toLowerCase()))
    .map((c) => ({ deck_id: deckId, card_name: c.name, quantity: c.quantity, is_commander: false, is_proxy: c.isProxy }));
  if (rows.length) {
    const { error } = await supabase.from("deck_cards").insert(rows);
    if (error) return { error: error.message };
  }
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/collection");
  return { count: rows.length };
}

/** Marca/desmarca uma carta do deck como proxy. O RLS garante que só o dono (ou admin) altere. */
export async function setCardProxy(cardId: string, isProxy: boolean) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("deck_cards")
    .update({ is_proxy: isProxy })
    .eq("id", cardId)
    .select("deck_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Carta não encontrada ou sem permissão." };
  revalidatePath(`/decks/${data[0].deck_id}`);
  revalidatePath("/collection");
  return {};
}
