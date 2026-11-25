"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getCardImage, getCardsCollection, getManaCost, parseDecklist } from "@/lib/scryfall";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { scheduleAchievementSync } from "@/lib/achievement-sync";

export async function importCollection(
  text: string,
): Promise<{ error?: string; imported?: number; notFound?: string[]; skippedProxies?: number }> {
  const { supabase, profile } = await requireUser();
  if (text.length > 40_000) return { error: "Lista grande demais: importe em partes de até 1000 cartas." };
  const all = parseDecklist(text);
  // Proxy não é cópia física: não entra na coleção
  const parsed = all.filter((p) => !p.isProxy);
  const skippedProxies = all.length - parsed.length;
  if (!parsed.length) return { error: "Nenhuma carta física reconhecida. Use o formato \"2 Sol Ring\" (uma por linha)." };
  if (parsed.length > 1000) return { error: "Máximo de 1000 cartas por importação." };

  const { found, notFound } = await getCardsCollection(parsed.map((p) => p.name));

  // Soma ao que já existe na coleção
  const existing = await fetchAll<{ card_name: string; quantity: number }>((from, to) =>
    supabase.from("user_cards").select("card_name, quantity").eq("user_id", profile.id).order("id").range(from, to),
  );
  const existingQty = new Map(existing.map((e) => [e.card_name.toLowerCase(), e.quantity]));

  const qtyByFront = new Map(parsed.map((p) => [p.name.split(" // ")[0].toLowerCase(), p.quantity]));
  const rows = new Map<string, Record<string, unknown>>();
  for (const card of found) {
    const front = card.name.split(" // ")[0].toLowerCase();
    const added = qtyByFront.get(front) ?? qtyByFront.get(card.name.toLowerCase()) ?? 1;
    const prev = rows.get(card.name.toLowerCase());
    const base = (prev?.quantity as number | undefined) ?? existingQty.get(card.name.toLowerCase()) ?? 0;
    rows.set(card.name.toLowerCase(), {
      user_id: profile.id,
      scryfall_id: card.id,
      card_name: card.name,
      mana_cost: getManaCost(card),
      type_line: card.type_line ?? null,
      color_identity: card.color_identity,
      image_url: getCardImage(card, "normal"),
      quantity: base + added,
    });
  }

  if (rows.size) {
    const { error } = await supabase.from("user_cards").upsert([...rows.values()], { onConflict: "user_id,card_name" });
    if (error) return { error: error.message };
  }

  revalidatePath("/collection");
  scheduleAchievementSync();
  return { imported: rows.size, notFound, skippedProxies };
}

export async function updateCollectionCard(
  id: string,
  patch: { quantity?: number; available_for_trade?: boolean; notes?: string | null },
) {
  const { supabase } = await requireUser();
  if (patch.quantity !== undefined && (!Number.isInteger(patch.quantity) || patch.quantity < 1)) {
    return { error: "Quantidade deve ser ≥ 1." };
  }
  const { error } = await supabase.from("user_cards").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/collection");
  scheduleAchievementSync();
  return {};
}

export async function deleteCollectionCard(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("user_cards").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/collection");
  scheduleAchievementSync();
  return {};
}
