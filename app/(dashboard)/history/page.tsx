import type { Metadata } from "next";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { MilestoneItem, MilestoneList } from "@/components/milestone-item";
import { loadAchievements } from "@/lib/achievements";
import { seasonStatus } from "@/lib/seasons";
import { loadSeasons, loadSeasonUnlocks } from "@/lib/seasons-data";
import { requireUser } from "@/lib/auth";
import { formatMonth } from "@/lib/format";
import { milestoneEvents, type MilestoneEvent } from "@/lib/milestones";
import type { PlayerMilestones } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Histórico" };

export default async function HistoryPage() {
  const { supabase } = await requireUser();
  const [{ data }, achievements, seasons, seasonUnlocks, { data: users }] = await Promise.all([
    supabase.from("player_milestones").select("*").returns<PlayerMilestones[]>(),
    loadAchievements(supabase),
    loadSeasons(supabase),
    loadSeasonUnlocks(supabase),
    supabase.from("users").select("id, name, role"),
  ]);
  const rows = data ?? [];
  // Temporadas já iniciadas, com quem levou a Coroa e a Lenda (o root não aparece)
  const nameOf = new Map((users ?? []).filter((u) => u.role !== "root").map((u) => [u.id as string, u.name as string]));
  const owners = (seasonId: string, key: string) =>
    seasonUnlocks
      .filter((u) => u.season_id === seasonId && u.achievement_key === key && nameOf.has(u.user_id))
      .map((u) => ({ id: u.user_id, name: nameOf.get(u.user_id)! }));
  const events = milestoneEvents(rows, {
    releases: true,
    achievements,
    seasons: seasons
      .filter((s) => seasonStatus(s) !== "upcoming")
      .map((s) => ({
        number: s.number,
        name: s.theme.name,
        color: s.theme.color,
        startsAt: s.starts_at,
        closedAt: s.closed_at,
        coroa: owners(s.id, "coroa"),
        lenda: owners(s.id, "lenda"),
      })),
  });

  // Agrupa por mês (eventos já vêm do mais recente ao mais antigo)
  const months: { label: string; events: MilestoneEvent[] }[] = [];
  for (const e of events) {
    const label = formatMonth(e.at);
    const last = months.at(-1);
    if (last?.label === label) last.events.push(e);
    else months.push({ label, events: [e] });
  }

  const founded = events
    .filter((e) => e.kind === "joined")
    .reduce<string | null>((min, e) => (!min || e.at < min ? e.at : min), null);
  const withMatch = rows.filter((r) => r.first_match_id).length;
  const withWin = rows.filter((r) => r.first_win_id).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        banner="historico"
        eyebrow="Crônicas"
        title="Histórico do grupo"
        description="Quando cada membro entrou, a primeira partida, a primeira vitória, as conquistas raras e míticas (partidas aprovadas) e as versões do Mesão."
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
                  <MilestoneItem key={`${e.kind}-${e.userId}-${e.release?.version ?? e.achievementId ?? `${e.season?.number}-${e.season?.phase}`}`} event={e} />
                ))}
              </MilestoneList>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
