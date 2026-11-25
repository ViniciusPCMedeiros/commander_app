import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Banners panorâmicos do topo de cada página (arquivos locais em /public/banners).
 * O crédito do artista é exigido pela Fan Content Policy da Wizards — mantenha-o
 * igual à arte do arquivo colocado na pasta.
 */
export const BANNERS = {
  painel: { file: "painel.jpg", credit: "Leyline of the Guildpact — Daarken" },
  partidas: { file: "partidas.jpg", credit: "Face Yourself — Ekaterina Burmak" },
  ranking: { file: "ranking.jpg", credit: "The Aetherspark — Donato Giancola" },
  decks: { file: "decks.jpg", credit: "Arte de Mark Zug" }, // carta a confirmar
  jornais: { file: "jornais.jpg", credit: "Silverquill Charm — Ksenia Kim" },
  colecao: { file: "colecao.jpg", credit: "Reliquary Tower — Jesper Ejsing" },
  historico: { file: "historico.jpg", credit: "Great Hall of the Biblioplex — Constantin Marin" },
  admin: { file: "admin.jpg", credit: "" }, // carta e artista a confirmar
  // Arte vertical: enquadra o rosto do Ragavan (~26% da altura) em vez do centro
  novidades: { file: "novidades.jpg", credit: "Ragavan, Nimble Pilferer — Zoltan Boros", position: "50% 22%" },
} as const satisfies Record<string, { file: string; credit: string; position?: string }>;

export type BannerName = keyof typeof BANNERS;

/**
 * Caminho público do banner, ou null se o arquivo ainda não estiver em public/banners
 * (nesse caso a página mostra só o gradiente dourado — nunca a arte pixelada da Scryfall).
 */
export function resolveBanner(
  name: BannerName | undefined,
): { src: string; credit: string; position: string } | null {
  if (!name) return null;
  const banner: { file: string; credit: string; position?: string } = BANNERS[name];
  const { file, credit } = banner;
  const full = path.join(process.cwd(), "public", "banners", file);
  if (!fs.existsSync(full)) return null;
  // Versão pela data de modificação: trocar o arquivo mantendo o nome muda a URL,
  // e o navegador não fica preso à imagem antiga em cache.
  const version = Math.floor(fs.statSync(full).mtimeMs);
  return { src: `/banners/${file}?v=${version}`, credit, position: banner.position ?? "center" };
}
