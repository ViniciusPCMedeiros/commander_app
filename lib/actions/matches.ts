"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { eliminationKind } from "@/lib/elimination";
import { MATCH_NOTES_MAX } from "@/lib/format";
import { isModerator, isRoot } from "@/lib/roles";
import type { Deck } from "@/lib/types";
import { scheduleAchievementSync } from "@/lib/achievement-sync";

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
  // Partida nova, aprovada, rejeitada, corrigida ou excluída muda conquistas
  scheduleAchievementSync();
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/decks");
  revalidatePath("/players/[id]", "page");
}

/** Regras comuns a criar e editar partida. Retorna a mensagem de erro, se houver. */
function validateMatch(input: MatchInput): string | null {
  if ((input.notes?.trim().length ?? 0) > MATCH_NOTES_MAX) return `As notas podem ter no máximo ${MATCH_NOTES_MAX} caracteres.`;
  const ps = input.participants;
  if (ps.length < 2 || ps.length > 8) return "Uma partida precisa de 2 a 8 jogadores.";
  if (ps.some((p) => !p.pilot_id || !p.deck_id)) return "Preencha jogador e deck em todos os assentos.";
  if (new Set(ps.map((p) => p.pilot_id)).size !== ps.length) return "Um jogador aparece duas vezes.";
  if (new Set(ps.map((p) => p.deck_id)).size !== ps.length) return "Um deck aparece duas vezes.";
  if (ps.filter((p) => p.is_winner).length !== 1) return "Marque exatamente um vencedor.";

  // Quem eliminou: obrigatório quando o motivo é causado por um oponente
  const pilotIds = new Set(ps.map((p) => p.pilot_id));
  for (const p of ps) {
    if (p.is_winner) continue;
    const kind = eliminationKind(p.elimination_reason);
    if (kind === "opponent") {
      if (!p.eliminated_by) return `Informe quem eliminou o jogador do assento ${p.seat_order} (${p.elimination_reason}).`;
      if (p.eliminated_by === p.pilot_id) return `O jogador do assento ${p.seat_order} não pode ter sido eliminado por ele mesmo — use "Drenagem própria" ou "Mill próprio".`;
      if (!pilotIds.has(p.eliminated_by)) return `Quem eliminou o jogador do assento ${p.seat_order} precisa estar na partida.`;
    }
  }
  return null;
}

export async function createMatch(input: MatchInput): Promise<{ error?: string; status?: string }> {
  const { supabase, profile } = await requireUser();
  const ps = input.participants;
  const invalid = validateMatch(input);
  if (invalid) return { error: invalid };

  const playedAt = input.played_at ? new Date(input.played_at) : new Date();
  if (Number.isNaN(playedAt.getTime())) return { error: "Data inválida." };

  // Temporada encerrada já entregou os prêmios: partida nova não pode cair no período dela
  const { data: closedSeason } = await supabase
    .from("seasons")
    .select("number")
    .not("closed_at", "is", null)
    .lte("starts_at", playedAt.toISOString())
    .gt("ends_at", playedAt.toISOString())
    .maybeSingle();
  if (closedSeason)
    return { error: `Essa data é da Temporada ${closedSeason.number}, que já foi encerrada. Confira a data da partida.` };

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

/**
 * Correção de uma partida já registrada (só root). Mantém o status; a troca dos
 * participantes acontece numa única transação no banco (root_update_match).
 */
export async function updateMatch(matchId: string, input: MatchInput): Promise<{ error?: string }> {
  const { supabase, profile } = await requireUser();
  if (!isRoot(profile.role)) return { error: "Apenas o root edita partidas." };

  const invalid = validateMatch(input);
  if (invalid) return { error: invalid };
  const playedAt = new Date(input.played_at);
  if (Number.isNaN(playedAt.getTime())) return { error: "Data inválida." };

  const { error } = await supabase.rpc("root_update_match", {
    p_match_id: matchId,
    p_played_at: playedAt.toISOString(),
    p_win_condition: input.win_condition ?? "",
    p_notes: input.notes ?? "",
    p_participants: input.participants.map((p) => ({
      pilot_id: p.pilot_id,
      deck_id: p.deck_id,
      seat_order: p.seat_order,
      is_winner: p.is_winner,
      elimination_reason: p.is_winner ? null : p.elimination_reason || null,
      eliminated_by:
        !p.is_winner && eliminationKind(p.elimination_reason) === "opponent" ? p.eliminated_by || null : null,
    })),
  });
  if (error) return { error: `Erro ao salvar a partida: ${error.message}` };

  revalidateAll();
  revalidatePath("/ranking");
  revalidatePath("/history");
  return {};
}
