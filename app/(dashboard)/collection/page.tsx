import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadProxyCards } from "@/lib/proxies";
import type { CollectionStatus } from "@/lib/types";
import { CollectionTable, type CollectionFilter } from "./collection-table";
import { ImportDialog } from "./import-dialog";
import { PlayerPicker } from "./player-picker";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Coleção" };

export default async function CollectionPage(props: PageProps<"/collection">) {
  const { user, tab } = await props.searchParams;
  const { supabase, profile } = await requireUser();
  const userId = typeof user === "string" && user ? user : profile.id;
  const editable = userId === profile.id;

  const [cards, { data: players }, proxies] = await Promise.all([
    fetchAll<CollectionStatus>((from, to) =>
      supabase.from("user_collection_status").select("*").eq("user_id", userId).order("card_name").order("id").range(from, to),
    ),
    supabase.from("users").select("id, name").order("name"),
    loadProxyCards(supabase, userId),
  ]);
  const initialFilter: CollectionFilter = tab === "needed" || tab === "proxies" ? tab : "all";

  const list = cards;
  const rotating = list.filter((c) => c.usage_status === "shared_rotation");
  const totalCopies = list.reduce((s, c) => s + c.owned_qty, 0);
  const freeCopies = list.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const ownerName = players?.find((p) => p.id === userId)?.name ?? "";
  const needed = proxies.filter((p) => p.needed_qty > 0);
  const neededCopies = needed.reduce((s, p) => s + p.needed_qty, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        banner="colecao"
        eyebrow="Tesouro"
        title={editable ? "Coleção" : `Coleção de ${ownerName}`}
        description="Cópias físicas vs. uso nos decks ativos, e os proxies que indicam as cartas que faltam."
        actions={
          <>
            <PlayerPicker players={players ?? []} value={userId} />
            {editable && <ImportDialog />}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="gap-1 px-4 py-4">
          <CardDescription className="text-xs">Cartas únicas</CardDescription>
          <div className="text-2xl font-bold tabular-nums">{list.length}</div>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <CardDescription className="text-xs">Cópias livres</CardDescription>
          <div className="text-2xl font-bold tabular-nums">
            {freeCopies}
            <span className="text-sm font-normal text-muted-foreground">/{totalCopies}</span>
          </div>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <CardDescription className="text-xs">Rotacionadas</CardDescription>
          <div className="text-2xl font-bold text-amber-400 tabular-nums">{rotating.length}</div>
        </Card>
        <Link href={`/collection?user=${userId}&tab=needed`} className="contents">
          <Card className="gap-1 px-4 py-4 transition-colors hover:bg-muted/40">
            <CardDescription className="text-xs">Cartas que precisa</CardDescription>
            <div className="text-2xl font-bold text-violet-300 tabular-nums">
              {neededCopies}
              <span className="text-sm font-normal text-muted-foreground"> · {proxies.length} proxy(s)</span>
            </div>
          </Card>
        </Link>
      </div>

      {rotating.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="text-amber-400" />
          <AlertTitle>Cartas rotacionadas entre decks</AlertTitle>
          <AlertDescription>
            <p>
              {rotating.length} carta(s) têm menos cópias físicas do que decks que as usam. Lembre de trocar a carta de
              sleeve antes de jogar:
            </p>
            <ul className="mt-2 space-y-1">
              {rotating.map((c) => (
                <li key={c.id}>
                  <strong>{c.card_name}</strong>: {c.owned_qty} cópia(s) ↔{" "}
                  {c.used_in_decks.map((name, i) => (
                    <span key={name}>
                      {i > 0 && ", "}
                      <Link href={`/decks/${c.used_in_deck_ids[i] ?? ""}`} className="underline">
                        {name}
                      </Link>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <CollectionTable key={initialFilter} cards={list} proxies={proxies} editable={editable} initialFilter={initialFilter} />
    </div>
  );
}
