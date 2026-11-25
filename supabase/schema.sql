-- =====================================================================
-- MTG Commander Playgroup Tracker & Collection Manager — Schema
-- Fonte da verdade do banco. Uma cópia idêntica vive em
-- supabase/migrations/ para que `supabase db reset` a aplique.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Perfis de Usuário
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para sincronizar auth.users com public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper usado pelas policies (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Tabela de Decks
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  commander_name TEXT NOT NULL,
  commander_image_url TEXT,
  partner_name TEXT,
  partner_image_url TEXT,
  color_identity TEXT[] NOT NULL DEFAULT '{}',
  moxfield_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Cartas da Coleção Física do Usuário
CREATE TABLE public.user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scryfall_id TEXT,
  card_name TEXT NOT NULL,
  mana_cost TEXT,
  type_line TEXT,
  color_identity TEXT[] DEFAULT '{}',
  image_url TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  available_for_trade BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, card_name)
);

-- 4. Tabela de Cartas dos Decks
CREATE TABLE public.deck_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  is_commander BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(deck_id, card_name)
);

-- 5. Tabela de Partidas (Cabeçalho)
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  win_condition TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela de Participantes da Partida (com Snapshots)
CREATE TABLE public.match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  pilot_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE RESTRICT,
  deck_owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  commander_snapshot TEXT NOT NULL,
  color_identity_snapshot TEXT[] DEFAULT '{}',
  is_winner BOOLEAN NOT NULL DEFAULT false,
  seat_order INT CHECK (seat_order BETWEEN 1 AND 8),
  elimination_reason TEXT,
  UNIQUE(match_id, pilot_id),
  UNIQUE(match_id, deck_id)
);

-- 7. Tabela de Insights de IA (Perfil do Jogador)
CREATE TABLE public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('player_profile', 'monthly_recap')),
  content TEXT NOT NULL,
  games_snapshot INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela de Arquivo do Jornal Semanal
CREATE TABLE public.weekly_newspapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_number SERIAL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  headline TEXT NOT NULL,
  content TEXT NOT NULL,
  matches_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_decks_owner ON public.decks(owner_id);
CREATE INDEX idx_deck_cards_deck ON public.deck_cards(deck_id);
CREATE INDEX idx_user_cards_user ON public.user_cards(user_id);
CREATE INDEX idx_matches_status_played ON public.matches(status, played_at DESC);
CREATE INDEX idx_mp_match ON public.match_participants(match_id);
CREATE INDEX idx_mp_pilot ON public.match_participants(pilot_id);
CREATE INDEX idx_mp_deck ON public.match_participants(deck_id);

-- =====================================================================
-- VIEWS SQL E ESTATÍSTICAS
-- security_invoker = true: as views respeitam o RLS de quem consulta.
-- =====================================================================

-- View: Status de Coleção (Livres vs. Rotacionadas)
-- A comparação usa só a face frontal (split_part em ' // ') para que
-- "Esika, God of the Tree" no deck case com o nome completo da MDFC.
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
  COALESCE(SUM(dc.quantity), 0)::INT AS in_decks_count,
  COALESCE(ARRAY_AGG(d.name ORDER BY d.name, d.id) FILTER (WHERE dc.id IS NOT NULL), ARRAY[]::TEXT[]) AS used_in_decks,
  COALESCE(ARRAY_AGG(d.id ORDER BY d.name, d.id) FILTER (WHERE dc.id IS NOT NULL), ARRAY[]::UUID[]) AS used_in_deck_ids,
  (uc.quantity - COALESCE(SUM(dc.quantity), 0))::INT AS balance,
  CASE
    WHEN COALESCE(SUM(dc.quantity), 0) = 0 THEN 'free'
    WHEN uc.quantity < COALESCE(SUM(dc.quantity), 0) THEN 'shared_rotation'
    WHEN uc.quantity > COALESCE(SUM(dc.quantity), 0) THEN 'partial_free'
    ELSE 'allocated'
  END AS usage_status
FROM public.user_cards uc
JOIN public.users u ON uc.user_id = u.id
LEFT JOIN public.decks d ON d.owner_id = uc.user_id AND d.is_active = true
LEFT JOIN public.deck_cards dc
  ON dc.deck_id = d.id
 AND LOWER(split_part(dc.card_name, ' // ', 1)) = LOWER(split_part(uc.card_name, ' // ', 1))
GROUP BY uc.id, u.name;

-- Participações somente de partidas aprovadas (base das estatísticas).
CREATE OR REPLACE VIEW public.approved_participations
WITH (security_invoker = true) AS
SELECT mp.*, m.played_at, m.win_condition
FROM public.match_participants mp
JOIN public.matches m ON m.id = mp.match_id
WHERE m.status = 'approved';

-- View: Estatísticas dos Decks
CREATE OR REPLACE VIEW public.deck_stats
WITH (security_invoker = true) AS
SELECT
  d.id AS deck_id,
  d.name AS deck_name,
  d.commander_name,
  d.partner_name,
  d.commander_image_url,
  d.partner_image_url,
  d.color_identity,
  d.is_active,
  u.id AS owner_id,
  u.name AS owner_name,
  COUNT(mp.id)::INT AS total_games,
  COUNT(mp.id) FILTER (WHERE mp.is_winner)::INT AS total_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.is_winner)::numeric / NULLIF(COUNT(mp.id), 0) * 100, 0), 1) AS overall_winrate,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id)::INT AS owner_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id AND mp.is_winner)::INT AS owner_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id AND mp.is_winner)::numeric / NULLIF(COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id), 0) * 100, 0), 1) AS owner_winrate,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id)::INT AS borrowed_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id AND mp.is_winner)::INT AS borrowed_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id AND mp.is_winner)::numeric / NULLIF(COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id), 0) * 100, 0), 1) AS borrowed_winrate
FROM public.decks d
JOIN public.users u ON d.owner_id = u.id
LEFT JOIN public.approved_participations mp ON d.id = mp.deck_id
GROUP BY d.id, u.id, u.name;

-- View: Estatísticas dos Jogadores
CREATE OR REPLACE VIEW public.player_stats
WITH (security_invoker = true) AS
SELECT
  u.id AS user_id,
  u.name AS player_name,
  u.avatar_url,
  u.role,
  COUNT(mp.id)::INT AS total_games,
  COUNT(mp.id) FILTER (WHERE mp.is_winner)::INT AS total_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.is_winner)::numeric / NULLIF(COUNT(mp.id), 0) * 100, 0), 1) AS overall_winrate,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id)::INT AS own_deck_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id AND mp.is_winner)::INT AS own_deck_wins,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id)::INT AS borrowed_deck_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id AND mp.is_winner)::INT AS borrowed_deck_wins
FROM public.users u
LEFT JOIN public.approved_participations mp ON u.id = mp.pilot_id
GROUP BY u.id;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_newspapers ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro autenticado do playgroup
CREATE POLICY "Leitura autenticada users" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada decks" ON public.decks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada user_cards" ON public.user_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada deck_cards" ON public.deck_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada matches" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada match_participants" ON public.match_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada ai_insights" ON public.ai_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada weekly_newspapers" ON public.weekly_newspapers FOR SELECT TO authenticated USING (true);

-- Decks: dono (ou admin) cria e edita
CREATE POLICY "Inserir decks" ON public.decks FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());
CREATE POLICY "Editar decks" ON public.decks FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin());

-- Coleção: cada um gerencia a sua
CREATE POLICY "Gerenciar propria colecao" ON public.user_cards FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Cartas do deck: dono do deck (ou admin)
CREATE POLICY "Gerenciar cartas do deck" ON public.deck_cards FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.decks d WHERE d.id = deck_id AND (d.owner_id = auth.uid() OR public.is_admin())));

-- Partidas: membros criam como pendente; admin pode criar já aprovada
CREATE POLICY "Criar partida" ON public.matches FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (status = 'pending' OR public.is_admin()));

-- Participantes: só em partida criada por quem insere (ou admin)
CREATE POLICY "Criar participantes" ON public.match_participants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND (m.created_by = auth.uid() OR public.is_admin())
  ));

CREATE POLICY "Admins modera partidas" ON public.matches FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins deletam partidas" ON public.matches FOR DELETE TO authenticated
  USING (public.is_admin());

-- ai_insights e weekly_newspapers são gravados pelas rotas de API
-- com a service role (que ignora RLS), por isso não há policy de escrita.

-- =====================================================================
-- PERMISSÕES DE USO DE DECK (migration 20261124010000_deck_permissions.sql)
-- =====================================================================
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

-- =====================================================================
-- PROXIES NAS CARTAS DO DECK (migration 20261124020000_deck_card_proxies.sql)
-- =====================================================================
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

-- =====================================================================
-- PROXIES NA COLEÇÃO (migration 20261124030000_user_proxy_cards.sql)
-- =====================================================================
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

-- =====================================================================
-- PAPEL ROOT (migration 20261124040000_root_role.sql)
-- =====================================================================
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

-- =====================================================================
-- HISTÓRICO / MARCOS DOS JOGADORES (migration 20261124050000_player_milestones.sql)
-- =====================================================================
-- Marcos de cada jogador para o histórico do grupo: quando entrou, a
-- primeira partida e a primeira vitória (somente partidas aprovadas).
CREATE OR REPLACE VIEW public.player_milestones
WITH (security_invoker = true) AS
SELECT
  u.id AS user_id,
  u.name AS player_name,
  u.avatar_url,
  u.created_at AS joined_at,
  fm.match_id AS first_match_id,
  fm.played_at AS first_match_at,
  fm.commander_snapshot AS first_match_commander,
  fm.deck_id AS first_match_deck_id,
  (fm.pilot_id <> fm.deck_owner_id) AS first_match_borrowed,
  fm.is_winner AS first_match_won,
  fw.match_id AS first_win_id,
  fw.played_at AS first_win_at,
  fw.commander_snapshot AS first_win_commander,
  fw.deck_id AS first_win_deck_id
FROM public.users u
LEFT JOIN LATERAL (
  SELECT ap.match_id, ap.played_at, ap.commander_snapshot, ap.deck_id, ap.pilot_id, ap.deck_owner_id, ap.is_winner
  FROM public.approved_participations ap
  WHERE ap.pilot_id = u.id
  ORDER BY ap.played_at, ap.match_id
  LIMIT 1
) fm ON true
LEFT JOIN LATERAL (
  SELECT ap.match_id, ap.played_at, ap.commander_snapshot, ap.deck_id
  FROM public.approved_participations ap
  WHERE ap.pilot_id = u.id AND ap.is_winner
  ORDER BY ap.played_at, ap.match_id
  LIMIT 1
) fw ON true;

-- =====================================================================
-- METADADOS DO JORNAL (migration 20261124060000_newspaper_meta.sql)
-- =====================================================================
-- Metadados das edições do jornal: quem gerou e se veio da IA ou do gerador local.
ALTER TABLE public.weekly_newspapers
  ADD COLUMN generated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN source TEXT CHECK (source IN ('ai', 'fallback'));

-- =====================================================================
-- QUEM ELIMINOU (migration 20261124070000_elimination_killer.sql)
-- =====================================================================
-- Quem eliminou cada jogador (quando a eliminação foi causada por um oponente:
-- combate, dano de comandante, combo, veneno, mill ou drenagem do inimigo).
-- Nulo para o vencedor e para eliminações por efeito próprio ou concessão.
ALTER TABLE public.match_participants
  ADD COLUMN eliminated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT match_participants_not_self_eliminated CHECK (eliminated_by IS NULL OR eliminated_by <> pilot_id);

CREATE INDEX idx_mp_eliminated_by ON public.match_participants(eliminated_by) WHERE eliminated_by IS NOT NULL;

-- =====================================================================
-- ROOT INVISÍVEL (migration 20261124080000_hidden_root.sql)
-- =====================================================================
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

-- O root pode corrigir uma partida já registrada: data, condição de vitória,
-- notas e os participantes (jogador, deck, assento, vencedor, eliminação).
-- Tudo numa transação: ou a partida inteira é salva, ou nada muda.
-- Os snapshots (dono, comandante e cores) de um deck que continua na partida
-- são preservados; um deck novo recebe o snapshot do estado atual dele.
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

  INSERT INTO public.match_participants (
    match_id, pilot_id, deck_id, deck_owner_id, commander_snapshot, color_identity_snapshot,
    is_winner, seat_order, elimination_reason, eliminated_by)
  SELECT
    p_match_id, i.pilot_id, i.deck_id,
    COALESCE((v_old -> i.deck_id::text ->> 'owner')::uuid, d.owner_id),
    COALESCE(v_old -> i.deck_id::text ->> 'commander', d.commander_name || COALESCE(' + ' || d.partner_name, '')),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_old -> i.deck_id::text -> 'colors')), d.color_identity),
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

REVOKE EXECUTE ON FUNCTION public.root_update_match(UUID, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.root_update_match(UUID, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO authenticated;

-- Notas da partida limitadas a 500 caracteres (o formulário mostra o contador).
-- NOT VALID: vale para inserções e edições novas sem barrar notas antigas maiores.
ALTER TABLE public.matches
  ADD CONSTRAINT matches_notes_length CHECK (char_length(notes) <= 500) NOT VALID;

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

-- approved_participations foi criada com "mp.*", e o Postgres fixa as colunas na
-- criação: eliminated_by (adicionada depois) não aparecia na view. O ranking de
-- pontos precisa dela para contar os abates. Colunas novas só podem ir no fim.
CREATE OR REPLACE VIEW public.approved_participations
WITH (security_invoker = true) AS
SELECT
  mp.id, mp.match_id, mp.pilot_id, mp.deck_id, mp.deck_owner_id, mp.commander_snapshot,
  mp.color_identity_snapshot, mp.is_winner, mp.seat_order, mp.elimination_reason,
  m.played_at, m.win_condition,
  mp.eliminated_by
FROM public.match_participants mp
JOIN public.matches m ON m.id = mp.match_id
WHERE m.status = 'approved';

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

-- Edição automática do jornal: uma por semana (segunda a domingo), publicada logo
-- depois da meia-noite de domingo para segunda. O índice único garante que ela
-- só seja gerada uma vez, mesmo que o agendador rode de novo. Edições antigas
-- (geradas à mão, com períodos de 7 dias corridos) ficam como estão.
ALTER TABLE public.weekly_newspapers ADD COLUMN automatic BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX weekly_newspapers_one_per_week
  ON public.weekly_newspapers (week_start) WHERE automatic;

-- Origem de cada análise de estilo de jogo (IA ou gerador local), como já existe
-- no jornal: o root é avisado quando a rotina semanal caiu no modo local.
ALTER TABLE public.ai_insights ADD COLUMN source TEXT CHECK (source IN ('ai', 'fallback'));

-- Análises antigas: o gerador local assina o texto
UPDATE public.ai_insights
SET source = CASE WHEN content LIKE '%Análise gerada localmente%' THEN 'fallback' ELSE 'ai' END;
