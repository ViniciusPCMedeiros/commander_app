-- Proxies: uma carta do deck pode ser marcada como proxy. Proxy não consome
-- cópia física, então não entra na alocação da coleção (nem gera alerta
-- de carta rotacionada); aparece à parte em proxy_in_decks.
ALTER TABLE public.deck_cards ADD COLUMN is_proxy BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.user_collection_status
WITH (security_invoker = true) AS
SELECT
  uc.id,
  uc.user_id,
  u.name AS owner_name,
  uc.scryfall_id,
  uc.card_name,
  uc.mana_cost,
  uc.type_line,
  uc.image_url,
  uc.color_identity,
  uc.quantity AS owned_qty,
  uc.available_for_trade,
  uc.notes,
  COALESCE(SUM(dc.quantity) FILTER (WHERE NOT dc.is_proxy), 0)::INT AS in_decks_count,
  COALESCE(ARRAY_AGG(d.name ORDER BY d.name, d.id) FILTER (WHERE dc.id IS NOT NULL AND NOT dc.is_proxy), ARRAY[]::TEXT[]) AS used_in_decks,
  COALESCE(ARRAY_AGG(d.id ORDER BY d.name, d.id) FILTER (WHERE dc.id IS NOT NULL AND NOT dc.is_proxy), ARRAY[]::UUID[]) AS used_in_deck_ids,
  (uc.quantity - COALESCE(SUM(dc.quantity) FILTER (WHERE NOT dc.is_proxy), 0))::INT AS balance,
  CASE
    WHEN COALESCE(SUM(dc.quantity) FILTER (WHERE NOT dc.is_proxy), 0) = 0 THEN 'free'
    WHEN uc.quantity < COALESCE(SUM(dc.quantity) FILTER (WHERE NOT dc.is_proxy), 0) THEN 'shared_rotation'
    WHEN uc.quantity > COALESCE(SUM(dc.quantity) FILTER (WHERE NOT dc.is_proxy), 0) THEN 'partial_free'
    ELSE 'allocated'
  END AS usage_status,
  COALESCE(ARRAY_AGG(d.name ORDER BY d.name, d.id) FILTER (WHERE dc.is_proxy), ARRAY[]::TEXT[]) AS proxy_in_decks
FROM public.user_cards uc
JOIN public.users u ON uc.user_id = u.id
LEFT JOIN public.decks d ON d.owner_id = uc.user_id AND d.is_active = true
LEFT JOIN public.deck_cards dc
  ON dc.deck_id = d.id
 AND LOWER(split_part(dc.card_name, ' // ', 1)) = LOWER(split_part(uc.card_name, ' // ', 1))
GROUP BY uc.id, u.name;
