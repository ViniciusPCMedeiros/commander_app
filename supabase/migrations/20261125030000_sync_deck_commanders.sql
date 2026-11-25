-- Garante que as linhas de comandante de deck_cards batem com decks.commander_name
-- e decks.partner_name: cria a que falta, remove a de quem deixou de ser
-- comandante e tira da lista comum a carta que é comandante (ex.: alguém colou o
-- comandante pelo "Editar lista" quando a linha de comandante não existia).
-- SECURITY INVOKER: o RLS de deck_cards (dono ou root) continua valendo.
CREATE OR REPLACE FUNCTION public.sync_deck_commanders(p_deck_id UUID)
RETURNS VOID AS $$
DECLARE
  v_names TEXT[];
  v_keys TEXT[];
BEGIN
  SELECT array_remove(ARRAY[commander_name, partner_name], NULL) INTO v_names
  FROM public.decks WHERE id = p_deck_id;
  IF v_names IS NULL THEN
    RAISE EXCEPTION 'Deck não encontrado.';
  END IF;
  SELECT COALESCE(array_agg(lower(split_part(n, ' // ', 1))), '{}') INTO v_keys FROM unnest(v_names) n;

  DELETE FROM public.deck_cards c
  WHERE c.deck_id = p_deck_id
    AND (lower(split_part(c.card_name, ' // ', 1)) = ANY (v_keys)) <> c.is_commander;

  INSERT INTO public.deck_cards (deck_id, card_name, quantity, is_commander, is_proxy)
  SELECT p_deck_id, n, 1, true, false
  FROM unnest(v_names) n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.deck_cards c
    WHERE c.deck_id = p_deck_id AND c.is_commander
      AND lower(split_part(c.card_name, ' // ', 1)) = lower(split_part(n, ' // ', 1))
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.sync_deck_commanders(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_deck_commanders(UUID) TO authenticated;

-- Conserta os decks criados com lista colada antes da correção (a gravação das
-- cartas falhava e o deck ficava sem a linha de comandante).
SELECT public.sync_deck_commanders(id) FROM public.decks;
