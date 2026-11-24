-- =====================================================================
-- Seed de DEMONSTRAÇÃO (só para testes locais: ./start.sh reset --demo)
--   Root:    admin@commander.local / Admin@123   (todos os poderes)
--   Admin:   bruno@commander.local / Membro@123  (moderador)
--   Membros: ana@commander.local, carla@commander.local (senha: Membro@123)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Usuários (auth.users + auth.identities). O trigger
--    on_auth_user_created cria os perfis em public.users, com o papel
--    lido de raw_app_meta_data (que o usuário não consegue alterar).
-- ---------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
  jsonb_build_object('name', u.name),
  now(), now(), '', '', '', '', '', '', '', ''
FROM (VALUES
  ('00000000-0000-4000-a000-000000000001'::uuid, 'admin@commander.local', 'Admin@123',  'Admin do Mesão', 'root'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'ana@commander.local',   'Membro@123', 'Ana',            'member'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'bruno@commander.local', 'Membro@123', 'Bruno',          'admin'),
  ('00000000-0000-4000-a000-000000000004'::uuid, 'carla@commander.local', 'Membro@123', 'Carla',          'member')
) AS u(id, email, password, name, role);

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@commander.local';

-- ---------------------------------------------------------------------
-- 2. Decks (inclui MDFCs e comandantes duplos)
-- ---------------------------------------------------------------------
INSERT INTO public.decks (id, owner_id, name, commander_name, commander_image_url, partner_name, partner_image_url, color_identity, moxfield_url, created_at) VALUES
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'Atraxa Superfriends',
   'Atraxa, Praetors'' Voice', 'https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136',
   NULL, NULL, ARRAY['W','U','B','G'], NULL, now() - interval '60 days'),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'Wilhelt Zumbis',
   'Wilhelt, the Rotcleaver', 'https://cards.scryfall.io/art_crop/front/2/5/2501a911-d072-436d-ae3b-a5164e3b30aa.jpg?1783925384',
   NULL, NULL, ARRAY['U','B'], NULL, now() - interval '50 days'),
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002', 'Esika Lendárias',
   'Esika, God of the Tree // The Prismatic Bridge', 'https://cards.scryfall.io/art_crop/front/f/6/f6cd7465-9dd0-473c-ac5e-dd9e2f22f5f6.jpg?1783928221',
   NULL, NULL, ARRAY['W','U','B','R','G'], NULL, now() - interval '45 days'),
  ('10000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000003', 'Tymna & Thrasios cEDH',
   'Tymna the Weaver', 'https://cards.scryfall.io/art_crop/front/b/c/bc7cbe9b-324e-42b8-94e2-36e91cb32163.jpg?1783937081',
   'Thrasios, Triton Hero', 'https://cards.scryfall.io/art_crop/front/2/1/21e27b91-c7f1-4709-aa0d-8b5d81b22a0a.jpg?1783937081',
   ARRAY['W','U','B','G'], 'https://www.moxfield.com/', now() - interval '40 days'),
  ('10000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000004', 'Tergrid Stax',
   'Tergrid, God of Fright // Tergrid''s Lantern', 'https://cards.scryfall.io/art_crop/front/1/4/14dc88ee-bba9-4625-af0d-89f3762a0ead.jpg?1783928244',
   NULL, NULL, ARRAY['B'], NULL, now() - interval '35 days'),
  ('10000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000004', 'Wilson Artesão',
   'Wilson, Refined Grizzly', 'https://cards.scryfall.io/art_crop/front/d/f/dfe0daf8-43da-484b-baa1-76f8313c5a0c.jpg?1783922700',
   'Guild Artisan', 'https://cards.scryfall.io/art_crop/front/a/b/abe5cc84-db39-4f64-b877-599880a8729a.jpg?1783922737',
   ARRAY['R','G'], NULL, now() - interval '30 days');

-- ---------------------------------------------------------------------
-- 3. Cartas dos decks (algumas repetidas entre decks do mesmo dono
--    para demonstrar o status "shared_rotation")
-- ---------------------------------------------------------------------
INSERT INTO public.deck_cards (deck_id, card_name, quantity, is_commander)
SELECT d.id::uuid, c.card_name, 1, c.is_commander
FROM (VALUES
  ('10000000-0000-4000-a000-000000000001', 'Atraxa, Praetors'' Voice', true),
  ('10000000-0000-4000-a000-000000000001', 'Sol Ring', false),
  ('10000000-0000-4000-a000-000000000001', 'Arcane Signet', false),
  ('10000000-0000-4000-a000-000000000001', 'Command Tower', false),
  ('10000000-0000-4000-a000-000000000001', 'Swords to Plowshares', false),
  ('10000000-0000-4000-a000-000000000001', 'Smothering Tithe', false),
  ('10000000-0000-4000-a000-000000000001', 'Rhystic Study', false),
  ('10000000-0000-4000-a000-000000000001', 'Demonic Tutor', false),
  ('10000000-0000-4000-a000-000000000002', 'Wilhelt, the Rotcleaver', true),
  ('10000000-0000-4000-a000-000000000002', 'Sol Ring', false),
  ('10000000-0000-4000-a000-000000000002', 'Arcane Signet', false),
  ('10000000-0000-4000-a000-000000000002', 'Counterspell', false),
  ('10000000-0000-4000-a000-000000000002', 'Rhystic Study', false),
  ('10000000-0000-4000-a000-000000000002', 'Demonic Tutor', false),
  ('10000000-0000-4000-a000-000000000002', 'Lightning Greaves', false),
  ('10000000-0000-4000-a000-000000000003', 'Esika, God of the Tree // The Prismatic Bridge', true),
  ('10000000-0000-4000-a000-000000000003', 'Sol Ring', false),
  ('10000000-0000-4000-a000-000000000003', 'Cultivate', false),
  ('10000000-0000-4000-a000-000000000003', 'Command Tower', false),
  ('10000000-0000-4000-a000-000000000003', 'Arcane Signet', false),
  ('10000000-0000-4000-a000-000000000004', 'Tymna the Weaver', true),
  ('10000000-0000-4000-a000-000000000004', 'Thrasios, Triton Hero', true),
  ('10000000-0000-4000-a000-000000000004', 'Sol Ring', false),
  ('10000000-0000-4000-a000-000000000004', 'Command Tower', false),
  ('10000000-0000-4000-a000-000000000004', 'Swords to Plowshares', false),
  ('10000000-0000-4000-a000-000000000004', 'Rhystic Study', false),
  ('10000000-0000-4000-a000-000000000004', 'Demonic Tutor', false),
  ('10000000-0000-4000-a000-000000000004', 'Counterspell', false),
  ('10000000-0000-4000-a000-000000000005', 'Tergrid, God of Fright // Tergrid''s Lantern', true),
  ('10000000-0000-4000-a000-000000000005', 'Sol Ring', false),
  ('10000000-0000-4000-a000-000000000005', 'Demonic Tutor', false),
  ('10000000-0000-4000-a000-000000000005', 'Lightning Greaves', false),
  ('10000000-0000-4000-a000-000000000006', 'Wilson, Refined Grizzly', true),
  ('10000000-0000-4000-a000-000000000006', 'Guild Artisan', true),
  ('10000000-0000-4000-a000-000000000006', 'Sol Ring', false),
  ('10000000-0000-4000-a000-000000000006', 'Cultivate', false),
  ('10000000-0000-4000-a000-000000000006', 'Lightning Greaves', false),
  ('10000000-0000-4000-a000-000000000006', 'Arcane Signet', false)
) AS c(deck, card_name, is_commander)
JOIN public.decks d ON d.id = c.deck::uuid;

-- ---------------------------------------------------------------------
-- 4. Coleção física
-- ---------------------------------------------------------------------
WITH cards(card_name, scryfall_id, mana_cost, type_line, color_identity, image_url) AS (VALUES
  ('Sol Ring', 'fc817e07-c1f3-469f-9cf7-0945dea7400f', '{1}', 'Artifact', ARRAY[]::text[], 'https://cards.scryfall.io/normal/front/f/c/fc817e07-c1f3-469f-9cf7-0945dea7400f.jpg?1793021181'),
  ('Arcane Signet', '795df2ee-fbfc-4961-852c-e3ec50cc52da', '{2}', 'Artifact', ARRAY[]::text[], 'https://cards.scryfall.io/normal/front/7/9/795df2ee-fbfc-4961-852c-e3ec50cc52da.jpg?1793021117'),
  ('Command Tower', 'a73297d2-580c-4174-a427-265f6916d09f', '', 'Land', ARRAY[]::text[], 'https://cards.scryfall.io/normal/front/a/7/a73297d2-580c-4174-a427-265f6916d09f.jpg?1793021256'),
  ('Counterspell', '4f616706-ec97-4923-bb1e-11a69fbaa1f8', '{U}{U}', 'Instant', ARRAY['U'], 'https://cards.scryfall.io/normal/front/4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8.jpg?1783909630'),
  ('Swords to Plowshares', '4645eebf-c9fc-4ee7-b646-61dc1205b4b0', '{W}', 'Instant', ARRAY['W'], 'https://cards.scryfall.io/normal/front/4/6/4645eebf-c9fc-4ee7-b646-61dc1205b4b0.jpg?1793111861'),
  ('Cultivate', 'a78f5d3f-74d6-4ec1-89c4-e24639d3f4ba', '{2}{G}', 'Sorcery', ARRAY['G'], 'https://cards.scryfall.io/normal/front/a/7/a78f5d3f-74d6-4ec1-89c4-e24639d3f4ba.jpg?1793281380'),
  ('Demonic Tutor', 'a24b4cb6-cebb-428b-8654-74347a6a8d63', '{1}{B}', 'Sorcery', ARRAY['B'], 'https://cards.scryfall.io/normal/front/a/2/a24b4cb6-cebb-428b-8654-74347a6a8d63.jpg?1783915679'),
  ('Rhystic Study', '9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b', '{2}{U}', 'Enchantment', ARRAY['U'], 'https://cards.scryfall.io/normal/front/9/f/9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b.jpg?1783919146'),
  ('Smothering Tithe', '861b5889-0183-4bee-afeb-a4b2aa700a8e', '{3}{W}', 'Enchantment', ARRAY['W'], 'https://cards.scryfall.io/normal/front/8/6/861b5889-0183-4bee-afeb-a4b2aa700a8e.jpg?1783915712'),
  ('Lightning Greaves', '659ef698-96ea-4fa9-b63c-0da93a2d1e78', '{2}', 'Artifact — Equipment', ARRAY[]::text[], 'https://cards.scryfall.io/normal/front/6/5/659ef698-96ea-4fa9-b63c-0da93a2d1e78.jpg?1793197566')
), owned(user_id, card_name, quantity, available_for_trade) AS (VALUES
  -- Admin: Arcane Signet, Rhystic e Demonic rodam entre Atraxa e Wilhelt
  ('00000000-0000-4000-a000-000000000001', 'Sol Ring', 2, false),
  ('00000000-0000-4000-a000-000000000001', 'Arcane Signet', 1, false),
  ('00000000-0000-4000-a000-000000000001', 'Rhystic Study', 1, false),
  ('00000000-0000-4000-a000-000000000001', 'Demonic Tutor', 1, false),
  ('00000000-0000-4000-a000-000000000001', 'Counterspell', 3, true),
  ('00000000-0000-4000-a000-000000000001', 'Swords to Plowshares', 1, false),
  ('00000000-0000-4000-a000-000000000001', 'Smothering Tithe', 1, false),
  ('00000000-0000-4000-a000-000000000001', 'Command Tower', 1, false),
  ('00000000-0000-4000-a000-000000000001', 'Lightning Greaves', 2, false),
  ('00000000-0000-4000-a000-000000000001', 'Cultivate', 2, true),
  -- Ana
  ('00000000-0000-4000-a000-000000000002', 'Sol Ring', 1, false),
  ('00000000-0000-4000-a000-000000000002', 'Cultivate', 2, true),
  ('00000000-0000-4000-a000-000000000002', 'Command Tower', 1, false),
  ('00000000-0000-4000-a000-000000000002', 'Arcane Signet', 1, false),
  -- Bruno
  ('00000000-0000-4000-a000-000000000003', 'Sol Ring', 1, false),
  ('00000000-0000-4000-a000-000000000003', 'Command Tower', 1, false),
  ('00000000-0000-4000-a000-000000000003', 'Swords to Plowshares', 1, false),
  ('00000000-0000-4000-a000-000000000003', 'Rhystic Study', 1, false),
  ('00000000-0000-4000-a000-000000000003', 'Demonic Tutor', 1, false),
  ('00000000-0000-4000-a000-000000000003', 'Counterspell', 2, true),
  -- Carla: Sol Ring e Lightning Greaves rodam entre Tergrid e Wilson
  ('00000000-0000-4000-a000-000000000004', 'Sol Ring', 1, false),
  ('00000000-0000-4000-a000-000000000004', 'Lightning Greaves', 1, false),
  ('00000000-0000-4000-a000-000000000004', 'Demonic Tutor', 1, false),
  ('00000000-0000-4000-a000-000000000004', 'Cultivate', 1, false),
  ('00000000-0000-4000-a000-000000000004', 'Arcane Signet', 1, false)
)
INSERT INTO public.user_cards (user_id, scryfall_id, card_name, mana_cost, type_line, color_identity, image_url, quantity, available_for_trade)
SELECT o.user_id::uuid, c.scryfall_id, c.card_name, c.mana_cost, c.type_line, c.color_identity, c.image_url, o.quantity, o.available_for_trade
FROM owned o JOIN cards c USING (card_name);

-- ---------------------------------------------------------------------
-- 5. Partidas (aprovadas e pendentes) — datas relativas a now()
-- ---------------------------------------------------------------------
INSERT INTO public.matches (id, played_at, status, win_condition, notes, created_by, validated_by, validated_at) VALUES
  ('20000000-0000-4000-a000-000000000001', now() - interval '2 days',  'approved', 'Combate',              'Atraxa proliferou até ninguém aguentar.',          '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', now() - interval '2 days'),
  ('20000000-0000-4000-a000-000000000002', now() - interval '3 days',  'approved', 'Combate',              'Esika baixou o Prismatic Bridge no turno 4.',      '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', now() - interval '3 days'),
  ('20000000-0000-4000-a000-000000000003', now() - interval '5 days',  'approved', 'Combo',                'Bruno pegou a Atraxa emprestada e fechou no combo.', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', now() - interval '5 days'),
  ('20000000-0000-4000-a000-000000000004', now() - interval '9 days',  'approved', 'Stax / Travamento',    'Tergrid roubou tudo da mesa.',                      '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', now() - interval '9 days'),
  ('20000000-0000-4000-a000-000000000005', now() - interval '10 days', 'approved', 'Combo',                'Thoracle na resposta.',                             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', now() - interval '10 days'),
  ('20000000-0000-4000-a000-000000000006', now() - interval '12 days', 'approved', 'Dano de Comandante',   'Atraxa voando com Lightning Greaves.',             '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', now() - interval '12 days'),
  ('20000000-0000-4000-a000-000000000007', now() - interval '1 day',   'pending',  'Combate',              'Ana jura que ganhou limpo.',                        '00000000-0000-4000-a000-000000000002', NULL, NULL),
  ('20000000-0000-4000-a000-000000000008', now() - interval '4 hours', 'pending',  'Combo',                'Partida rápida de 3 jogadores.',                    '00000000-0000-4000-a000-000000000003', NULL, NULL);

-- Participantes: snapshots imutáveis copiados do deck no momento da partida
INSERT INTO public.match_participants (match_id, pilot_id, deck_id, deck_owner_id, commander_snapshot, color_identity_snapshot, is_winner, seat_order, elimination_reason)
SELECT p.match_id::uuid, p.pilot_id::uuid, d.id, d.owner_id,
       d.commander_name || COALESCE(' + ' || d.partner_name, ''),
       d.color_identity, p.is_winner, p.seat_order,
       p.elimination_reason
FROM (VALUES
  -- m1: Admin vence com Atraxa
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', false, 2, 'Combate'),
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', false, 3, 'Veneno'),
  ('20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005', false, 4, 'Combate'),
  -- m2: Ana vence com Esika
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', false, 1, 'Combate'),
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', true,  2, NULL),
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', false, 3, 'Combate'),
  ('20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000006', false, 4, 'Concedeu'),
  -- m3: Bruno vence pilotando a Atraxa do Admin (empréstimo)
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', false, 2, 'Combo'),
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005', false, 3, 'Combo'),
  ('20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', false, 4, 'Combo'),
  -- m4: Carla vence com Tergrid
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', false, 2, 'Combate'),
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', false, 3, 'Concedeu'),
  ('20000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', false, 4, 'Combate'),
  -- m5: Bruno vence com Tymna/Thrasios; Ana pilota a Tergrid da Carla
  ('20000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', false, 2, 'Combo'),
  ('20000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000006', false, 3, 'Combo'),
  ('20000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000005', false, 4, 'Combo'),
  -- m6: Admin vence (3 jogadores)
  ('20000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', false, 2, 'Dano de Comandante'),
  ('20000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000006', false, 3, 'Dano de Comandante'),
  -- m7 (pendente): Ana vence
  ('20000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', false, 2, 'Combate'),
  ('20000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000005', false, 3, 'Combate'),
  ('20000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', false, 4, 'Combate'),
  -- m8 (pendente): Bruno vence (3 jogadores)
  ('20000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004', true,  1, NULL),
  ('20000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000003', false, 2, 'Combo'),
  ('20000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000006', false, 3, 'Combo')
) AS p(match_id, pilot_id, deck_id, is_winner, seat_order, elimination_reason)
JOIN public.decks d ON d.id = p.deck_id::uuid;

-- ---------------------------------------------------------------------
-- 6. Uma edição anterior do Jornal Semanal
-- ---------------------------------------------------------------------
INSERT INTO public.weekly_newspapers (week_start, week_end, headline, content, matches_count, created_at) VALUES (
  (now() - interval '14 days')::date,
  (now() - interval '8 days')::date,
  'Tergrid assombra o Mesão e Bruno resolve no combo',
  E'### 📰 Gazeta do Mesão — Edição #1\n\n**Tergrid, God of Fright** passou a semana roubando permanentes e a Carla saiu com um sorriso de vilã.\n\nNo dia seguinte, **Bruno** respondeu com Tymna & Thrasios e um Thoracle na resposta que ninguém viu chegar.\n\n- 🏆 Destaques: Carla (1 vitória), Bruno (1 vitória), Admin (1 vitória)\n- 🔁 Empréstimo da semana: Ana pilotou a Tergrid da Carla\n\n_Próxima semana: será que alguém segura a Atraxa?_',
  3,
  now() - interval '7 days'
);

-- ---------------------------------------------------------------------
-- 7. Permissões de uso de deck (Bruno já jogou com a Atraxa do Admin
--    e Ana com a Tergrid da Carla)
-- ---------------------------------------------------------------------
INSERT INTO public.deck_permissions (deck_id, user_id, granted_by) VALUES
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000004');

-- ---------------------------------------------------------------------
-- 8. Proxies: o Admin usa proxy de Demonic Tutor e Rhystic Study no
--    Wilhelt (só o Arcane Signet continua rodando entre Atraxa e Wilhelt);
--    a Carla usa proxy de Sol Ring no Wilson.
-- ---------------------------------------------------------------------
UPDATE public.deck_cards SET is_proxy = true
WHERE (deck_id = '10000000-0000-4000-a000-000000000002' AND card_name IN ('Demonic Tutor', 'Rhystic Study'))
   OR (deck_id = '10000000-0000-4000-a000-000000000006' AND card_name = 'Sol Ring');

-- ---------------------------------------------------------------------
-- 9. Mais proxies para a visão "cartas que precisa":
--    Admin: Counterspell proxy na Atraxa (tem 3, 2 livres → original livre)
--    Ana: Counterspell e Rhystic Study proxy na Esika (não tem → precisa;
--         Counterspell está para troca com Admin e Bruno)
-- ---------------------------------------------------------------------
INSERT INTO public.deck_cards (deck_id, card_name, quantity, is_commander, is_proxy) VALUES
  ('10000000-0000-4000-a000-000000000001', 'Counterspell', 1, false, true),
  ('10000000-0000-4000-a000-000000000003', 'Counterspell', 1, false, true),
  ('10000000-0000-4000-a000-000000000003', 'Rhystic Study', 1, false, true)
ON CONFLICT (deck_id, card_name) DO UPDATE SET is_proxy = true;

-- ---------------------------------------------------------------------
-- 10. Datas de entrada no grupo (antes das primeiras partidas do seed)
-- ---------------------------------------------------------------------
WITH joined(id, at) AS (VALUES
  ('00000000-0000-4000-a000-000000000001'::uuid, now() - interval '90 days'),
  ('00000000-0000-4000-a000-000000000003'::uuid, now() - interval '75 days'),
  ('00000000-0000-4000-a000-000000000002'::uuid, now() - interval '40 days'),
  ('00000000-0000-4000-a000-000000000004'::uuid, now() - interval '25 days')
), pub AS (
  UPDATE public.users u SET created_at = j.at FROM joined j WHERE u.id = j.id
)
UPDATE auth.users u SET created_at = j.at FROM joined j WHERE u.id = j.id;

-- ---------------------------------------------------------------------
-- 11. A edição #1 do seed foi publicada pelo Admin
-- ---------------------------------------------------------------------
UPDATE public.weekly_newspapers SET generated_by = '00000000-0000-4000-a000-000000000001' WHERE edition_number = 1;

-- ---------------------------------------------------------------------
-- 12. Quem eliminou: nas eliminações causadas por oponente, o vencedor
--     da partida foi quem eliminou (dados de exemplo).
-- ---------------------------------------------------------------------
UPDATE public.match_participants mp
SET eliminated_by = w.pilot_id
FROM public.match_participants w
WHERE w.match_id = mp.match_id
  AND w.is_winner
  AND NOT mp.is_winner
  AND mp.elimination_reason IN ('Combate', 'Dano de Comandante', 'Combo', 'Veneno');
