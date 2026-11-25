/** Como um jogador foi eliminado. `by`: quem causa — "opponent" exige informar o oponente. */
export type EliminationKind = "opponent" | "self" | "other";

/**
 * `points` entra no ranking: para "opponent", é o que ganha quem eliminou (mais
 * difícil vale mais); para "self", é a penalidade de quem morreu por conta própria.
 * Os valores valem para todo o histórico (o ranking é recalculado a partir dele).
 */
export const ELIMINATION_REASONS: { value: string; kind: EliminationKind; points: number }[] = [
  { value: "Combate", kind: "opponent", points: 1 },
  { value: "Dano de Comandante", kind: "opponent", points: 2 },
  { value: "Combo", kind: "opponent", points: 1 },
  { value: "Veneno", kind: "opponent", points: 2 },
  { value: "Mill (grimório vazio) do inimigo", kind: "opponent", points: 1 },
  { value: "Drenagem do inimigo", kind: "opponent", points: 1 },
  { value: "Drenagem própria", kind: "self", points: -1 },
  { value: "Mill próprio", kind: "self", points: -1 },
  { value: "Concedeu", kind: "other", points: 0 },
  { value: "Outro", kind: "other", points: 0 },
];

export const ELIMINATION_GROUPS: { label: string; kind: EliminationKind }[] = [
  { label: "Causado por um oponente", kind: "opponent" },
  { label: "Efeito próprio", kind: "self" },
  { label: "Outros", kind: "other" },
];

export function eliminationKind(reason: string | null | undefined): EliminationKind | null {
  if (!reason) return null;
  return ELIMINATION_REASONS.find((r) => r.value === reason)?.kind ?? "other";
}

/** Texto curto para exibição: "Dano de Comandante · por Bruno". */
export function eliminationLabel(reason: string | null | undefined, killerName?: string | null): string | null {
  if (!reason) return null;
  return killerName ? `${reason} · por ${killerName}` : reason;
}
