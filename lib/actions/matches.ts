"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { eliminationKind } from "@/lib/elimination";
import { isModerator } from "@/lib/roles";
import type { Deck } from "@/lib/types";

export interface MatchInput {
  played_at: string;
  win_condition: string;
  notes: string;
  participants: {
    pilot_id: string;
    deck_id: string;
    seat_order: number;
    is_winner: boolean;
    elimination_reason: string;
    /** Pilot (users.id) do oponente que eliminou este jogador, quando o motivo é causado por oponente. */
    eliminated_by?: string;
  }[];
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/decks");
  revalidatePath("/players/[id]", "page");
}

export async function createMatch(input: MatchInput): Promise<{ error?: string; status?: string }> {
  const { supabase, profile } = await requireUser();
  const ps = input.participants;

  if (ps.length < 2 || ps.length > 8) return { error: "Uma partida precisa de 2 a 8 jogadores." };
  if (ps.some((p) => !p.pilot_id || !p.deck_id)) return { error: "Preencha jogador e deck em todos os assentos." };
  if (new Set(ps.map((p) => p.pilot_id)).size !== ps.length) return { error: "Um jogador aparece duas vezes." };
  if (new Set(ps.map((p) => p.deck_id)).size !== ps.length) return { error: "Um deck aparece duas vezes." };
  if (ps.filter((p) => p.is_winner).length !== 1) return { error: "Marque exatamente um vencedor." };

  // Quem eliminou: obrigatório quando o motivo é causado por um oponente
  const pilotIds = new Set(ps.map((p) => p.pilot_id));
  for (const p of ps) {
    if (p.is_winner) continue;
    const kind = eliminationKind(p.elimination_reason);
    if (kind === "opponent") {
      if (!p.eliminated_by) return { error: `Informe quem eliminou o jogador do assento ${p.seat_order} (${p.elimination_reason}).` };
      if (p.eliminated_by === p.pilot_id) return { error: `O jogador do assento ${p.seat_order} não pode ter sido eliminado por ele mesmo — use "Drenagem própria" ou "Mill próprio".` };
      if (!pilotIds.has(p.eliminated_by)) return { error: `Quem eliminou o jogador do assento ${p.seat_order} precisa estar na partida.` };
    }
  }

  const playedAt = input.played_at ? new Date(input.played_at) : new Date();
  if (Number.isNaN(playedAt.getTime())) return { error: "Data inválida." };

  // Snapshots imutáveis: dono, comandante e cores do deck neste momento
  const { data: decks, error: decksError } = await supabase
    .from("decks")
    .select("*")
    .in(
      "id",
      ps.map((p) => p.deck_id),
    );
  if (decksError || !decks || decks.length !== ps.length) return { error: "Deck não encontrado." };
  const deckById = new Map((decks as Deck[]).map((d) => [d.id, d]));

  const isAdmin = isModerator(profile.role);
  const status = isAdmin ? "approved" : "pending";

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      played_at: playedAt.toISOString(),
      status,
      win_condition: input.win_condition || null,
      notes: input.notes?.trim() || null,
      created_by: profile.id,
      validated_by: isAdmin ? profile.id : null,
      validated_at: isAdmin ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !match) return { error: `Erro ao criar partida: ${error?.message}` };

  const { error: pError } = await supabase.from("match_participants").insert(
    ps.map((p) => {
      const deck = deckById.get(p.deck_id)!;
      return {
        match_id: match.id,
        pilot_id: p.pilot_id,
        deck_id: deck.id,
        deck_owner_id: deck.owner_id,
        commander_snapshot: deck.partner_name ? `${deck.commander_name} + ${deck.partner_name}` : deck.commander_name,
        color_identity_snapshot: deck.color_identity,
        is_winner: p.is_winner,
        seat_order: p.seat_order,
        elimination_reason: p.is_winner ? null : p.elimination_reason || null,
        eliminated_by:
          !p.is_winner && eliminationKind(p.elimination_reason) === "opponent" ? p.eliminated_by || null : null,
      };
    }),
  );
  if (pError) {
    if (isAdmin) await supabase.from("matches").delete().eq("id", match.id);
    return { error: `Erro ao salvar participantes: ${pError.message}` };
  }

  revalidateAll();
  return { status };
}

export async function moderateMatch(matchId: string, decision: "approved" | "rejected") {
  const { supabase, profile } = await requireUser();
  if (!isModerator(profile.role)) return { error: "Apenas admins moderam partidas." };

  const { error } = await supabase
    .from("matches")
    .update({ status: decision, validated_by: profile.id, validated_at: new Date().toISOString() })
    .eq("id", matchId);
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}

export async function deleteMatch(matchId: string) {
  const { supabase, profile } = await requireUser();
  if (!isModerator(profile.role)) return { error: "Apenas admins excluem partidas." };
  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) return { error: error.message };
  revalidateAll();
  return {};
}
