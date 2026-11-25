"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scheduleAchievementSync } from "@/lib/achievement-sync";
import { requireUser } from "@/lib/auth";
import { CARD_LIST_MAX } from "@/lib/format";
import { isRoot } from "@/lib/roles";
import {
  canBeCommander,
  canPair,
  getCardByName,
  getCardImage,
  getPartnerInfo,
  mergeColorIdentity,
  parseDecklist,
  partnerLabel,
} from "@/lib/scryfall";

export type DeckFormState = { error?: string; savedAt?: number };

/** Busca e valida comandante e parceiro (regras de Partner/Background/Companion). */
async function resolveCommanders(commanderName: string, partnerName: string) {
  if (!commanderName) return { error: "Escolha o comandante." };
  const commander = await getCardByName(commanderName);
  if (!commander) return { error: `Comandante "${commanderName}" não encontrado na Scryfall.` };
  if (!canBeCommander(commander)) {
    return { error: `${commander.name} não é uma criatura lendária / comandante válido.` };
  }

  let partner = null;
  if (partnerName) {
    partner = await getCardByName(partnerName);
    if (!partner) return { error: `Parceiro "${partnerName}" não encontrado na Scryfall.` };
    if (!canBeCommander(partner)) return { error: `${partner.name} não pode ser comandante.` };
    if (!canPair(commander, partner)) {
      return {
        error: `${commander.name} (${partnerLabel(getPartnerInfo(commander))}) e ${partner.name} (${partnerLabel(getPartnerInfo(partner))}) não podem ser comandantes juntos.`,
      };
    }
  }

  return {
    commander,
    fields: {
      commander_name: commander.name,
      commander_image_url: getCardImage(commander, "art_crop"),
      partner_name: partner?.name ?? null,
      partner_image_url: partner ? getCardImage(partner, "art_crop") : null,
      color_identity: mergeColorIdentity(commander.color_identity, partner?.color_identity),
    },
  };
}

/** Linhas da lista comum (sem os comandantes, que ficam a cargo de sync_deck_commanders). */
function listRows(deckId: string, decklist: string, commanders: (string | null)[]) {
  const commanderKeys = new Set(commanders.filter(Boolean).map((c) => c!.split(" // ")[0].toLowerCase()));
  return parseDecklist(decklist)
    .filter((c) => !commanderKeys.has(c.name.split(" // ")[0].toLowerCase()))
    .map((c) => ({ deck_id: deckId, card_name: c.name, quantity: c.quantity, is_commander: false, is_proxy: c.isProxy }));
}

export async function createDeck(_prev: DeckFormState, formData: FormData): Promise<DeckFormState> {
  const { supabase, profile } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const moxfieldUrl = String(formData.get("moxfield_url") ?? "").trim() || null;
  const decklist = String(formData.get("decklist") ?? "");
  const requestedOwner = String(formData.get("owner_id") ?? "").trim();
  const ownerId = isRoot(profile.role) && requestedOwner ? requestedOwner : profile.id;

  if (decklist.length > CARD_LIST_MAX) return { error: `A lista de cartas passa de ${CARD_LIST_MAX} caracteres.` };
  const resolved = await resolveCommanders(
    String(formData.get("commander") ?? "").trim(),
    String(formData.get("partner") ?? "").trim(),
  );
  if ("error" in resolved) return { error: resolved.error };
  const { commander, fields } = resolved;

  // Nasce inativo e só é ativado com as cartas salvas: se algo falhar, o deck
  // incompleto é apagado (a policy de DELETE permite: inativo e sem partidas).
  const { data: deck, error } = await supabase
    .from("decks")
    .insert({
      owner_id: ownerId,
      name: name || commander.name.split(" // ")[0],
      moxfield_url: moxfieldUrl,
      is_active: false,
      ...fields,
    })
    .select("id")
    .single();
  if (error || !deck) return { error: `Erro ao salvar o deck: ${error?.message}` };

  const rows = listRows(deck.id, decklist, [fields.commander_name, fields.partner_name]);
  const { error: cardsError } = rows.length ? await supabase.from("deck_cards").insert(rows) : { error: null };
  const { error: syncError } = cardsError ? { error: null } : await supabase.rpc("sync_deck_commanders", { p_deck_id: deck.id });
  const { error: activeError } =
    cardsError || syncError ? { error: null } : await supabase.from("decks").update({ is_active: true }).eq("id", deck.id);
  const failure = cardsError ?? syncError ?? activeError;
  if (failure) {
    await supabase.from("decks").delete().eq("id", deck.id);
    return { error: `Não foi possível salvar as cartas do deck: ${failure.message}. Nada foi criado — tente de novo.` };
  }

  revalidatePath("/decks");
  scheduleAchievementSync();
  redirect(`/decks/${deck.id}`);
}

/** Edita nome, link e comandantes de um deck existente (dono ou root, via RLS). */
export async function updateDeck(deckId: string, _prev: DeckFormState, formData: FormData): Promise<DeckFormState> {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const moxfieldUrl = String(formData.get("moxfield_url") ?? "").trim() || null;

  const resolved = await resolveCommanders(
    String(formData.get("commander") ?? "").trim(),
    String(formData.get("partner") ?? "").trim(),
  );
  if ("error" in resolved) return { error: resolved.error };
  const { commander, fields } = resolved;

  const { data, error } = await supabase
    .from("decks")
    .update({ name: name || commander.name.split(" // ")[0], moxfield_url: moxfieldUrl, ...fields })
    .eq("id", deckId)
    .select("id");
  if (error) return { error: `Erro ao salvar o deck: ${error.message}` };
  if (!data?.length) return { error: "Deck não encontrado ou sem permissão para editar." };

  const { error: syncError } = await supabase.rpc("sync_deck_commanders", { p_deck_id: deckId });
  if (syncError) return { error: `Deck salvo, mas falhou ao atualizar os comandantes: ${syncError.message}` };

  revalidatePath("/decks");
  scheduleAchievementSync();
  revalidateDeck(deckId);
  return { savedAt: Date.now() };
}

export async function toggleDeckActive(deckId: string, isActive: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("decks").update({ is_active: isActive }).eq("id", deckId);
  if (error) return { error: error.message };
  revalidatePath("/decks");
  scheduleAchievementSync();
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/collection");
  return {};
}

/**
 * Exclui um deck aposentado que nunca entrou em partida (nem pendente). A regra
 * também está na policy de DELETE; aqui só damos uma mensagem clara.
 */
export async function deleteDeck(deckId: string) {
  const { supabase } = await requireUser();
  const [{ data: deck }, { count }] = await Promise.all([
    supabase.from("decks").select("is_active").eq("id", deckId).maybeSingle(),
    supabase.from("match_participants").select("id", { count: "exact", head: true }).eq("deck_id", deckId),
  ]);
  if (!deck) return { error: "Deck não encontrado." };
  if (deck.is_active) return { error: "Aposente o deck antes de excluí-lo." };
  if (count) return { error: "Este deck já jogou partidas: ele fica no histórico e não pode ser excluído." };

  const { data, error } = await supabase.from("decks").delete().eq("id", deckId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Sem permissão para excluir este deck." };

  revalidatePath("/decks");
  scheduleAchievementSync();
  revalidatePath("/collection");
  redirect("/decks");
}

export async function replaceDecklist(deckId: string, decklist: string) {
  const { supabase } = await requireUser();
  if (decklist.length > CARD_LIST_MAX) return { error: `A lista de cartas passa de ${CARD_LIST_MAX} caracteres.` };
  const { data: deck } = await supabase
    .from("decks")
    .select("commander_name, partner_name")
    .eq("id", deckId)
    .maybeSingle();
  if (!deck) return { error: "Deck não encontrado." };

  const { error: delError } = await supabase.from("deck_cards").delete().eq("deck_id", deckId).eq("is_commander", false);
  if (delError) return { error: delError.message };

  const rows = listRows(deckId, decklist, [deck.commander_name, deck.partner_name]);
  if (rows.length) {
    const { error } = await supabase.from("deck_cards").insert(rows);
    if (error) return { error: error.message };
  }
  // Repõe a linha de comandante se ela estiver faltando
  const { error: syncError } = await supabase.rpc("sync_deck_commanders", { p_deck_id: deckId });
  if (syncError) return { error: syncError.message };

  revalidateDeck(deckId);
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
  revalidateDeck(data[0].deck_id);
  return {};
}

const frontKey = (name: string) => name.split(" // ")[0].trim().toLowerCase();

function revalidateDeck(deckId: string) {
  scheduleAchievementSync(); // decks completos, proxies
  revalidatePath(`/decks/${deckId}`);
  revalidatePath(`/decks/${deckId}/edit`);
  revalidatePath("/collection");
}

/**
 * Adiciona uma carta ao deck pelo nome (confirmado na Scryfall). Se ela já estiver
 * na lista, soma as cópias. O RLS de deck_cards garante que só o dono/root edite.
 */
export async function addDeckCard(deckId: string, name: string, quantity = 1): Promise<{ error?: string; name?: string }> {
  const { supabase } = await requireUser();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { error: "Quantidade inválida." };
  const card = await getCardByName(name.trim());
  if (!card) return { error: `Carta "${name}" não encontrada na Scryfall.` };

  const { data: existing, error: readError } = await supabase
    .from("deck_cards")
    .select("id, card_name, quantity, is_commander")
    .eq("deck_id", deckId);
  if (readError) return { error: readError.message };
  const same = (existing ?? []).find((c) => frontKey(c.card_name) === frontKey(card.name));
  if (same?.is_commander) return { error: `${card.name} já é o comandante deste deck.` };

  const { error } = same
    ? await supabase.from("deck_cards").update({ quantity: same.quantity + quantity }).eq("id", same.id)
    : await supabase
        .from("deck_cards")
        .insert({ deck_id: deckId, card_name: card.name, quantity, is_commander: false, is_proxy: false });
  if (error) return { error: error.message };
  revalidateDeck(deckId);
  return { name: card.name };
}

/** Muda a quantidade de uma carta da lista (não mexe nos comandantes). */
export async function setDeckCardQuantity(cardId: string, quantity: number) {
  const { supabase } = await requireUser();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { error: "Quantidade inválida." };
  const { data, error } = await supabase
    .from("deck_cards")
    .update({ quantity })
    .eq("id", cardId)
    .eq("is_commander", false)
    .select("deck_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Carta não encontrada ou sem permissão." };
  revalidateDeck(data[0].deck_id);
  return {};
}

/** Tira uma carta da lista (comandantes só mudam pelo formulário do deck). */
export async function removeDeckCard(cardId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("deck_cards")
    .delete()
    .eq("id", cardId)
    .eq("is_commander", false)
    .select("deck_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Carta não encontrada ou sem permissão." };
  revalidateDeck(data[0].deck_id);
  return {};
}
