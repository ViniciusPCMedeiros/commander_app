-- O root é uma conta de sistema invisível: só ele mesmo (e outro root) o enxerga.
-- Para os demais, somem o perfil, os decks, a coleção, as permissões e as análises
-- dele. As partidas continuam valendo, mas o nome dele não é exibido.
CREATE OR REPLACE FUNCTION public.is_hidden_user(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = uid AND role = 'root');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY "Leitura autenticada users" ON public.users;
CREATE POLICY "Leitura autenticada users" ON public.users FOR SELECT TO authenticated
  USING (role <> 'root' OR id = auth.uid() OR public.is_root());

DROP POLICY "Leitura autenticada decks" ON public.decks;
CREATE POLICY "Leitura autenticada decks" ON public.decks FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(owner_id) OR owner_id = auth.uid() OR public.is_root());

DROP POLICY "Leitura autenticada user_cards" ON public.user_cards;
CREATE POLICY "Leitura autenticada user_cards" ON public.user_cards FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());

DROP POLICY "Leitura autenticada deck_permissions" ON public.deck_permissions;
CREATE POLICY "Leitura autenticada deck_permissions" ON public.deck_permissions FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());

DROP POLICY "Leitura autenticada ai_insights" ON public.ai_insights;
CREATE POLICY "Leitura autenticada ai_insights" ON public.ai_insights FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());
