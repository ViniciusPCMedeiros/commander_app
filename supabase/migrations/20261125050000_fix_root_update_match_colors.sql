-- Correção de root_update_match: ao trocar o deck de um participante, as cores
-- vinham vazias. ARRAY(SELECT ...) sobre um deck que não estava na partida
-- devolve '{}' (e não NULL), então o COALESCE nunca caía nas cores do deck novo.
CREATE OR REPLACE FUNCTION public.root_update_match(
  p_match_id UUID,
  p_played_at TIMESTAMPTZ,
  p_win_condition TEXT,
  p_notes TEXT,
  p_participants JSONB
) RETURNS VOID AS $$
DECLARE
  v_old JSONB;
  v_inserted INT;
BEGIN
  IF NOT public.is_root() THEN
    RAISE EXCEPTION 'Apenas o root edita partidas.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.matches
  SET played_at = p_played_at,
      win_condition = NULLIF(btrim(p_win_condition), ''),
      notes = NULLIF(btrim(p_notes), '')
  WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida não encontrada.';
  END IF;

  SELECT COALESCE(jsonb_object_agg(deck_id, jsonb_build_object(
           'owner', deck_owner_id, 'commander', commander_snapshot, 'colors', to_jsonb(color_identity_snapshot))), '{}')
  INTO v_old
  FROM public.match_participants WHERE match_id = p_match_id;

  DELETE FROM public.match_participants WHERE match_id = p_match_id;

  -- Deck que continua na partida: mantém o snapshot; deck novo: estado atual do deck
  INSERT INTO public.match_participants (
    match_id, pilot_id, deck_id, deck_owner_id, commander_snapshot, color_identity_snapshot,
    is_winner, seat_order, elimination_reason, eliminated_by)
  SELECT
    p_match_id, i.pilot_id, i.deck_id,
    CASE WHEN v_old ? i.deck_id::text THEN (v_old -> i.deck_id::text ->> 'owner')::uuid ELSE d.owner_id END,
    CASE WHEN v_old ? i.deck_id::text THEN v_old -> i.deck_id::text ->> 'commander'
         ELSE d.commander_name || COALESCE(' + ' || d.partner_name, '') END,
    CASE WHEN v_old ? i.deck_id::text
         THEN ARRAY(SELECT jsonb_array_elements_text(v_old -> i.deck_id::text -> 'colors'))
         ELSE d.color_identity END,
    i.is_winner, i.seat_order, NULLIF(i.elimination_reason, ''), i.eliminated_by
  FROM jsonb_to_recordset(p_participants) AS i(
    pilot_id UUID, deck_id UUID, seat_order INT, is_winner BOOLEAN, elimination_reason TEXT, eliminated_by UUID)
  JOIN public.decks d ON d.id = i.deck_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> jsonb_array_length(p_participants) THEN
    RAISE EXCEPTION 'Deck não encontrado.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Conserta participações gravadas pela versão com defeito: snapshot sem cores
-- num deck colorido, com o comandante igual ao do deck (snapshot tirado dele).
UPDATE public.match_participants mp
SET color_identity_snapshot = d.color_identity
FROM public.decks d
WHERE d.id = mp.deck_id
  AND cardinality(mp.color_identity_snapshot) = 0
  AND cardinality(d.color_identity) > 0
  AND mp.commander_snapshot = d.commander_name || COALESCE(' + ' || d.partner_name, '');
