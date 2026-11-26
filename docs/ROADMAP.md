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

## v1.6.0 — Gráficos (planejado)

- [ ] Gráficos de análise (evolução de pontos, desempenho por deck/cor etc.) — escopo a
  definir

## Futuro

- [ ] Temporada temática **Nauctis** (fevereiro/2027): definir mecânicas, conquistas
  temáticas e arte
- [ ] Upload da arte do tema pelo Admin (hoje é um arquivo em `public/banners`)
- [ ] Backups automáticos do banco (`pg_dump`)
- [ ] Script de deploy em um comando
- [ ] Validar nomes de cartas no "Colar lista"
- [ ] Avisos de legalidade de Commander
- [ ] Lembrete no domingo para aprovar partidas pendentes
- [ ] CI e testes automatizados
- [ ] Trocar a senha de acesso ao servidor
