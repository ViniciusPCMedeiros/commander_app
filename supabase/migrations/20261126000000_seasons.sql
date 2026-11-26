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
