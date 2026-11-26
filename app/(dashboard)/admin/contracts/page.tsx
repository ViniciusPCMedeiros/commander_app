import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { contractStatus, type ClaimStatus, type ContractRarity } from "@/lib/contracts";
import { formatDateTime, HIDDEN_PLAYER } from "@/lib/format";
import { isModerator, isRoot } from "@/lib/roles";
import { seasonLabel, seasonStatus } from "@/lib/seasons";
import { loadContractTemplates, loadSeasonContracts, loadSeasons } from "@/lib/seasons-data";
import { createAdminClient } from "@/lib/supabase/server";
import { ContractAdmin, type QueueClaim } from "./contract-admin";

export const metadata: Metadata = { title: "Contratos — Admin" };

interface ClaimRow {
  id: string;
  user_id: string;
  match_id: string;
  note: string | null;
  points: number;
  status: ClaimStatus;
  reject_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  contract: { title: string; description: string | null; rarity: ContractRarity } | null;
  match: { status: string; played_at: string } | null;
  contract_votes: { voter_id: string }[];
}

export default async function ContractAdminPage() {
  const { supabase, profile } = await requireUser();
  if (!isModerator(profile.role)) redirect("/");
  const root = isRoot(profile.role);

  // Service role: a fila inteira com nomes (inclusive de quem votou)
  const admin = createAdminClient();
  const select =
    "id, user_id, match_id, note, points, status, reject_reason, decided_by, decided_at, created_at, contract:season_contracts ( title, description, rarity ), match:matches ( status, played_at ), contract_votes ( voter_id )";
  const [seasons, templates, { data: users }, { data: pendingRows }, { data: recentRows }] = await Promise.all([
    loadSeasons(supabase),
    root ? loadContractTemplates(supabase) : Promise.resolve([]),
    admin.from("users").select("id, name, role"),
    admin.from("contract_claims").select(select).eq("status", "pending").order("created_at").returns<ClaimRow[]>(),
    admin
      .from("contract_claims")
      .select(select)
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(10)
      .returns<ClaimRow[]>(),
  ]);
  // O root é invisível para o grupo: para admins, aparece como o jogador oculto
  const names = new Map(
    (users ?? []).map((u) => [u.id as string, u.role === "root" && !root ? HIDDEN_PLAYER : (u.name as string)]),
  );
  const toQueue = (c: ClaimRow): QueueClaim => ({
    id: c.id,
    title: c.contract?.title ?? "?",
    description: c.contract?.description ?? null,
    rarity: c.contract?.rarity ?? "common",
    points: c.points,
    claimant: { id: c.user_id, name: names.get(c.user_id) ?? "?" },
    mine: c.user_id === profile.id,
    matchId: c.match_id,
    matchLabel: c.match ? formatDateTime(c.match.played_at) : "?",
    matchApproved: c.match?.status === "approved",
    note: c.note,
    voters: c.contract_votes.map((v) => names.get(v.voter_id) ?? "?"),
    votedByMe: c.contract_votes.some((v) => v.voter_id === profile.id),
    status: c.status,
    rejectReason: c.reject_reason,
    decidedBy: c.decided_by ? (names.get(c.decided_by) ?? "?") : null,
    decidedAt: c.decided_at ? formatDateTime(c.decided_at) : null,
  });

  // Contratos em jogo na temporada em andamento (o root pode tirar os que ninguém levou)
  const active = seasons.find((s) => seasonStatus(s) === "active") ?? null;
  const inPlay = root && active ? await loadSeasonContracts(supabase, active.id) : [];
  const { data: winners } = inPlay.length
    ? await admin
        .from("contract_claims")
        .select("contract_id, user_id")
        .eq("status", "approved")
        .in(
          "contract_id",
          inPlay.map((c) => c.id),
        )
    : { data: [] };
  const winnerOf = new Map((winners ?? []).map((w) => [w.contract_id as string, w.user_id as string]));

  return (
    <div className="space-y-6">
      <PageHeader
        banner="admin"
        eyebrow="Conselho"
        title="Contratos"
        description={
          root
            ? "Aprove as reivindicações (o seu voto já vale), mantenha o catálogo e os contratos em jogo."
            : "Aprove as reivindicações: valem com o voto de 2 admins diferentes (ou do root). Ninguém aprova a própria."
        }
        actions={
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Admin
          </Link>
        }
      />
      <ContractAdmin
        root={root}
        queue={(pendingRows ?? []).map(toQueue)}
        recent={(recentRows ?? []).map(toQueue)}
        templates={templates}
        season={active ? { label: seasonLabel(active) } : null}
        inPlay={inPlay.map((c) => ({
          id: c.id,
          title: c.title,
          rarity: c.rarity,
          reward: c.reward,
          deadline: formatDateTime(new Date(new Date(c.ends_at).getTime() - 60_000)),
          status: contractStatus(c, winnerOf.get(c.id)),
          winner: winnerOf.has(c.id) ? (names.get(winnerOf.get(c.id)!) ?? "?") : null,
        }))}
      />
    </div>
  );
}
