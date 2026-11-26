/**
 * Contratos semanais: desafios que o app não vê sozinho. O root mantém o
 * catálogo; toda segunda a rotina sorteia contratos novos (os da semana anterior
 * que ninguém cumpriu expiram), enquanto há temporada. Quem
 * cumprir reivindica numa partida; vale com o "aprovo" de 2 admins diferentes ou
 * de 1 root, e só o primeiro aprovado leva os pontos (só na temporada).
 */

export type ContractRarity = "common" | "rare" | "mythic";

export const CONTRACT_RARITIES: ContractRarity[] = ["common", "rare", "mythic"];

export const CONTRACT_RARITY_LABEL: Record<ContractRarity, string> = {
  common: "Comum",
  rare: "Raro",
  mythic: "Mítico",
};

/** Prêmio por raridade. Cada contrato vale só na semana em que saiu. */
export const CONTRACT_REWARD: Record<ContractRarity, number> = { common: 1, rare: 2, mythic: 3 };

/** Contratos novos sorteados por semana. */
export const WEEKLY_CONTRACTS = 3;

/** Votos de admins para aprovar (o root aprova sozinho). */
export const ADMIN_VOTES_NEEDED = 2;

export const CONTRACT_TITLE_MAX = 80;
export const CONTRACT_DESCRIPTION_MAX = 300;
export const CLAIM_NOTE_MAX = 300;
export const REJECT_REASON_MAX = 200;

export interface ContractTemplate {
  id: string;
  title: string;
  description: string | null;
  rarity: ContractRarity;
  active: boolean;
}

export interface SeasonContract {
  id: string;
  season_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  rarity: ContractRarity;
  reward: number;
  starts_at: string;
  ends_at: string;
}

export type ClaimStatus = "pending" | "approved" | "rejected";

export interface ContractClaim {
  id: string;
  contract_id: string;
  match_id: string;
  user_id: string;
  note: string | null;
  points: number;
  status: ClaimStatus;
  decided_by: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

export type ContractStatus = "open" | "claimed" | "expired";

/**
 * Situação do contrato: com dono (há reivindicação aprovada), aberto (ainda no
 * prazo) ou expirado (prazo vencido sem dono).
 */
export function contractStatus(
  c: Pick<SeasonContract, "ends_at">,
  winner: unknown,
  now = new Date(),
): ContractStatus {
  if (winner) return "claimed";
  return now < new Date(c.ends_at) ? "open" : "expired";
}
