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
