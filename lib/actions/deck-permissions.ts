"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";

function revalidatePermissions(deckId: string) {
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/players/[id]", "page");
  revalidatePath("/matches/new");
}

/** Dono (ou root) libera o deck para outro membro usar. */
export async function grantDeckPermission(deckId: string, userId: string): Promise<{ error?: string }> {
  const { supabase, profile } = await requireUser();

  const { data: deck } = await supabase.from("decks").select("owner_id").eq("id", deckId).single();
  if (!deck) return { error: "Deck não encontrado." };
  if (deck.owner_id !== profile.id && !isRoot(profile.role)) return { error: "Só o dono do deck pode liberá-lo." };
  if (!userId || userId === deck.owner_id) return { error: "Escolha outro membro do grupo." };

  const { error } = await supabase.from("deck_permissions").insert({ deck_id: deckId, user_id: userId, granted_by: profile.id });
  if (error) {
    if (error.code === "23505") return { error: "Esse membro já pode usar o deck." };
    return { error: error.message };
  }

  revalidatePermissions(deckId);
  return {};
}

/** Dono/root revogam; o próprio membro pode abrir mão. O RLS garante quem pode. */
export async function revokeDeckPermission(deckId: string, userId: string): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("deck_permissions")
    .delete()
    .eq("deck_id", deckId)
    .eq("user_id", userId)
    .select("deck_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Permissão não encontrada ou sem acesso." };

  revalidatePermissions(deckId);
  return {};
}
