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
