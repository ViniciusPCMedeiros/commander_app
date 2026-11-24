import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { isModerator } from "@/lib/roles";
import type { Deck } from "@/lib/types";
import { MatchForm } from "./match-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Registrar partida" };

export default async function NewMatchPage() {
  const { supabase, profile } = await requireUser();
  const [{ data: players }, { data: decks }, { data: permissions }] = await Promise.all([
    supabase.from("users").select("id, name").order("name"),
    supabase.from("decks").select("*").eq("is_active", true).order("name").returns<Deck[]>(),
    supabase.from("deck_permissions").select("deck_id, user_id"),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        banner="partidas"
        eyebrow="Nova partida"
        title="Registrar partida"
        description={
          isModerator(profile.role)
            ? "Como Admin, a partida já entra aprovada."
            : "A partida entra como pendente até um Admin validar."
        }
      />
      <MatchForm players={players ?? []} decks={decks ?? []} permissions={permissions ?? []} currentUserId={profile.id} isAdmin={isModerator(profile.role)} />
    </div>
  );
}
