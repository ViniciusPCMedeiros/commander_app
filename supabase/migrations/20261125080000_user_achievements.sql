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
