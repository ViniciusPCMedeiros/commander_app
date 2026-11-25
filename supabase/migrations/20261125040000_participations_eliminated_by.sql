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
