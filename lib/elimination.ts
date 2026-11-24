/** Como um jogador foi eliminado. `by`: quem causa — "opponent" exige informar o oponente. */
export type EliminationKind = "opponent" | "self" | "other";

export const ELIMINATION_REASONS: { value: string; kind: EliminationKind }[] = [
  { value: "Combate", kind: "opponent" },
  { value: "Dano de Comandante", kind: "opponent" },
  { value: "Combo", kind: "opponent" },
  { value: "Veneno", kind: "opponent" },
  { value: "Mill (grimório vazio) do inimigo", kind: "opponent" },
  { value: "Drenagem do inimigo", kind: "opponent" },
  { value: "Drenagem própria", kind: "self" },
  { value: "Mill próprio", kind: "self" },
  { value: "Concedeu", kind: "other" },
  { value: "Outro", kind: "other" },
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
