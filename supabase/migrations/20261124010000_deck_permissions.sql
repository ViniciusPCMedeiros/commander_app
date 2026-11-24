-- Permissão de uso de deck: o dono libera o deck para outros membros
-- jogarem com ele. Vários membros podem ter permissão ao mesmo tempo.
CREATE TABLE public.deck_permissions (
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);

CREATE INDEX idx_deck_permissions_user ON public.deck_permissions(user_id);

ALTER TABLE public.deck_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura autenticada deck_permissions" ON public.deck_permissions FOR SELECT TO authenticated USING (true);

-- Só o dono do deck (ou admin) libera, e nunca para o próprio dono
CREATE POLICY "Dono libera deck" ON public.deck_permissions FOR INSERT TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_id
        AND d.owner_id <> user_id
        AND (d.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- Dono ou admin revogam; o próprio membro pode abrir mão da permissão
CREATE POLICY "Revogar permissao" ON public.deck_permissions FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.owner_id = auth.uid())
  );
