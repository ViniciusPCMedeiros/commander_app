import { Aperture, BookOpen, createLucideIcon, Eye, Feather, type LucideIcon } from "lucide-react";

/**
 * Ícone próprio do Planinauta (mesmo traço do lucide), simplificado do desenho do
 * grupo: anel meio cheio, meio tracejado (a transição entre planos) e a centelha
 * no centro, com as hastes laterais.
 */
const PlaneswalkerSpark = createLucideIcon("planeswalker-spark", [
  ["path", { d: "M2.5 12a9.5 9.5 0 0 1 19 0", key: "plano" }],
  ["path", { d: "M21.5 12a9.5 9.5 0 0 1-19 0", strokeDasharray: "2 2.6", opacity: "0.5", key: "transicao" }],
  ["path", { d: "M12 4.5l1.3 7.5L12 19.5 10.7 12z", key: "centelha" }],
  ["path", { d: "M7.6 8.8l.9 4-.9 2.7", key: "haste-esq" }],
  ["path", { d: "M16.4 8.8l-.9 4 .9 2.7", key: "haste-dir" }],
]);

/**
 * Faixas de nível, cada uma com 3 divisões (Iniciante, Adepto e Mestre — como Bronze 1, 2, 3).
 * `steps`: XP mínimo de cada divisão. Sem dependências: usado também no navegador.
 */
export const TIERS: { steps: [number, number, number]; name: string; icon: LucideIcon; color: string }[] = [
  // Pena: quem está começando os estudos
  { steps: [0, 80, 160], name: "Neófito", icon: Feather, color: "text-stone-300" },
  // Livro aberto: o primeiro grimório de feitiços
  { steps: [250, 420, 580], name: "Conjurador", icon: BookOpen, color: "text-cyan-300" },
  // Olho arcano: enxerga o conhecimento oculto
  { steps: [750, 1080, 1420], name: "Arcano", icon: Eye, color: "text-violet-300" },
  // Abertura: lente de artefato, poder concentrado
  { steps: [1750, 2330, 2920], name: "Arquimago", icon: Aperture, color: "text-amber-300" },
  // Centelha atravessando a fenda entre os planos
  { steps: [3500, 4750, 6000], name: "Planinauta", icon: PlaneswalkerSpark, color: "text-orange-400" },
];

export const DIVISIONS = ["Iniciante", "Adepto", "Mestre"] as const;

export const tierLabel = (index: number, division: number) => `${TIERS[index].name} ${DIVISIONS[division]}`;

export interface Tier {
  /** Faixa (0 = Neófito). */
  index: number;
  /** Divisão dentro da faixa (0 = Iniciante, 2 = Mestre). */
  division: number;
  name: string;
  /** "Arcano Adepto". */
  label: string;
  icon: LucideIcon;
  color: string;
  /** XP mínimo da divisão atual. */
  min: number;
  /** XP e nome da próxima divisão (null no topo: Planinauta Mestre). */
  next: number | null;
  nextLabel: string | null;
  /** 0–100: caminho até a próxima divisão. */
  progress: number;
}

const LADDER = TIERS.flatMap((t, index) => t.steps.map((min, division) => ({ index, division, min })));

export function tierOf(xp: number): Tier {
  const pos = LADDER.findLastIndex((s) => xp >= s.min);
  const { index, division, min } = LADDER[pos];
  const step = LADDER[pos + 1];
  const t = TIERS[index];
  return {
    index,
    division,
    name: t.name,
    label: tierLabel(index, division),
    icon: t.icon,
    color: t.color,
    min,
    next: step?.min ?? null,
    nextLabel: step ? tierLabel(step.index, step.division) : null,
    progress: step ? Math.floor(((xp - min) / (step.min - min)) * 100) : 100,
  };
}
