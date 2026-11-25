-- Edição automática do jornal: uma por semana (segunda a domingo), publicada logo
-- depois da meia-noite de domingo para segunda. O índice único garante que ela
-- só seja gerada uma vez, mesmo que o agendador rode de novo. Edições antigas
-- (geradas à mão, com períodos de 7 dias corridos) ficam como estão.
ALTER TABLE public.weekly_newspapers ADD COLUMN automatic BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX weekly_newspapers_one_per_week
  ON public.weekly_newspapers (week_start) WHERE automatic;
