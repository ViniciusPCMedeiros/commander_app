import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { frontFaceName, getCardImage, getCardsCollection } from "@/lib/scryfall";
import type { ProxyCard } from "@/lib/types";

const key = (name: string) => frontFaceName(name).toLowerCase();

/**
 * Proxies dos decks ativos do jogador, com imagem/tipo da Scryfall (cache de 24h)
 * e os membros que têm cópia livre marcada para troca — ou seja, as cartas
 * que o jogador precisa e onde conseguir.
 */
export async function loadProxyCards(supabase: SupabaseClient, userId: string): Promise<ProxyCard[]> {
  const { data } = await supabase.from("user_proxy_cards").select("*").eq("user_id", userId).order("card_name");
  const proxies = (data ?? []) as ProxyCard[];
  if (!proxies.length) return proxies;

  const names = proxies.map((p) => p.card_name);

  const [scryfall, { data: offers }] = await Promise.all([
    getCardsCollection(names, { next: { revalidate: 86_400 } }).catch(() => ({ found: [], notFound: names })),
    supabase
      .from("user_collection_status")
      .select("user_id, owner_name, card_name")
      .eq("available_for_trade", true)
      .gt("balance", 0)
      .neq("user_id", userId),
  ]);

  const cardByName = new Map(scryfall.found.map((c) => [key(c.name), c]));
  const offersByName = new Map<string, { user_id: string; name: string }[]>();
  for (const o of offers ?? []) {
    const k = key(o.card_name);
    offersByName.set(k, [...(offersByName.get(k) ?? []), { user_id: o.user_id, name: o.owner_name }]);
  }

  return proxies.map((p) => {
    const card = cardByName.get(key(p.card_name));
    return {
      ...p,
      image_url: card ? getCardImage(card, "normal") : null,
      type_line: card?.type_line ?? null,
      color_identity: card?.color_identity,
      trade_offers: (offersByName.get(key(p.card_name)) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
