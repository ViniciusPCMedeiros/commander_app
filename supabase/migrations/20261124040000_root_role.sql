-- Papel "root": tem todos os poderes. "admin" passa a ser moderador:
--   admin/root: moderar e excluir partidas, criar membros (is_admin)
--   só root:    editar decks/listas/proxies/permissões de outros membros (is_root)
ALTER TABLE public.users DROP CONSTRAINT users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('member', 'admin', 'root'));

-- is_admin() = pode moderar (admin ou root)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'root'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_root()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'root');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Segurança: o papel vem de app_metadata (só a service role escreve), nunca de
-- user_metadata, que o próprio usuário controla no signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    CASE WHEN NEW.raw_app_meta_data->>'role' IN ('member', 'admin', 'root')
         THEN NEW.raw_app_meta_data->>'role' ELSE 'member' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Decks de outros membros: só o dono ou root
DROP POLICY "Inserir decks" ON public.decks;
CREATE POLICY "Inserir decks" ON public.decks FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_root());

DROP POLICY "Editar decks" ON public.decks;
CREATE POLICY "Editar decks" ON public.decks FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_root());

DROP POLICY "Gerenciar cartas do deck" ON public.deck_cards;
CREATE POLICY "Gerenciar cartas do deck" ON public.deck_cards FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR public.is_root())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR public.is_root())));

DROP POLICY "Dono libera deck" ON public.deck_permissions;
CREATE POLICY "Dono libera deck" ON public.deck_permissions FOR INSERT TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_id
        AND d.owner_id <> user_id
        AND (d.owner_id = auth.uid() OR public.is_root())
    )
  );

DROP POLICY "Revogar permissao" ON public.deck_permissions;
CREATE POLICY "Revogar permissao" ON public.deck_permissions FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_root()
    OR EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND d.owner_id = auth.uid())
  );

-- Partidas continuam com is_admin() (admin e root moderam, registram aprovadas e excluem).
