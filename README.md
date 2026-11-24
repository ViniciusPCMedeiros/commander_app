# Mesão — MTG Commander Playgroup Tracker

Gerenciador de playgroup de Magic: The Gathering (Commander/EDH): estatísticas por jogador e deck, empréstimos de decks, coleção física com detecção de cartas rotacionadas, moderação de partidas e o **Jornal Semanal** gerado por IA (Gemini).

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · shadcn/ui (Radix, dark) · Supabase (Postgres + Auth + RLS) · Scryfall API · Gemini (endpoint compatível com OpenAI).

## Rodando localmente

```bash
./start.sh          # ou: npm run up
```

O script cuida de tudo e pode ser rodado quantas vezes quiser:

1. confere os pré-requisitos e **oferece instalar o que faltar** (sempre perguntando antes; `-y` aceita tudo):
   - **Node.js 20.9+**: se faltar ou for antigo, instala o Node 22 via [nvm](https://github.com/nvm-sh/nvm). Não usa sudo, fica só no seu usuário;
   - **Docker**: se não estiver instalado, instala com **sudo** (script oficial `get.docker.com`, ou `pacman` no Arch);
   - **Docker parado**: inicia o serviço e o deixa ligado no boot (**sudo**);
   - **sem permissão no Docker**: adiciona seu usuário ao grupo `docker` (**sudo**) e continua na mesma execução, sem precisar sair da sessão;
   - **curl** (usado nos downloads): instala com sudo se faltar;
   - no macOS o Docker Desktop precisa ser instalado manualmente (o script mostra o link).
2. instala as dependências (de novo só se o `package-lock.json` mudar);
3. sobe o Supabase local. Na primeira vez cria o banco com migrations e seed; nas seguintes aplica só as migrations novas, sem apagar dados;
4. gera ou atualiza o `.env.local` com as chaves do Supabase, sem sobrescrever a sua `AI_API_KEY`;
5. inicia o app numa porta livre (3000 ou a próxima) e mostra o endereço e os logins. Se o app já estiver rodando, só mostra o endereço.

| Comando | O que faz |
| --- | --- |
| `./start.sh` | sobe tudo em modo desenvolvimento |
| `./start.sh --prod` (`npm run up:prod`) | build de produção e `next start` |
| `./start.sh stop` (`npm run down`) | para o Supabase (dados mantidos) |
| `./start.sh reset` | recria o banco do zero, limpo, só com o root (pede confirmação) |
| `./start.sh reset --demo` | idem, com os dados de exemplo |
| `./start.sh -y` | aceita automaticamente as perguntas de instalação (o `reset` continua pedindo confirmação) |

Supabase Studio: http://127.0.0.1:54323

### Conta root e dados iniciais

Um banco novo começa **limpo**: sem jogadores, decks ou partidas. O `./start.sh` cria apenas a **conta root** com o e-mail e a senha de `ROOT_EMAIL`/`ROOT_PASSWORD` (variáveis de ambiente ou `.env.local`). Se elas não existirem, ele pergunta na primeira vez. Só o e-mail fica guardado no `.env.local`, a senha nunca. Depois disso, entre com o root e crie os membros no painel Admin.

O **root é invisível**: não aparece em ranking, histórico, listas de jogadores, seleção de partidas nem no painel Admin dos outros, e o perfil dele dá "não encontrado". Isso é garantido pelo RLS do banco (`is_hidden_user`). Se o root tiver jogado, as partidas continuam valendo, mas os outros veem "Jogador oculto" no lugar do nome.

Para testes locais há **dados de exemplo** em `supabase/seed.demo.sql`, carregados com `./start.sh reset --demo`:

| Papel | E-mail | Senha |
| --- | --- | --- |
| Root (invisível) | `admin@commander.local` | `Admin@123` |
| Admin | `bruno@commander.local` | `Membro@123` |
| Membro | `ana@commander.local` | `Membro@123` |
| Membro | `carla@commander.local` | `Membro@123` |

**Supabase na nuvem:** aplique as migrations com `npx supabase link` e `npx supabase db push`, coloque a URL e as chaves do projeto no `.env.local` e crie o root com:

```bash
ROOT_EMAIL=voce@exemplo.com ROOT_PASSWORD='senha-forte' node --env-file=.env.local scripts/ensure-root.mjs
```

### Papéis

| Poder | Membro | Admin | Root |
| --- | :-: | :-: | :-: |
| Registrar partida (entra pendente), cuidar dos próprios decks e coleção | ✓ | ✓ | ✓ |
| Moderar partidas (aprovar/rejeitar, registrar já aprovada) | – | ✓ | ✓ |
| Excluir partidas | – | ✓ | ✓ |
| Criar membros | – | ✓ (membro ou admin) | ✓ (qualquer papel) |
| Alterar papéis | – | só membro → admin | ✓ tudo (menos o próprio) |
| Editar decks de outros (lista, proxies, permissões, aposentar, criar para outro) | – | – | ✓ |

As regras ficam no banco (RLS: `is_admin()` = admin ou root, `is_root()`) e em `lib/roles.ts`.

**Segurança:** o signup aberto está desligado (`enable_signup = false` em `supabase/config.toml`), e as contas são criadas só pelo painel Admin. O papel fica em `app_metadata`, que só a service role escreve, e nunca em `user_metadata`, que o próprio usuário controla. Ao subir para o Supabase na nuvem, desligue também "Allow new users to sign up" em Authentication → Providers. Para criar o primeiro root, use SQL: `update public.users set role = 'root' where email = '...'`.

O seed inclui 6 decks (incluindo MDFCs como Esika/Tergrid, parceiros Tymna + Thrasios e Wilson + Background), 6 partidas aprovadas, 2 pendentes, empréstimos de deck, cartas rotacionadas na coleção e uma edição do jornal.

### IA (Gemini gratuito)

1. Gere uma chave em https://aistudio.google.com/apikey
2. Troque `AI_API_KEY=placeholder` no `.env.local` e reinicie o servidor.

Enquanto a chave for `placeholder` (ou se a API falhar), o jornal e o perfil de jogador são gerados por um **fallback local** com os dados reais da semana; a UI mostra o selo "IA local (fallback)". Para usar Ollama/OpenAI basta trocar `AI_BASE_URL`, `AI_MODEL` e `AI_API_KEY`.

## Funcionalidades

- **Painel** (`/`): KPIs, ranking de jogadores, decks mais vitoriosos, Jornal Semanal com geração por IA e botão de compartilhar no WhatsApp.
- **Partidas** (`/matches`): histórico aprovado e fila de moderação (Admin aprova/rejeita/exclui). Membros registram partidas como *pendentes*; Admin registra já aprovadas.
- **Registrar partida** (`/matches/new`): formulário mobile-first com ordem de assentos, vencedor, forma de eliminação e detecção automática de empréstimo. As formas de eliminação são separadas em causadas por um oponente (combate, dano de comandante, combo, veneno, mill do inimigo, drenagem do inimigo) e efeito próprio (drenagem própria, mill próprio), além de "concedeu" e "outro". Nas causadas por oponente, o formulário pede **quem eliminou** (o vencedor vem sugerido), e isso aparece no card da partida, no Jornal ("⚔️ Quem mais eliminou") e no perfil do jogador (algoz e vítima favorita).
- **Decks** (`/decks`, `/decks/new`, `/decks/[id]`): autocomplete da Scryfall, suporte a dupla-face e comandantes duplos (Partner, variantes Partner—X como Friends forever, Partner with, Backgrounds, Doctor's Companion), winrate geral / com o dono / emprestado e **checklist pré-jogo** de cartas rotacionadas.
- **Proxies**: na lista do deck, o dono marca as cartas que são proxy (botão "proxy" ao lado da carta, ou `[proxy]` no fim da linha ao colar a lista). Um proxy não consome cópia física, então não conta como alocado na coleção e não gera alerta de carta rotacionada. O checklist mostra quantos proxies o deck tem, e a coleção indica "proxy em <deck>". Ao importar a coleção, as linhas marcadas com `[proxy]` são ignoradas. Os proxies aparecem na coleção como linhas "Proxy" (abas "Proxies" e "Precisa"). Cada linha mostra "Precisa de N" quando não há cópia original livre, ou "Original livre" quando dá para trocar o proxy pela original. Também lista quem do grupo tem a carta disponível para troca. O perfil do jogador traz a seção "Cartas que precisa".
- **Coleção** (`/collection`): importação em lote (Scryfall `POST /cards/collection`), status livre / parcial / alocada / rotacionada, cartas para troca, ver coleção de outros membros.
- **Permissão de uso de deck**: na página do deck, o dono libera o deck para outros membros jogarem, e vários podem ter permissão ao mesmo tempo. O dono ou um admin removem a permissão, e o próprio membro pode abrir mão dela. O perfil do jogador mostra os decks liberados para ele. A lista de decks tem a aba "Liberados p/ mim" e o selo "+N podem usar". No registro de partida, os decks liberados aparecem logo após os decks do próprio jogador.
- **Jogador** (`/players/[id]`): estatísticas, comandantes, decks liberados para a pessoa, decks dela e análise de estilo de jogo por IA.
- **Ranking** (`/ranking`): pódio e abas de Jogadores, Decks, Comandantes (agregando decks diferentes com o mesmo comandante) e Cores. Filtros de período (desde sempre, este mês, últimos 30 dias, este ano, no fuso de São Paulo) e de ordenação (vitórias, Win% com mínimo de 3 partidas, partidas). Para jogadores, mostra também decks próprios vs. emprestados, a sequência de vitórias atual e a melhor, e a última partida. Conta somente partidas aprovadas. Mostra quem está subindo e quem está caindo, no estilo do pódio do Mario Kart: setas ▲/▼, "=" e NOVO comparando com o ranking de antes da última sessão (o último dia com partidas, no fuso de São Paulo). Na aba Jogadores, uma "corrida" animada desliza cada um da posição antiga para a nova (o botão "Ver de novo" repete a animação, que respeita a preferência de reduzir movimento).
- **Jornais** (`/newspapers`, `/newspapers/[id]`): arquivo de todas as edições da Gazeta do Mesão. Cada edição tem página própria com o texto completo, o placar da semana, os comandantes vencedores, os decks emprestados, as partidas da semana, quem gerou e se veio do Gemini ou do gerador local, navegação para a edição anterior e a próxima, e compartilhamento no WhatsApp. Gerar de novo na mesma semana atualiza a edição dessa semana em vez de criar uma duplicada.
- **Histórico** (`/history`): linha do tempo do grupo agrupada por mês, com quando cada membro entrou, a primeira partida (com qual comandante e se o deck era emprestado) e a primeira vitória. É calculada a partir das partidas aprovadas (view `player_milestones`). O perfil de cada jogador traz a mesma linha do tempo.
- **Admin** (`/admin`): criação de usuários (service role) e alteração de papéis.

## Visual e créditos

- **Tema "grimório":** fundo obsidiana `#0c0b0a`, dourado de moldura de carta como cor de destaque, cards translúcidos e símbolos de mana oficiais (SVGs da Scryfall em `public/mana/`).
- **Tipografia:** Cinzel nos títulos e no menu, Spectral no jornal, Source Sans 3 no texto.
- **Arte de fundo em cada página** (`components/page-header.tsx`): a imagem cobre o fundo da página inteira e fica fixa enquanto o conteúdo rola. Ela é escurecida por gradientes (mais clara no topo, mais escura embaixo e atrás do título) para manter cards e textos legíveis. O título e as ações ficam no topo e o crédito do artista discreto à direita. As imagens são arquivos locais em **`public/banners/`** (até 2560px), mapeados em `lib/banners.ts`:

| Rota | Arquivo | Crédito |
| --- | --- | --- |
| `/` (Painel) e login | `painel.jpg` | Leyline of the Guildpact — Daarken |
| `/matches`, `/matches/new` | `partidas.jpg` | Face Yourself — Ekaterina Burmak |
| `/ranking` | `ranking.jpg` | The Aetherspark — Donato Giancola |
| `/decks`, `/decks/new`, `/decks/[id]` | `decks.jpg` | a definir (arte de Mark Zug) |
| `/newspapers`, `/newspapers/[id]` | `jornais.jpg` | Silverquill Charm — Ksenia Kim |
| `/collection` | `colecao.jpg` | Reliquary Tower — Jesper Ejsing |
| `/history` | `historico.jpg` | Great Hall of the Biblioplex — Constantin Marin |
| `/admin` | `admin.jpg` | a definir |

As imagens incluídas são o melhor scan de cada arte na Scryfall, ampliadas 4x com super-resolução (EDSR). Para trocar uma arte, substitua o `.jpg` e atualize o crédito em `lib/banners.ts`: o crédito precisa corresponder ao artista da imagem.

**Fallback:** enquanto o arquivo de uma rota não existir em `public/banners/`, o banner mostra só um gradiente radial dourado/obsidiana. A arte pixelada da Scryfall nunca é usada aqui. As páginas de jogador e de "não encontrado" sempre usam esse gradiente.

- **Uso permitido:** o app é Fan Content não oficial, sob a [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) da Wizards of the Coast. O rodapé traz o aviso exigido e cada banner credita o artista. O uso deve continuar gratuito e não comercial.

## Estrutura

```
app/(auth)/login             Login (Server Action)
app/(dashboard)/...          Páginas autenticadas
app/api/admin/create-user    Criação de usuário (service role)
app/api/ai/newspaper         Jornal semanal (Gemini + fallback)
app/api/ai/player-insight    Perfil de jogador (Gemini + fallback)
lib/scryfall.ts              Helpers Scryfall (imagens MDFC, parceiros, lote, parser de lista)
lib/ai.ts                    Cliente Gemini/OpenAI-compatible + fallback
lib/newspaper.ts             Montagem do jornal com os dados da semana
lib/insights.ts              Perfil de estilo de jogo
lib/actions/*                Server Actions (decks, partidas, coleção, admin)
lib/supabase/*               Clientes browser/server/proxy (@supabase/ssr)
proxy.ts                     Renovação de sessão e redirecionamento para /login
supabase/schema.sql          Schema, views e RLS (cópia em supabase/migrations/)
supabase/seed.sql            Dados de desenvolvimento
```

## Diferenças em relação ao SPEC

- **URL da IA:** o SPEC chamava `${AI_BASE_URL}/v1/chat/completions`, mas o base URL do Gemini já termina em `/openai`; o caminho correto é `${AI_BASE_URL}/chat/completions`.
- **Views de estatística:** no SPEC, o filtro `status = 'approved'` estava no `LEFT JOIN` de `matches`, o que contava partidas pendentes. Agora as views usam a view `approved_participations`.
- **`user_collection_status`:** `used_in_decks` listava todos os decks ativos do dono, e não só os que contêm a carta. O nome é comparado pela face frontal (MDFC), e a quantidade usa `SUM(quantity)`.
- **RLS mais restrito:** só o dono (ou um admin) edita decks e listas, e só o criador da partida insere participantes. As views usam `security_invoker`.
- **Fallback da IA:** além de chave ausente, também é usado quando `AI_API_KEY=placeholder`, e gera a crônica com os dados reais da semana.
- **Toast:** `sonner` no lugar do `toast`, que está depreciado no shadcn.
