# Roadmap e pendências do Mesão

Lista viva de correções e melhorias entre versões. Marque `[x]` quando resolver e
mova para a versão em que saiu. Toda mudança visível também entra em
`lib/changelog.ts` (com a versão do `package.json` em sincronia).

Branches: `main` (v1.3.0) → `v1.4.0` (Temporadas) → `v1.5.0` (Contratos e Rei da Mesa).
Correções feitas numa branch anterior precisam ser levadas (merge) para as seguintes.

---

## v1.3.0 — Rivalidades e Conquistas (`main`)

Deploy previsto: segunda, 30/11/2026.

- [ ] Ajustar a data da v1.3.0 em `lib/changelog.ts` para o momento real do deploy
- [ ] Backup do banco e dos arquivos do servidor antes de subir
- [ ] Publicar e reiniciar o serviço
- [ ] Enviar `main` para o GitHub

## v1.4.0 — Temporadas (`v1.4.0`)

Deploy previsto: fim da semana seguinte à v1.3.0. Produção começa **sem nenhuma
temporada**; o root cria o tema "Festas" e lança pelo Admin.

- [ ] Merge na `main`, ajustar a data no changelog e publicar
- [ ] Enviar a branch para o GitHub
- Decisões em aberto:
  - [ ] Frequentador da temporada: baixar de 8 para 6 semanas (a cada 13)?
  - [ ] Lenda da temporada: continua exigindo também Hat-trick e Massacre?

## v1.4.1 — Nível de jogo (depois do deploy da v1.4.0)

Sai antes da Liga para acumular histórico: quando a v2.0.0 começar (mar/2027), quem já
joga no Mesão terá meses de nível calculado. Branch nova a partir da `v1.4.0`; depois
levar para a `v1.5.0`.

- [ ] Rating multiplayer (proposta: OpenSkill, estilo TrueSkill, biblioteca aberta em
      JS): habilidade + incerteza; quem tem poucas partidas fica "em calibração" e se
      ajusta rápido
- [ ] Calculado com todas as partidas aprovadas (retroativo), sem o root
- [ ] Recalcula quando uma partida é aprovada, recusada ou excluída
- A definir:
  - [ ] Onde aparece: perfil, ranking, card da partida? Ou só por dentro (para a Liga)?
  - [ ] Número ou faixas com nomes neutros (ex.: Bronze, Prata, Ouro, Diamante)
  - [ ] Abate conta para o nível, ou só quem venceu?
  - [ ] Inatividade: a incerteza volta a subir para quem ficou meses sem jogar?

## v1.5.0 — Contratos semanais e Rei da Mesa (`v1.5.0`)

Revisão feita em 26/11/2026. O núcleo (votos, travas, sorteio, fuso, desempates,
root invisível) está correto; typecheck e lint passam.

### Decisões em aberto

- [ ] **Prazo para reivindicar contrato.** Recomendado: partida jogada na semana do
  contrato, reivindicação aceita até quarta da semana seguinte (servidor e tela com o
  mesmo prazo). Alternativa: só até domingo 23:59.
- [ ] **Regra do Rei da temporada.** Recomendado: quem estiver mais bem colocado com
  3+ partidas (igual ao Rei da mesa). Alternativa: só o 1º lugar, se tiver 3+.
- [ ] Regicídio conta só a partir do deploy da v1.5.0? (recomendado: sim, se subir no
  meio de uma temporada)
- [ ] Identidade de cor: baixar o mínimo de 5 para 3 partidas? (opcional)

### Correções importantes

- [ ] **Prazo do contrato inconsistente.** `claimContract` (`lib/actions/contracts.ts`)
  não confere o prazo, mas a tela só mostra "Reivindicar" até domingo. Uma recusa na
  terça impede outras pessoas de reivindicar; partida de domingo cadastrada na segunda
  não pode ser reivindicada. Aplicar o prazo decidido acima nos dois lados
  (`contracts-board.tsx`, `seasons/page.tsx` → `canClaim`, `lib/contracts.ts` → `contractStatus`).
- [ ] **Partida recusada/editada depois do contrato aprovado.** O contrato fica
  "Cumprido por X", X não ganha os pontos e ninguém mais reivindica. Ao recusar ou
  editar a partida (`lib/actions/matches.ts`), recusar as reivindicações ligadas a ela
  com motivo.
- [ ] **Partidas no mesmo minuto** são processadas em ordem aleatória (desempate por
  `match_id`), o que pode trocar o Rei da mesa e o Regicídio. Expor `created_at` da
  partida na view `approved_participations` e ordenar por `played_at`, `created_at`,
  `match_id` (`lib/seasons.ts` e `seasonParts`).
- [ ] **Duas regras para o Rei.** Mesa usa "mais bem colocado com 3+"; ranking, perfil,
  página da temporada e Gazeta usam só `standings[0]`. Unificar num helper
  (`kingOf(standings)`) conforme a decisão acima.
- [ ] **Identidade de cor com arredondamento.** `core` usa o percentual arredondado;
  com 101+ partidas, 50,4% vira 50% e a cor sai. Usar `games * 100 > total * 50`
  (`lib/color-profile.ts`).
- [ ] **Ranking no celular.** No pódio, as cores e a coroa espremem o nome até sumir;
  na 3ª linha da lista, cores + sequência + "+N extras" invadem a coluna de pontos
  (`ranking/page.tsx`, `ranking/race-board.tsx`).

### Correções menores

- [ ] Reivindicação pendente fica travada se a temporada fechar pelo prazo de 7 dias:
  recusar as pendentes no encerramento (`closeDueSeasons`) ou desabilitar "Aprovo".
- [ ] O card pode mostrar a reivindicação antiga (recusada) no lugar da nova: ordenar a
  consulta por `created_at` (`seasons/page.tsx`).
- [ ] Partida exatamente à meia-noite de segunda some da Gazeta: `inWeek` compara
  strings ISO com formatos diferentes (`lib/newspaper.ts`). Bug anterior à v1.5.
- [ ] RLS de `contract_votes` e `decided_by` deixam descobrir o id do root: filtrar com
  `is_hidden_user` ou expor só a contagem.
- [ ] Contagem de votos na tela não filtra quem deixou de ser admin (o servidor filtra).
- [ ] Coroa do Rei atual aparece num ranking de temporada antiga.
- [ ] Gazeta de encerramento não cita o Rei; o texto alternativo (sem IA) não traz
  regicídios nem contratos (`lib/season-newspaper.ts`). Ideia: citar também quem caiu
  no Regicídio.
- [ ] Selos de contrato com chave duplicada se o mesmo modelo sair duas vezes na
  semana: usar o `contract_id` no id (`lib/match-chips.ts`).
- [ ] Rotina semanal: dar `try/catch` próprio ao sorteio de contratos
  (`app/api/cron/weekly/route.ts`).
- [ ] Duplo clique em "Reivindicar" mostra "Outra pessoa acabou de reivindicar".
- [ ] Código morto em `approveClaim` (ramo 23505 e recusa das outras pendentes).
- [ ] Linguagem neutra: trocar "o mais bem colocado", "o primeiro aprovado",
  "identidade do jogador", "usá-la contra ele" etc.
- [ ] Usar as constantes nos textos em vez de números fixos ("3+", "2 admins",
  "+1 a +3").
- [ ] Acessibilidade: `aria-label` nos botões só com ícone e rótulos ligados aos campos
  no Admin → Contratos e no diálogo de reivindicação; motivo visível em botões
  desabilitados.
- [ ] Contrato expirado com reivindicação pendente mostra "Expirou sem dono" junto com
  "em análise": criar estado próprio.
- [ ] Diálogo de reivindicação mostra título vazio durante a animação de fechar.
- [ ] Card do Painel diz "todos já têm dono" mesmo quando nada foi sorteado.
- [ ] Card de Cores com 0 partidas mostra "das 0 partidas".
- [ ] Nome da identidade (ex.: "Simic") só no `title`: adicionar texto `sr-only`.
- [ ] `color_identity_snapshot` sem garantia de formato: normalizar (maiúsculas, sem
  repetição) antes de contar.
- [ ] Desempenho: os selos das partidas recalculam todas as temporadas a cada página;
  reaproveitar o placar já carregado e cachear temporadas encerradas.

### Antes de fechar a v1.5.0

- [ ] Apagar do banco local a temporada de teste e os dados de contratos
- [ ] Ajustar a data provisória (11/12/2026) no changelog no dia do deploy

## v1.6.0 — Simulador Suíço 1v1 (fim de jan / início de fev/2027)

- [ ] Página `/draft` isolada (não mexe no ranking, temporadas nem conquistas)
- [ ] Para Drafts e o Pré-Release do Caos
- [ ] 3 rodadas para 6 ativos, ou 4 rodadas para 11 inscritos
- A definir: bye com número ímpar, desempates (OMW%, GW%), melhor de 1 ou de 3

## v1.6.x — Gráficos de análise (em alguma versão da 1.6)

- [ ] Gráficos de análise: evolução de pontos, desempenho por deck/cor etc.
- A definir: quais gráficos, onde aparecem (perfil, ranking, temporada) e a biblioteca

## Migração para a nuvem (fev/2027)

- [ ] Sair da VPN: Vercel + Supabase Cloud (Free) + Gemini API
- [ ] Gemini: 1 RPC + 1 chamada JSON para o Jornal e as análises de perfil
- [ ] Bloquear cadastro público
- [ ] Conferir o RLS de todas as tabelas (com o app público, ele vira a defesa principal)
- [ ] GitHub Actions: keep-alive (o Supabase Free pausa sem uso) e backup do banco
- Cuidados conhecidos:
  - O agendador atual (`instrumentation.ts`, a cada 5 min) não roda na Vercel
    (serverless). A rotina `/api/cron/weekly` (conquistas, temporadas, contratos,
    Gazeta) precisa de outro gatilho: Vercel Cron (no plano grátis, 1x/dia) ou o
    GitHub Actions chamando a rota.
  - Migrar os dados do banco atual (usuários do Auth, partidas, decks, conquistas,
    temporadas) e as imagens de `public/banners`.
  - Nesse ponto já dá para usar HTTPS e trocar todos os segredos.
  - **Escala (pensando em ~500 pessoas):** hoje várias telas recalculam tudo do
    histórico a cada acesso, lendo todas as partidas aprovadas (`fetchAll`, em
    blocos de 1.000). Com ~25 mil participações por ano, isso deixa as páginas
    lentas e gasta o limite de tráfego do Supabase Free. Antes de o grupo crescer,
    passar para o modelo "calcula uma vez e grava" (igual às conquistas e ao nível
    da v1.4.1, que já é gravado em tabela):
    - [ ] Ranking "Desde sempre" e por período (`loadRanking`)
    - [ ] Conquistas (`computeAllAchievements` roda inteiro a cada sincronização)
    - [ ] Rivalidades e estatísticas do perfil
    - [ ] A sincronização de 5 min só recalcular quando algo mudou (o tráfego
      servidor ↔ banco também conta no limite)
    - [ ] Paginação/busca nas listas de pessoas (página Níveis, ranking)
- Coincide com a temporada **Nauctis**: evitar migrar no meio de um encerramento de
  temporada.

## v2.0.0 — Liga Anual 2027, "Modo Brasileirão" (mar/2027)

Já existe no app: assento (`seat_order`) e quem eliminou quem (`eliminated_by`) em cada
partida, o que basta para V/K/D sem mudar o cadastro de partidas.

### Decidido (26/11/2026)

- **Mesas travadas em 4** e **rodadas sem data**: no início do ano o app gera as
  primeiras mesas ("mesões"); quando todas são jogadas e **confirmadas por um admin**,
  saem as próximas. 1º e 2º turnos.
- **Página da Liga**: durante a liga mostra a tabela, as rodadas e as mesas; fora
  dela, mostra as inscrições para a próxima (e o histórico das anteriores).
- **Inscrição com deck**: antes de a liga começar, quem quer participar se inscreve
  com um deck. Durante a liga **não pode trocar de comandante**, mas pode mexer nas
  cartas do deck. As mesas são geradas com esses decks, e ao registrar uma partida da
  liga o deck já vem preenchido.
- **A cada liga nova**: quem já participa pode trocar de deck ou sair; gente nova pode
  entrar.
- **Registro para mesas justas**: guardar o histórico de cada pessoa (ligas jogadas,
  deck de cada liga, posição final, partidas) para equilibrar as mesas quando entra
  alguém novo.
- **Nível de jogo** (vem da v1.4.1): usado para saber, na entrada da liga, se a pessoa
  joga muito ou está começando, e evitar veteranos caindo em mesa com quem tem menos
  experiência.
- **Tudo automático**: o próprio app gera as rodadas seguintes, sem botão do root.
- **Pareamento balanceado** para 11 inscritos: equilibrar quem enfrenta quem, quem
  descansa na rodada e a ordem dos assentos (1–4).
- **Pontuação estilo Brasileirão**: vitória = 3 pontos; o resto desempata.
- **Tabela**: J, V, K (abates), D (mortes), saldo (K−D), Pts; corrida pelo **G-4**.
- **Grande Final** em dezembro: o G-4 joga a mesa que decide quem é campeão; título e
  selo no perfil.

### A definir

- [ ] Quantas partidas da liga por pessoa em cada turno (fica para depois)
- [ ] Rodada com 11 inscritos: proposta de 2 mesas de 4, com 3 descansando em rodízio
- [ ] Mesa parada: proposta de, após N dias (ex.: 14), o app gerar a próxima rodada
      sozinho, mantendo a mesa antiga aberta para ser jogada depois
- [ ] Empate (ninguém vence): vale 1 ponto para quem sobreviveu? Morte por conta
      própria conta como D?
- [ ] Desempate: vitórias, saldo, abates, confronto direto — nessa ordem?
- [ ] Grande Final: uma mesa só ou melhor de 3? O 1º da tabela tem alguma vantagem
      (escolher assento)?
- [ ] Inscrições: período (ex.: fevereiro) e quem sai no meio do ano
- [ ] Deck emprestado (com permissão do dono) vale na inscrição?
- [ ] Nível: como calcular (proposta: rating multiplayer tipo OpenSkill/TrueSkill,
      calculado com todas as partidas aprovadas, com incerteza alta para quem tem
      poucas partidas), se aparece para todo mundo e com que nomes (faixas neutras)
- [ ] Nível na montagem das mesas: juntar níveis parecidos ou misturar? (numa liga em
      que todo mundo deveria se enfrentar, juntar por nível conflita com o pareamento
      balanceado)
- [ ] Mínimo de inscritos para a liga começar (e o que fazer com mais de 11)
- [ ] Convivência com as temporadas. Proposta: a partida da liga é uma partida
      normal marcada como "Liga" e conta também no ranking geral e na temporada;
      Rei da Mesa, Regicídio e contratos seguem só na temporada.
- [ ] Cadastro: ao registrar, escolher "Mesa da Liga" já preenche as 4 pessoas, os
      decks da inscrição e os assentos.

## Futuro (sem data)

- [ ] **Rifa Mensal de Boosters** (era a v1.6.0; adiada, ainda sem data)
  - [ ] Urna ao vivo: 1 bilhete por partida aprovada no mês
  - [ ] Sorteio auditável no `/admin`
  - A definir: o root participa? (hoje ele é invisível e nunca pontua); partida recusada
    depois do sorteio; bilhetes por mês do calendário (fuso de São Paulo)
- [ ] Temporada temática **Nauctis** (fevereiro/2027): definir mecânicas, conquistas
  temáticas e arte
- [ ] Upload da arte do tema pelo Admin (hoje é um arquivo em `public/banners`)
- [ ] Backups automáticos do banco (`pg_dump`) — ou via GitHub Actions na migração
- [ ] Script de deploy em um comando
- [ ] Validar nomes de cartas no "Colar lista"
- [ ] Avisos de legalidade de Commander
- [ ] Lembrete no domingo para aprovar partidas pendentes
- [ ] CI e testes automatizados
- [ ] Trocar a senha de acesso ao servidor (enquanto estiver na VPN)
