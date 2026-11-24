/**
 * Helpers da Scryfall API (REST, sem API key).
 * Docs: https://scryfall.com/docs/api — pede User-Agent/Accept e ~10 req/s.
 */

const SCRYFALL = "https://api.scryfall.com";

export type ImageSize = "small" | "normal" | "large" | "png" | "art_crop" | "border_crop";

type ImageUris = Partial<Record<ImageSize, string>>;

export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: ImageUris;
}

export interface ScryfallCard {
  id: string;
  name: string;
  layout: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  color_identity: string[];
  keywords?: string[];
  image_uris?: ImageUris;
  card_faces?: ScryfallCardFace[];
}

/**
 * Mecânicas de comandante duplo. Desde 2025 a Wizards unificou variantes como
 * "Partner—Friends forever", "Partner—Survivors" e "Partner—Father & son":
 * cada variante só combina com a mesma variante.
 */
export type PartnerKind =
  | "partner"
  | "partner_with"
  | "partner_variant"
  | "choose_background"
  | "background"
  | "doctors_companion"
  | "doctor";

export interface PartnerInfo {
  kind: PartnerKind;
  /** Nome da variante ("Friends forever") ou do parceiro em "Partner with X". */
  detail?: string;
}

const WUBRG = ["W", "U", "B", "R", "G"];

// No browser não é permitido setar User-Agent; o fetch envia o do navegador.
const serverHeaders: HeadersInit =
  typeof window === "undefined"
    ? { "User-Agent": "CommanderPlaygroupTracker/1.0", Accept: "application/json" }
    : { Accept: "application/json" };

/**
 * Imagem com fallback: raiz `image_uris` (cartas normais) →
 * `card_faces[0].image_uris` (MDFCs / Transform como Esika e Tergrid).
 */
export function getCardImage(card: ScryfallCard, size: ImageSize = "art_crop", face = 0): string | null {
  return (
    card.image_uris?.[size] ??
    card.card_faces?.[face]?.image_uris?.[size] ??
    card.card_faces?.[0]?.image_uris?.[size] ??
    null
  );
}

/** Mana cost com fallback para a face frontal. */
export function getManaCost(card: ScryfallCard): string | null {
  return card.mana_cost || card.card_faces?.[0]?.mana_cost || null;
}

/** Texto de regras unindo todas as faces. */
export function getOracleText(card: ScryfallCard): string {
  if (card.oracle_text) return card.oracle_text;
  return (card.card_faces ?? []).map((f) => f.oracle_text ?? "").join("\n");
}

/** Nome da face frontal ("Esika, God of the Tree // The Prismatic Bridge" → "Esika, God of the Tree"). */
export function frontFaceName(name: string): string {
  return name.split(" // ")[0].trim();
}

/** União ordenada (WUBRG) das identidades de cor do comandante e do parceiro. */
export function mergeColorIdentity(...identities: (string[] | null | undefined)[]): string[] {
  const set = new Set(identities.flatMap((i) => i ?? []));
  return WUBRG.filter((c) => set.has(c));
}

/** Detecta a mecânica de comandante duplo (Partner e variantes, Partner with, Background, Doctor's Companion). */
export function getPartnerInfo(card: ScryfallCard): PartnerInfo | null {
  const lines = getOracleText(card).split("\n").map((l) => l.trim());
  const type = (card.type_line ?? "").toLowerCase();

  if (type.includes("background")) return { kind: "background" };
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("choose a background")) return { kind: "choose_background" };
    if (lower.startsWith("doctor's companion")) return { kind: "doctors_companion" };
    const withMatch = line.match(/^Partner with ([^(]+?)\s*(\(|$)/i);
    if (withMatch) return { kind: "partner_with", detail: withMatch[1].trim() };
    const variant = line.match(/^Partner\s*[—–-]\s*([^(]+?)\s*(\(|$)/i);
    if (variant) return { kind: "partner_variant", detail: variant[1].trim() };
    // Texto antigo, antes da unificação ("Friends forever (...)")
    if (/^friends forever\b/i.test(line)) return { kind: "partner_variant", detail: "Friends forever" };
    if (/^partner\s*(\(|$)/i.test(line)) return { kind: "partner" };
  }
  if (type.includes("time lord doctor")) return { kind: "doctor" };
  return null;
}

/** Verifica se duas cartas podem ser comandantes juntas. */
export function canPair(a: ScryfallCard, b: ScryfallCard): boolean {
  const pa = getPartnerInfo(a);
  const pb = getPartnerInfo(b);
  if (!pa || !pb || frontFaceName(a.name) === frontFaceName(b.name)) return false;

  const kinds = [pa.kind, pb.kind].sort().join("+");
  if (kinds === "partner+partner") return true;
  if (kinds === "background+choose_background") return true;
  if (kinds === "doctor+doctors_companion") return true;
  if (kinds === "partner_variant+partner_variant") {
    return pa.detail!.toLowerCase() === pb.detail!.toLowerCase();
  }
  if (kinds === "partner_with+partner_with") {
    const norm = (n: string) => frontFaceName(n).toLowerCase();
    return norm(pa.detail!) === norm(b.name) && norm(pb.detail!) === norm(a.name);
  }
  return false;
}

const PARTNER_LABEL: Record<PartnerKind, string> = {
  partner: "Partner",
  partner_with: "Partner with",
  partner_variant: "Partner",
  choose_background: "Choose a Background",
  background: "Background",
  doctors_companion: "Doctor's Companion",
  doctor: "Time Lord Doctor",
};

export function partnerLabel(info: PartnerInfo | null): string {
  if (!info) return "sem parceria";
  if (info.kind === "partner_variant") return `Partner—${info.detail}`;
  if (info.kind === "partner_with") return `Partner with ${info.detail}`;
  return PARTNER_LABEL[info.kind];
}

export function partnerHint(info: PartnerInfo): string {
  switch (info.kind) {
    case "partner":
      return "Busque outro comandante com Partner";
    case "partner_with":
      return `Busque ${info.detail}`;
    case "partner_variant":
      return `Busque outro comandante com Partner—${info.detail}`;
    case "choose_background":
      return "Busque um encantamento Background";
    case "background":
      return "Busque uma criatura com Choose a Background";
    case "doctors_companion":
      return "Busque um Time Lord Doctor";
    case "doctor":
      return "Busque um Doctor's Companion";
  }
}

/** Autocomplete de nomes (até 20 sugestões). */
export async function autocompleteCards(query: string, signal?: AbortSignal): Promise<string[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(`${SCRYFALL}/cards/autocomplete?q=${encodeURIComponent(query)}`, {
    headers: serverHeaders,
    signal,
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: string[] };
  return json.data ?? [];
}

/** Detalhe de carta por nome: exato primeiro, fuzzy como fallback. */
export async function getCardByName(name: string): Promise<ScryfallCard | null> {
  for (const mode of ["exact", "fuzzy"] as const) {
    const res = await fetch(`${SCRYFALL}/cards/named?${mode}=${encodeURIComponent(name)}`, {
      headers: serverHeaders,
    });
    if (res.ok) return (await res.json()) as ScryfallCard;
  }
  return null;
}

/** Busca em lote via POST /cards/collection (máx. 75 identificadores por request). */
export async function getCardsCollection(
  names: string[],
  init?: RequestInit,
): Promise<{ found: ScryfallCard[]; notFound: string[] }> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const found: ScryfallCard[] = [];
  const notFound: string[] = [];

  for (let i = 0; i < unique.length; i += 75) {
    const chunk = unique.slice(i, i + 75);
    const res = await fetch(`${SCRYFALL}/cards/collection`, {
      ...init,
      method: "POST",
      headers: { ...serverHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name: frontFaceName(name) })) }),
    });
    if (!res.ok) {
      notFound.push(...chunk);
      continue;
    }
    const json = (await res.json()) as {
      data: ScryfallCard[];
      not_found?: { name?: string }[];
    };
    found.push(...json.data);
    notFound.push(...(json.not_found ?? []).map((n) => n.name ?? "?"));
    if (i + 75 < unique.length) await new Promise((r) => setTimeout(r, 100));
  }

  return { found, notFound };
}

/** Marcador de proxy no fim da linha: "1 Sol Ring [proxy]". */
export const PROXY_MARKER = "[proxy]";

/**
 * Faz o parse de uma lista no formato texto ("1 Sol Ring", "2x Cultivate",
 * "Sol Ring", "1 Sol Ring (CMM) 400", "1 Sol Ring [proxy]"). Ignora cabeçalhos e comentários.
 */
export function parseDecklist(text: string): { name: string; quantity: number; isProxy: boolean }[] {
  const map = new Map<string, { name: string; quantity: number; isProxy: boolean }>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    const isProxy = /\s*\[proxy\]\s*$/i.test(line);
    line = line.replace(/\s*\[proxy\]\s*$/i, "");
    if (!line || line.startsWith("//") || line.startsWith("#") || /^[A-Za-zÀ-ú ]+:$/.test(line)) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const quantity = m ? Math.max(1, parseInt(m[1], 10)) : 1;
    const name = (m ? m[2] : line)
      .replace(/\s+\([A-Z0-9]{2,6}\)(\s+\S+)?$/, "") // remove "(SET) 123"
      .replace(/\s+\*F\*$/i, "")
      .trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const prev = map.get(key);
    map.set(key, { name, quantity: (prev?.quantity ?? 0) + quantity, isProxy: isProxy || Boolean(prev?.isProxy) });
  }
  return [...map.values()];
}
