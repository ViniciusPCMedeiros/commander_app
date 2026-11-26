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

-- CONQUISTAS GRAVADAS (migration 20261125080000_user_achievements.sql)
-- Conquistas gravadas: uma vez liberada, a conquista fica (apagar cartas ou
-- colocar proxy não tira). Só o servidor grava (service role, sem política de
-- escrita). Conquista de partida é removida se a partida for rejeitada (o
-- servidor apaga) ou excluída (ON DELETE CASCADE).
CREATE TABLE public.user_achievements (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_match ON public.user_achievements(match_id) WHERE match_id IS NOT NULL;

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura autenticada user_achievements" ON public.user_achievements FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());

-- Progresso das conquistas de contagem (barra "3/5" no perfil), recalculado pelo servidor.
CREATE TABLE public.achievement_progress (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  progress JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.achievement_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura autenticada achievement_progress" ON public.achievement_progress FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());

-- TEMPORADAS (migration 20261126000000_seasons.sql)
-- Temporadas: o root lança cada temporada com um tema e datas. As conquistas da
-- temporada (base + temáticas) ficam congeladas no lançamento (seasons.achievements),
-- então mudar um tema ou a lista base depois não mexe numa temporada já lançada.

-- Temas (podem ser reaproveitados em temporadas futuras)
CREATE TABLE public.season_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description TEXT CHECK (char_length(description) <= 500),
  -- Cor do tema (chave da paleta em lib/seasons.ts)
  color TEXT NOT NULL DEFAULT 'amber',
  -- Arte de fundo: arquivo em public/banners (opcional) e crédito do artista
  banner TEXT,
  banner_credit TEXT,
  -- Títulos: completar todas as conquistas (Lenda) e terminar em 1º (Coroa)
  title_lenda TEXT NOT NULL CHECK (char_length(title_lenda) BETWEEN 1 AND 40),
  title_coroa TEXT NOT NULL CHECK (char_length(title_coroa) BETWEEN 1 AND 40),
  -- Conquistas temáticas: [{ key, name, icon, rarity, template, params }]
  achievements JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conquistas base criadas pelo root (somam-se às base do código, a partir da próxima temporada)
CREATE TABLE public.season_base_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition JSONB NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL UNIQUE CHECK (number >= 1),
  theme_id UUID REFERENCES public.season_themes(id) ON DELETE SET NULL,
  -- Cópia do tema no lançamento (nome, cor, arte, títulos)
  theme JSONB NOT NULL,
  achievements JSONB NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seasons_dates CHECK (ends_at > starts_at)
);

-- Uma temporada por vez: períodos não podem se sobrepor
CREATE OR REPLACE FUNCTION public.seasons_no_overlap() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.seasons s
    WHERE s.id <> NEW.id AND tstzrange(s.starts_at, s.ends_at) && tstzrange(NEW.starts_at, NEW.ends_at)
  ) THEN
    RAISE EXCEPTION 'Já existe uma temporada nesse período.' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seasons_no_overlap BEFORE INSERT OR UPDATE OF starts_at, ends_at ON public.seasons
  FOR EACH ROW EXECUTE FUNCTION public.seasons_no_overlap();

-- Conquistas de temporada liberadas (gravadas pelo servidor, como user_achievements)
CREATE TABLE public.season_unlocks (
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id, achievement_key)
);
CREATE INDEX idx_season_unlocks_match ON public.season_unlocks(match_id) WHERE match_id IS NOT NULL;

CREATE TABLE public.season_progress (
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  progress JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

-- Título exibido ao lado do nome: { key: "<número da temporada>:lenda|coroa", label, color }.
-- Só o servidor grava, depois de conferir que o jogador tem o título.
ALTER TABLE public.users ADD COLUMN display_title JSONB;

-- Edição especial da Gazeta no encerramento da temporada
ALTER TABLE public.weekly_newspapers ADD COLUMN season_id UUID REFERENCES public.seasons(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX weekly_newspapers_one_per_season ON public.weekly_newspapers(season_id) WHERE season_id IS NOT NULL;

-- RLS: todos leem; temas, base e temporadas só o root escreve; o resto só o servidor
ALTER TABLE public.season_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_base_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura autenticada season_themes" ON public.season_themes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Root gerencia season_themes" ON public.season_themes FOR ALL TO authenticated
  USING (public.is_root()) WITH CHECK (public.is_root());

CREATE POLICY "Leitura autenticada season_base_achievements" ON public.season_base_achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Root gerencia season_base_achievements" ON public.season_base_achievements FOR ALL TO authenticated
  USING (public.is_root()) WITH CHECK (public.is_root());

CREATE POLICY "Leitura autenticada seasons" ON public.seasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "Root gerencia seasons" ON public.seasons FOR ALL TO authenticated
  USING (public.is_root()) WITH CHECK (public.is_root());

CREATE POLICY "Leitura autenticada season_unlocks" ON public.season_unlocks FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());
CREATE POLICY "Leitura autenticada season_progress" ON public.season_progress FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());

-- CONTRATOS SEMANAIS (migration 20261127000000_contracts.sql)
-- Contratos semanais: desafios de jogo que o app não consegue ver sozinho
-- ("causar 100 de dano numa partida"). O root mantém o catálogo; a rotina sorteia
-- alguns novos toda semana durante a temporada; os jogadores pegam os contratos que
-- querem tentar e, quem achar que cumpriu, reivindica numa partida; a
-- reivindicação vale com o "aprovo" de 2 admins diferentes ou de 1 root. Só o
-- primeiro aprovado leva os pontos (na classificação da temporada).

CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  description TEXT CHECK (char_length(description) <= 300),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'mythic')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contrato em jogo numa temporada (cópia do modelo no sorteio). Vale só na semana
-- em que saiu: toda segunda a rotina sorteia contratos novos, e os sem dono expiram.
CREATE TABLE public.season_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'mythic')),
  reward INT NOT NULL CHECK (reward BETWEEN 1 AND 10),
  -- Partidas jogadas nesse intervalo (a semana) valem para o contrato
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT season_contracts_dates CHECK (ends_at > starts_at)
);
CREATE INDEX idx_season_contracts_season ON public.season_contracts(season_id, starts_at);

-- Um sorteio por semana de cada temporada (trava contra duas rotinas ao mesmo tempo)
CREATE TABLE public.contract_draws (
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, week_start)
);

-- Quem pegou o contrato da semana (vários podem pegar o mesmo; só quem pegou reivindica)
CREATE TABLE public.contract_takers (
  contract_id UUID NOT NULL REFERENCES public.season_contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, user_id)
);

CREATE TABLE public.contract_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.season_contracts(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note TEXT CHECK (char_length(note) <= 300),
  -- Prêmio do contrato no momento da reivindicação
  points INT NOT NULL CHECK (points BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  reject_reason TEXT CHECK (char_length(reject_reason) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uma reivindicação ativa por contrato: quem reivindica primeiro trava o contrato
-- enquanto está em análise; se for recusada (ou retirada), os outros podem reivindicar
CREATE UNIQUE INDEX contract_claims_one_active ON public.contract_claims(contract_id) WHERE status <> 'rejected';
CREATE INDEX idx_contract_claims_match ON public.contract_claims(match_id);
CREATE INDEX idx_contract_claims_pending ON public.contract_claims(status) WHERE status = 'pending';

CREATE TABLE public.contract_votes (
  claim_id UUID NOT NULL REFERENCES public.contract_claims(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, voter_id)
);

-- RLS: todos leem; quem escreve é o servidor (as ações conferem papel, autoaprovação e prazos)
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_takers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura autenticada contract_templates" ON public.contract_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada season_contracts" ON public.season_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada contract_takers" ON public.contract_takers FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());
CREATE POLICY "Leitura autenticada contract_claims" ON public.contract_claims FOR SELECT TO authenticated
  USING (NOT public.is_hidden_user(user_id) OR user_id = auth.uid() OR public.is_root());
CREATE POLICY "Leitura autenticada contract_votes" ON public.contract_votes FOR SELECT TO authenticated USING (true);

-- Catálogo inicial (o root edita, desativa ou cria outros no Admin)
INSERT INTO public.contract_templates (title, description, rarity) VALUES
  ('Exército', 'Controlar 10 ou mais criaturas ao mesmo tempo.', 'common'),
  ('Biblioteca aberta', 'Comprar 7 ou mais cards num único turno.', 'common'),
  ('Turno corrido', 'Lançar 4 ou mais mágicas no mesmo turno.', 'common'),
  ('Terra à vista', 'Ter 12 ou mais terrenos no campo de batalha.', 'common'),
  ('Faxina', 'Destruir ou exilar 4 ou mais permanentes com um único efeito.', 'common'),
  ('Banquete', 'Ganhar 20 ou mais de vida num único turno.', 'common'),
  ('Centenário', 'Causar 100 ou mais de dano somado numa partida.', 'rare'),
  ('Golpe de mestre', 'Causar 20 ou mais de dano a um jogador num único turno.', 'rare'),
  ('Ladrão de coroas', 'Atacar com o comandante de outro jogador.', 'rare'),
  ('Espelho', 'Copiar uma mágica de um oponente e usá-la contra ele.', 'rare'),
  ('Tesouraria', 'Controlar 10 ou mais tokens ao mesmo tempo.', 'rare'),
  ('Retorno triunfal', 'Vencer depois de ter ficado com 5 de vida ou menos.', 'rare'),
  ('Cataclismo', 'Eliminar 2 ou mais jogadores no mesmo turno.', 'mythic'),
  ('Exército infinito', 'Controlar 30 ou mais criaturas ao mesmo tempo.', 'mythic'),
  ('Tempestade', 'Lançar 10 ou mais mágicas no mesmo turno.', 'mythic'),
  ('Golpe fatal', 'Causar 40 ou mais de dano num único ataque.', 'mythic');
