import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchCard } from "@/components/match-card";
import { requireUser } from "@/lib/auth";
import { MATCH_SELECT } from "@/lib/newspaper";
import { isModerator } from "@/lib/roles";
import type { MatchWithParticipants } from "@/lib/types";
import { ModerationActions } from "./moderation-actions";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Partidas" };

export default async function MatchesPage(props: PageProps<"/matches">) {
  const { tab } = await props.searchParams;
  const { supabase, profile } = await requireUser();
  const isAdmin = isModerator(profile.role);

  const [{ data: history }, { data: queue }] = await Promise.all([
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .eq("status", "approved")
      .order("played_at", { ascending: false })
      .limit(100)
      .returns<MatchWithParticipants[]>(),
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .in("status", ["pending", "rejected"])
      .order("played_at", { ascending: false })
      .limit(100)
      .returns<MatchWithParticipants[]>(),
  ]);

  // Membros veem só as pendentes/rejeitadas que criaram ou em que jogaram
  const visibleQueue = (queue ?? []).filter(
    (m) =>
      isAdmin ||
      m.created_by === profile.id ||
      m.match_participants.some((p) => p.pilot_id === profile.id),
  );
  const pendingCount = visibleQueue.filter((m) => m.status === "pending").length;

  return (
    <div className="space-y-6">
      <PageHeader
        banner="partidas"
        eyebrow="Mesa de jogo"
        title="Partidas"
        description={
          isAdmin
            ? "Histórico validado e fila de moderação."
            : "Partidas registradas por membros entram como pendentes até um Admin aprovar."
        }
        actions={
          <Button asChild>
            <Link href="/matches/new">
              <Plus /> Registrar partida
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue={tab === "queue" ? "queue" : "history"}>
        <TabsList>
          <TabsTrigger value="history">Histórico ({history?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            {isAdmin ? "Fila de moderação" : "Minhas pendentes"}
            {pendingCount > 0 && <Badge className="h-5 min-w-5 px-1.5">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4 grid gap-4 md:grid-cols-2">
          {(history ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma partida aprovada.</p>}
          {(history ?? []).map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              actions={isAdmin ? <ModerationActions matchId={m.id} status={m.status} /> : undefined}
            />
          ))}
        </TabsContent>

        <TabsContent value="queue" className="mt-4 grid gap-4 md:grid-cols-2">
          {visibleQueue.length === 0 && <p className="text-sm text-muted-foreground">Nada aguardando moderação. 🎉</p>}
          {visibleQueue.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              actions={isAdmin ? <ModerationActions matchId={m.id} status={m.status} /> : undefined}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
