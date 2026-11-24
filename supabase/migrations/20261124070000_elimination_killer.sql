-- Quem eliminou cada jogador (quando a eliminação foi causada por um oponente:
-- combate, dano de comandante, combo, veneno, mill ou drenagem do inimigo).
-- Nulo para o vencedor e para eliminações por efeito próprio ou concessão.
ALTER TABLE public.match_participants
  ADD COLUMN eliminated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT match_participants_not_self_eliminated CHECK (eliminated_by IS NULL OR eliminated_by <> pilot_id);

CREATE INDEX idx_mp_eliminated_by ON public.match_participants(eliminated_by) WHERE eliminated_by IS NOT NULL;
