-- Origem de cada análise de estilo de jogo (IA ou gerador local), como já existe
-- no jornal: o root é avisado quando a rotina semanal caiu no modo local.
ALTER TABLE public.ai_insights ADD COLUMN source TEXT CHECK (source IN ('ai', 'fallback'));

-- Análises antigas: o gerador local assina o texto
UPDATE public.ai_insights
SET source = CASE WHEN content LIKE '%Análise gerada localmente%' THEN 'fallback' ELSE 'ai' END;
