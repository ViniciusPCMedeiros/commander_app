-- Notas da partida limitadas a 500 caracteres (o formulário mostra o contador).
-- NOT VALID: vale para inserções e edições novas sem barrar notas antigas maiores.
ALTER TABLE public.matches
  ADD CONSTRAINT matches_notes_length CHECK (char_length(notes) <= 500) NOT VALID;
