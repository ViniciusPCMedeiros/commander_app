import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { isRoot } from "@/lib/roles";
import { DeckForm } from "./deck-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Novo deck" };

export default async function NewDeckPage() {
  const { supabase, profile } = await requireUser();
  const { data: players } = await supabase.from("users").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        banner="decks"
        eyebrow="Arsenal"
        title="Novo deck"
        description="Busque o comandante na Scryfall. Suporta dupla-face, Partner, Friends Forever, Backgrounds e Doctor's Companion."
      />
      <DeckForm players={players ?? []} canChooseOwner={isRoot(profile.role)} currentUserId={profile.id} />
    </div>
  );
}
