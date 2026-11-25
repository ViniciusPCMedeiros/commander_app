const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value));
}

export function formatPct(value: number | string | null | undefined): string {
  return `${Number(value ?? 0).toFixed(1).replace(".", ",")}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Texto do comandante (com parceiro), só faces frontais. */
export function commanderLabel(commander: string, partner?: string | null): string {
  const front = (n: string) => n.split(" // ")[0];
  return partner ? `${front(commander)} + ${front(partner)}` : front(commander);
}


/** Limite de caracteres das notas da partida (também garantido no banco). */
export const MATCH_NOTES_MAX = 500;

/** Limite de caracteres das listas de cartas coladas (deck e importação) — folga para ~100 cartas. */
export const CARD_LIST_MAX = 10_000;

export const WIN_CONDITIONS = [
  "Combate",
  "Dano de Comandante",
  "Combo",
  "Veneno",
  "Stax / Travamento",
  "Drenagem",
  "Vitória alternativa",
  "Concessão da mesa",
  "Outro",
];

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** "novembro de 2026" */
export function formatMonth(value: string | Date): string {
  return monthFmt.format(new Date(value));
}

/** "há 3 dias", "hoje" — granularidade de dias. */
export function formatDaysAgo(value: string | Date): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? "há 1 mês" : `há ${months} meses`;
}

const dayOnlyFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** Para colunas DATE ("2026-11-17"): formata sem conversão de fuso (evita mostrar o dia anterior). */
export function formatDay(isoDate: string): string {
  return dayOnlyFmt.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** Remove a marcação Markdown para gerar um resumo em texto puro. */
export function markdownExcerpt(markdown: string, max = 220): string {
  const text = markdown
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
}

/** Nome exibido para jogadores invisíveis (a conta root), cujo perfil o RLS não retorna. */
export const HIDDEN_PLAYER = "Jogador oculto";
