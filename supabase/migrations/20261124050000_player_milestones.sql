-- Marcos de cada jogador para o histórico do grupo: quando entrou, a
-- primeira partida e a primeira vitória (somente partidas aprovadas).
CREATE OR REPLACE VIEW public.player_milestones
WITH (security_invoker = true) AS
SELECT
  u.id AS user_id,
  u.name AS player_name,
  u.avatar_url,
  u.created_at AS joined_at,
  fm.match_id AS first_match_id,
  fm.played_at AS first_match_at,
  fm.commander_snapshot AS first_match_commander,
  fm.deck_id AS first_match_deck_id,
  (fm.pilot_id <> fm.deck_owner_id) AS first_match_borrowed,
  fm.is_winner AS first_match_won,
  fw.match_id AS first_win_id,
  fw.played_at AS first_win_at,
  fw.commander_snapshot AS first_win_commander,
  fw.deck_id AS first_win_deck_id
FROM public.users u
LEFT JOIN LATERAL (
  SELECT ap.match_id, ap.played_at, ap.commander_snapshot, ap.deck_id, ap.pilot_id, ap.deck_owner_id, ap.is_winner
  FROM public.approved_participations ap
  WHERE ap.pilot_id = u.id
  ORDER BY ap.played_at, ap.match_id
  LIMIT 1
) fm ON true
LEFT JOIN LATERAL (
  SELECT ap.match_id, ap.played_at, ap.commander_snapshot, ap.deck_id
  FROM public.approved_participations ap
  WHERE ap.pilot_id = u.id AND ap.is_winner
  ORDER BY ap.played_at, ap.match_id
  LIMIT 1
) fw ON true;
