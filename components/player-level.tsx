"use client";

import { createContext, useContext } from "react";
import { LevelBadge } from "@/components/level-badge";

/** Faixa e divisão de cada pessoa ([faixa, divisão]), carregadas uma vez no layout. */
export type LevelMap = Record<string, [tier: number, division: number]>;

const LevelsContext = createContext<LevelMap>({});

export function LevelsProvider({ levels, children }: { levels: LevelMap; children: React.ReactNode }) {
  return <LevelsContext.Provider value={levels}>{children}</LevelsContext.Provider>;
}

/** Símbolo do nível ao lado do nome (o nome completo aparece ao passar o mouse). */
export function PlayerLevel({ id, className }: { id: string | null | undefined; className?: string }) {
  const level = useContext(LevelsContext)[id ?? ""];
  if (!level) return null;
  return <LevelBadge index={level[0]} division={level[1]} compact className={className} />;
}
