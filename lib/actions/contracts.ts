"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  ADMIN_VOTES_NEEDED,
  CLAIM_NOTE_MAX,
  CONTRACT_DESCRIPTION_MAX,
  CONTRACT_RARITIES,
  CONTRACT_REWARD,
  CONTRACT_TITLE_MAX,
  REJECT_REASON_MAX,
  type ContractRarity,
} from "@/lib/contracts";
import { isModerator, isRoot } from "@/lib/roles";
import { seasonStatus, spWeekStart, type Season } from "@/lib/seasons";
import { currentSeason, loadSeasons } from "@/lib/seasons-data";
import { createAdminClient } from "@/lib/supabase/server";

type Result = { error?: string };

function revalidateContracts() {
  revalidatePath("/seasons");
  revalidatePath("/ranking");
  revalidatePath("/admin/contracts");
  revalidatePath("/", "layout");
}

async function requireRoot() {
  const ctx = await requireUser();
  if (!isRoot(ctx.profile.role)) throw new Error("Só o root gerencia o catálogo de contratos.");
  return ctx;
}

// ----------------------------------------------------------------- Catálogo

export interface ContractTemplateInput {
  id?: string;
  title: string;
  description: string;
  rarity: ContractRarity;
  active: boolean;
}

export async function saveContractTemplate(input: ContractTemplateInput): Promise<Result> {
  const { profile } = await requireRoot();
  const title = input.title.trim();
  if (!title || title.length > CONTRACT_TITLE_MAX) return { error: `Dê um nome de até ${CONTRACT_TITLE_MAX} caracteres.` };
  if (input.description.trim().length > CONTRACT_DESCRIPTION_MAX)
    return { error: `Descrição com no máximo ${CONTRACT_DESCRIPTION_MAX} caracteres.` };
  if (!input.description.trim()) return { error: "Descreva o que precisa ser feito." };
  if (!CONTRACT_RARITIES.includes(input.rarity)) return { error: "Raridade inválida." };
  const row = { title, description: input.description.trim(), rarity: input.rarity, active: input.active };
  const admin = createAdminClient();
  const { error } = input.id
    ? await admin.from("contract_templates").update(row).eq("id", input.id)
    : await admin.from("contract_templates").insert({ ...row, created_by: profile.id });
  if (error) return { error: error.message };
  revalidateContracts();
  return {};
}

export async function deleteContractTemplate(id: string): Promise<Result> {
  await requireRoot();
  // Contratos já sorteados guardam uma cópia: excluir o modelo não mexe neles
  const { error } = await createAdminClient().from("contract_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateContracts();
  return {};
}

/** Coloca um contrato do catálogo em jogo agora, na semana atual da temporada em andamento. */
export async function addContractNow(templateId: string): Promise<Result> {
  const { supabase } = await requireRoot();
  const season = currentSeason(await loadSeasons(supabase));
  if (!season || seasonStatus(season) !== "active") return { error: "Nenhuma temporada em andamento." };
  const admin = createAdminClient();
  const { data: t } = await admin.from("contract_templates").select("*").eq("id", templateId).single();
  if (!t) return { error: "Contrato não encontrado no catálogo." };
  const now = new Date();
  const { start } = spWeekStart(now);
  const startsAt = new Date(Math.max(start.getTime(), new Date(season.starts_at).getTime()));
  const endsAt = new Date(
    Math.min(start.getTime() + 7 * 24 * 60 * 60 * 1000, new Date(season.ends_at).getTime()),
  );
  const reward = CONTRACT_REWARD[t.rarity as ContractRarity];
  const { error } = await admin.from("season_contracts").insert({
    season_id: season.id,
    template_id: t.id,
    title: t.title,
    description: t.description,
    rarity: t.rarity,
    reward,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });
  if (error) return { error: error.message };
  revalidateContracts();
  return {};
}

/** Tira um contrato de jogo (só se ninguém tiver levado). */
export async function removeContract(contractId: string): Promise<Result> {
  await requireRoot();
  const admin = createAdminClient();
  const { data: winner } = await admin
    .from("contract_claims")
    .select("id")
    .eq("contract_id", contractId)
    .eq("status", "approved")
    .maybeSingle();
  if (winner) return { error: "Este contrato já foi cumprido: os pontos ficam." };
  const { error } = await admin.from("season_contracts").delete().eq("id", contractId);
  if (error) return { error: error.message };
  revalidateContracts();
  return {};
}

// ------------------------------------------------------------ Reivindicação

async function loadContractWithSeason(admin: ReturnType<typeof createAdminClient>, contractId: string) {
  const { data } = await admin
    .from("season_contracts")
    .select("id, title, reward, starts_at, ends_at, season:seasons ( id, closed_at )")
    .eq("id", contractId)
    .single<{
      id: string;
      title: string;
      reward: number;
      starts_at: string;
      ends_at: string;
      season: Pick<Season, "id" | "closed_at"> | null;
    }>();
  return data;
}

/** Contrato aberto (no prazo, sem dono, temporada não encerrada)? Devolve o erro, se houver. */
async function openContractError(admin: ReturnType<typeof createAdminClient>, contractId: string) {
  const contract = await loadContractWithSeason(admin, contractId);
  if (!contract?.season) return { contract: null, error: "Contrato não encontrado." };
  if (contract.season.closed_at) return { contract, error: "A temporada deste contrato já foi encerrada." };
  const { data: winner } = await admin
    .from("contract_claims")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("status", "approved")
    .maybeSingle();
  if (winner) return { contract, error: "Este contrato já tem dono." };
  return { contract, error: null };
}

/** Pega um contrato da semana para tentar (várias pessoas podem pegar o mesmo). */
export async function takeContract(contractId: string): Promise<Result> {
  const { profile } = await requireUser();
  if (isRoot(profile.role)) return { error: "O root não participa dos contratos." };
  const admin = createAdminClient();
  const { contract, error } = await openContractError(admin, contractId);
  if (error || !contract) return { error: error ?? "Contrato não encontrado." };
  if (new Date(contract.ends_at) <= new Date()) return { error: "Este contrato já expirou." };
  const { error: insertError } = await admin
    .from("contract_takers")
    .upsert({ contract_id: contract.id, user_id: profile.id }, { onConflict: "contract_id,user_id", ignoreDuplicates: true });
  if (insertError) return { error: insertError.message };
  revalidateContracts();
  return {};
}

/** Larga um contrato (não dá com uma reivindicação em análise: retire-a antes). */
export async function dropContract(contractId: string): Promise<Result> {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("contract_claims")
    .select("id")
    .eq("contract_id", contractId)
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pending) return { error: "Você tem uma reivindicação em análise neste contrato: retire-a antes." };
  const { error } = await admin.from("contract_takers").delete().eq("contract_id", contractId).eq("user_id", profile.id);
  if (error) return { error: error.message };
  revalidateContracts();
  return {};
}

export async function claimContract(input: { contractId: string; matchId: string; note: string }): Promise<Result> {
  const { profile } = await requireUser();
  if (isRoot(profile.role)) return { error: "O root não participa dos contratos." };
  const note = input.note.trim();
  if (note.length > CLAIM_NOTE_MAX) return { error: `Conte em até ${CLAIM_NOTE_MAX} caracteres.` };

  const admin = createAdminClient();
  const { contract, error: openError } = await openContractError(admin, input.contractId);
  if (openError || !contract) return { error: openError ?? "Contrato não encontrado." };
  const { data: taker } = await admin
    .from("contract_takers")
    .select("user_id")
    .eq("contract_id", contract.id)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!taker) return { error: "Pegue o contrato antes de reivindicar." };
  // Quem reivindica primeiro trava o contrato enquanto está em análise
  const { data: active } = await admin
    .from("contract_claims")
    .select("user_id")
    .eq("contract_id", contract.id)
    .eq("status", "pending")
    .maybeSingle();
  if (active)
    return {
      error:
        active.user_id === profile.id
          ? "Você já reivindicou este contrato."
          : "Outra pessoa já reivindicou este contrato. Se for recusada, ele volta a ficar livre.",
    };

  const { data: match } = await admin
    .from("matches")
    .select("id, status, played_at, match_participants ( pilot_id )")
    .eq("id", input.matchId)
    .single<{ id: string; status: string; played_at: string; match_participants: { pilot_id: string }[] }>();
  if (!match || match.status === "rejected") return { error: "Partida não encontrada." };
  if (!match.match_participants.some((p) => p.pilot_id === profile.id))
    return { error: "Você precisa ter jogado essa partida." };
  const at = new Date(match.played_at);
  if (at < new Date(contract.starts_at) || at >= new Date(contract.ends_at))
    return { error: "Essa partida não foi jogada enquanto o contrato estava aberto." };

  const { error } = await admin.from("contract_claims").insert({
    contract_id: contract.id,
    match_id: match.id,
    user_id: profile.id,
    note: note || null,
    points: contract.reward,
  });
  if (error)
    return {
      error: error.code === "23505" ? "Outra pessoa acabou de reivindicar este contrato." : error.message,
    };
  revalidateContracts();
  return {};
}

/** Desiste de uma reivindicação própria ainda em análise. */
export async function withdrawClaim(claimId: string): Promise<Result> {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contract_claims")
    .delete()
    .eq("id", claimId)
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Reivindicação não encontrada ou já decidida." };
  revalidateContracts();
  return {};
}

// ---------------------------------------------------------------- Moderação

async function loadPendingClaim(admin: ReturnType<typeof createAdminClient>, claimId: string) {
  const { data } = await admin
    .from("contract_claims")
    .select(
      "id, contract_id, user_id, status, match:matches ( status ), contract:season_contracts ( season:seasons ( closed_at ) )",
    )
    .eq("id", claimId)
    .single<{
      id: string;
      contract_id: string;
      user_id: string;
      status: string;
      match: { status: string } | null;
      contract: { season: { closed_at: string | null } | null } | null;
    }>();
  return data;
}

/**
 * Voto de aprovação. Vale com o voto do root, ou com ADMIN_VOTES_NEEDED admins
 * diferentes. Ninguém aprova a própria reivindicação. Só há uma reivindicação
 * ativa por contrato (quem reivindica primeiro trava até a decisão).
 */
export async function approveClaim(claimId: string): Promise<Result & { approved?: boolean; votes?: number }> {
  const { profile } = await requireUser();
  if (!isModerator(profile.role)) return { error: "Só admins aprovam contratos." };
  const admin = createAdminClient();
  const claim = await loadPendingClaim(admin, claimId);
  if (!claim) return { error: "Reivindicação não encontrada." };
  if (claim.status !== "pending") return { error: "Essa reivindicação já foi decidida." };
  if (claim.user_id === profile.id) return { error: "Você não pode aprovar a própria reivindicação." };
  if (claim.match?.status !== "approved") return { error: "Aprove a partida antes do contrato." };
  if (claim.contract?.season?.closed_at) return { error: "A temporada deste contrato já foi encerrada." };

  const { error: voteError } = await admin
    .from("contract_votes")
    .upsert({ claim_id: claimId, voter_id: profile.id }, { onConflict: "claim_id,voter_id", ignoreDuplicates: true });
  if (voteError) return { error: voteError.message };

  // Votos que valem: de quem é admin/root agora (e nunca do próprio dono)
  const { data: votes } = await admin
    .from("contract_votes")
    .select("voter:users ( id, role )")
    .eq("claim_id", claimId)
    .returns<{ voter: { id: string; role: string } | null }[]>();
  const valid = (votes ?? []).filter((v) => v.voter && v.voter.id !== claim.user_id && v.voter.role !== "member");
  const approved = isRoot(profile.role) || valid.length >= ADMIN_VOTES_NEEDED;
  if (!approved) {
    revalidateContracts();
    return { approved: false, votes: valid.length };
  }

  const { data: updated, error } = await admin
    .from("contract_claims")
    .update({ status: "approved", decided_by: profile.id, decided_at: new Date().toISOString() })
    .eq("id", claimId)
    .eq("status", "pending")
    .select("id");
  if (error?.code === "23505") {
    await admin
      .from("contract_claims")
      .update({
        status: "rejected",
        decided_by: profile.id,
        decided_at: new Date().toISOString(),
        reject_reason: "Outra pessoa cumpriu este contrato primeiro.",
      })
      .eq("id", claimId)
      .eq("status", "pending");
    revalidateContracts();
    return { error: "Outra pessoa cumpriu este contrato primeiro." };
  }
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Essa reivindicação já foi decidida." };

  await admin
    .from("contract_claims")
    .update({
      status: "rejected",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      reject_reason: "Outra pessoa cumpriu este contrato primeiro.",
    })
    .eq("contract_id", claim.contract_id)
    .eq("status", "pending");
  revalidateContracts();
  return { approved: true, votes: valid.length };
}

export async function rejectClaim(claimId: string, reason: string): Promise<Result> {
  const { profile } = await requireUser();
  if (!isModerator(profile.role)) return { error: "Só admins recusam contratos." };
  const why = reason.trim();
  if (!why) return { error: "Diga o motivo da recusa." };
  if (why.length > REJECT_REASON_MAX) return { error: `Motivo com no máximo ${REJECT_REASON_MAX} caracteres.` };
  const admin = createAdminClient();
  const claim = await loadPendingClaim(admin, claimId);
  if (!claim) return { error: "Reivindicação não encontrada." };
  if (claim.user_id === profile.id) return { error: "Você não pode decidir a própria reivindicação." };
  const { data, error } = await admin
    .from("contract_claims")
    .update({ status: "rejected", decided_by: profile.id, decided_at: new Date().toISOString(), reject_reason: why })
    .eq("id", claimId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Essa reivindicação já foi decidida." };
  revalidateContracts();
  return {};
}
