import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import type { Deck, MatchParticipant } from "@/lib/types";
import { MatchForm } from "../../new/match-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Editar partida" };

export default async function EditMatchPage(props: PageProps<"/matches/[id]/edit">) {
  const { id } = await props.params;
  const { supabase, profile } = await requireUser();
  if (!isRoot(profile.role)) notFound();

  const { data: match } = await supabase
    .from("matches")
    .select("id, played_at, win_condition, notes, status, match_participants (*)")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      played_at: string;
      win_condition: string | null;
      notes: string | null;
      status: string;
      match_participants: MatchParticipant[];
    }>();
  if (!match) notFound();

  // Decks ativos + os que já estão na partida (podem ter sido aposentados depois)
  const matchDeckIds = match.match_participants.map((p) => p.deck_id);
  const [{ data: players }, { data: decks }, { data: permissions }] = await Promise.all([
    supabase.from("users").select("id, name").order("name"),
    supabase
      .from("decks")
      .select("*")
      .or(`is_active.eq.true,id.in.(${matchDeckIds.join(",")})`)
      .order("name")
      .returns<Deck[]>(),
    supabase.from("deck_permissions").select("deck_id, user_id"),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        banner="partidas"
        eyebrow="Correção (root)"
        title="Editar partida"
        description="As mudanças valem na hora para ranking, estatísticas e histórico. O status da partida não muda."
      />
      <MatchForm
        players={players ?? []}
        decks={decks ?? []}
        permissions={permissions ?? []}
        currentUserId={profile.id}
        isAdmin
        editing={{
          matchId: match.id,
          played_at: match.played_at,
          win_condition: match.win_condition ?? "",
          notes: match.notes ?? "",
          participants: match.match_participants.map((p) => ({
            pilot_id: p.pilot_id,
            deck_id: p.deck_id,
            seat_order: p.seat_order ?? 9,
            is_winner: p.is_winner,
            elimination_reason: p.elimination_reason ?? "",
            eliminated_by: p.eliminated_by ?? "",
          })),
        }}
      />
    </div>
  );
}
