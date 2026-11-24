-- Metadados das edições do jornal: quem gerou e se veio da IA ou do gerador local.
ALTER TABLE public.weekly_newspapers
  ADD COLUMN generated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN source TEXT CHECK (source IN ('ai', 'fallback'));
