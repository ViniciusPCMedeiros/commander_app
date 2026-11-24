-- Proxies da coleção: cartas marcadas como proxy nos decks ativos de cada
-- membro, agrupadas pelo nome da face frontal. Derivado de deck_cards (não
-- é cópia física). Serve para saber quais cartas o jogador precisa:
--   free_originals = cópias físicas que não estão em nenhum deck ativo
--   needed_qty     = quantas cópias faltam para trocar todos os proxies
CREATE OR REPLACE VIEW public.user_proxy_cards
WITH (security_invoker = true) AS
WITH proxies AS (
  SELECT
    d.owner_id AS user_id,
    LOWER(split_part(dc.card_name, ' // ', 1)) AS name_key,
    MIN(dc.card_name) AS card_name,
    SUM(dc.quantity)::INT AS proxy_qty,
    ARRAY_AGG(d.name ORDER BY d.name, d.id) AS proxy_in_decks,
    ARRAY_AGG(d.id ORDER BY d.name, d.id) AS proxy_in_deck_ids
  FROM public.deck_cards dc
  JOIN public.decks d ON d.id = dc.deck_id AND d.is_active = true
  WHERE dc.is_proxy
  GROUP BY d.owner_id, LOWER(split_part(dc.card_name, ' // ', 1))
)
SELECT
  p.user_id,
  p.card_name,
  p.proxy_qty,
  p.proxy_in_decks,
  p.proxy_in_deck_ids,
  COALESCE(cs.owned_qty, 0)::INT AS owned_originals,
  GREATEST(COALESCE(cs.balance, 0), 0)::INT AS free_originals,
  GREATEST(p.proxy_qty - GREATEST(COALESCE(cs.balance, 0), 0), 0)::INT AS needed_qty
FROM proxies p
LEFT JOIN public.user_collection_status cs
  ON cs.user_id = p.user_id
 AND LOWER(split_part(cs.card_name, ' // ', 1)) = p.name_key;
