-- Decks aposentados que nunca entraram em partida podem ser excluídos pelo dono
-- (ou root). Partidas pendentes também contam: o deck já está registrado nelas.
-- A FK de match_participants (ON DELETE RESTRICT) continua como última barreira.
CREATE OR REPLACE FUNCTION public.deck_has_matches(did UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.match_participants WHERE deck_id = did);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE POLICY "Excluir decks sem partidas" ON public.decks FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid() OR public.is_root())
    AND NOT is_active
    AND NOT public.deck_has_matches(id)
  );
