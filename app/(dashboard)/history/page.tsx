import type { Metadata } from "next";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { MilestoneItem, MilestoneList } from "@/components/milestone-item";
import { requireUser } from "@/lib/auth";
import { formatMonth } from "@/lib/format";
import { milestoneEvents, type MilestoneEvent } from "@/lib/milestones";
import type { PlayerMilestones } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Histórico" };

export default async function HistoryPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("player_milestones").select("*").returns<PlayerMilestones[]>();
  const rows = data ?? [];
  const events = milestoneEvents(rows);

  // Agrupa por mês (eventos já vêm do mais recente ao mais antigo)
  const months: { label: string; events: MilestoneEvent[] }[] = [];
  for (const e of events) {
    const label = formatMonth(e.at);
    const last = months.at(-1);
    if (last?.label === label) last.events.push(e);
    else months.push({ label, events: [e] });
  }

  const founded = rows.reduce<string | null>((min, r) => (!min || r.joined_at < min ? r.joined_at : min), null);
  const withMatch = rows.filter((r) => r.first_match_id).length;
  const withWin = rows.filter((r) => r.first_win_id).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        banner="historico"
        eyebrow="Crônicas"
        title="Histórico do grupo"
        description="Quando cada membro entrou, a primeira partida e a primeira vitória (partidas aprovadas)."
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="gap-1 px-4 py-4">
          <CardDescription className="text-xs">Membros</CardDescription>
          <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
          {founded && <div className="text-xs text-muted-foreground">desde {formatMonth(founded)}</div>}
        </Card>
        <Card className="gap-1 px-4 py-4">
          <CardDescription className="text-xs">Já jogaram</CardDescription>
          <div className="text-2xl font-bold tabular-nums">
            {withMatch}
            <span className="text-sm font-normal text-muted-foreground">/{rows.length}</span>
          </div>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <CardDescription className="text-xs">Já venceram</CardDescription>
          <div className="text-2xl font-bold text-amber-400 tabular-nums">
            {withWin}
            <span className="text-sm font-normal text-muted-foreground">/{rows.length}</span>
          </div>
        </Card>
      </div>

      {months.map((m) => (
        <section key={m.label} className="space-y-3">
          <h2 className="sticky top-14 z-10 bg-background/90 py-1 text-sm font-semibold text-muted-foreground capitalize backdrop-blur">
            {m.label}
          </h2>
          <Card>
            <CardContent>
              <MilestoneList>
                {m.events.map((e) => (
                  <MilestoneItem key={`${e.kind}-${e.userId}`} event={e} />
                ))}
              </MilestoneList>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
