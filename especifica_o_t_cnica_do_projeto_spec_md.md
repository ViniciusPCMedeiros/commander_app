# SPEC.md - MTG Commander Playgroup Tracker & Collection Manager

## 1. Visão Geral do Sistema
Aplicação web full-stack desenvolvida para gerenciamento de playgroup de Magic: The Gathering (Commander/EDH). O sistema permite acompanhar estatísticas de vitórias e derrotas por jogador e por deck, rastrear empréstimos de decks entre membros do grupo, manter o inventário de cartas e coleção física de cada jogador (diferenciando cartas livres, alocadas e rotacionadas entre múltiplos decks), oferecer um fluxo de moderação de partidas por Administradores, e gerar o "Jornal Semanal do Playgroup" e análises de estilo de jogo via IA (Google Gemini API gratuita).

---

## 2. Stack Tecnológica
- **Framework Web:** Next.js (App Router) com TypeScript e Tailwind CSS.
- **Componentes de UI:** `shadcn/ui` (com Radix UI e Lucide React Icons) pré-configurado no tema Dark Mode.
- **Backend & Banco de Dados:** Supabase (PostgreSQL + Supabase Auth + Row Level Security - RLS).
- **APIs Externas:**
  - **Scryfall API (REST, sem API Key):** Autocomplete (`/cards/autocomplete`), detalhes de cartas (`/cards/named`) e busca em lote (`POST /cards/collection`).
  - **Google Gemini API (Gratuita via Google AI Studio):** Integração com o modelo `gemini-2.5-flash` utilizando o endpoint de compatibilidade OpenAI (`https://generativelanguage.googleapis.com/v1beta/openai`).

---

## 3. Configuração de Variáveis de Ambiente (`.env.example`)

```env
# Supabase Local / Nuvem
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui

# Provedor de IA (Google Gemini Gratuito - Google AI Studio)
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-2.5-flash
AI_API_KEY=sua_gemini_api_key_aqui
```

---

## 4. Pontos Críticos de Arquitetura & Soluções

### A. Integração com Gemini API Gratuita (Padrão OpenAI Compatible)
- **Como funciona:** O Google AI Studio aceita requisições no formato `/v1/chat/completions`. No arquivo `lib/ai.ts`, a chamada usa `fetch` padrão para `${process.env.AI_BASE_URL}/v1/chat/completions` enviando o header `Authorization: Bearer ${process.env.AI_API_KEY}`.
- **Vantagens:** 100% gratuito (sem necessidade de cartão de crédito), cota diária ampla para o grupo e compatibilidade para trocar por Ollama local ou OpenAI apenas alterando as variáveis no `.env`.
- **Fallback Gracioso:** Se `AI_API_KEY` estiver ausente ou o serviço offline, o backend gera uma crônica mockada estruturada usando os dados reais da semana sem quebrar a UI.

### B. Cartas Dupla-Face (MDFCs) e Parceiros (Scryfall API)
- **MDFCs / Transform:** Cartas como *Esika* ou *Tergrid* têm imagens em `card.card_faces[0].image_uris.art_crop`. O helper `lib/scryfall.ts` implementa fallback automático entre a raiz e o array `card_faces`.
- **Comandantes Duplos:** Suporte a Partner, Friends Forever, Backgrounds e Doctor's Companion com salvamento de `partner_name`, `partner_image_url` e união de cores (`color_identity`).

### C. Snapshots Imutáveis na Partida
- Em `match_participants`, são gravados os dados imutáveis da partida: `deck_owner_id`, `commander_snapshot` e `color_identity_snapshot`.
- O dono pode alterar o comandante no cadastro do deck (`decks`) ou passar o deck para um amigo no futuro sem alterar o histórico de partidas passadas.
- **Detecção de Empréstimo:** Classificado automaticamente como empréstimo quando `pilot_id != deck_owner_id` no snapshot.

### D. Rastreamento de Cartas Rotacionadas (1 Cópia Física em N Decks)
- A view `user_collection_status` compara a quantidade física (`owned_qty`) contra o uso em decks ativos (`in_decks_count`).
- Cartas com `owned_qty < in_decks_count` recebem a classificação `shared_rotation` e geram alertas no checklist pré-jogo do deck.

---

## 5. Schema do Banco de Dados (SQL Completo)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Perfis de Usuário
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para sincronizar auth.users com public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Tabela de Decks
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  commander_name TEXT NOT NULL,
  commander_image_url TEXT,
  partner_name TEXT,
  partner_image_url TEXT,
  color_identity TEXT[] NOT NULL DEFAULT '{}',
  moxfield_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Cartas da Coleção Física do Usuário
CREATE TABLE public.user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scryfall_id TEXT,
  card_name TEXT NOT NULL,
  mana_cost TEXT,
  type_line TEXT,
  color_identity TEXT[] DEFAULT '{}',
  image_url TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  available_for_trade BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, card_name)
);

-- 4. Tabela de Cartas dos Decks
CREATE TABLE public.deck_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  is_commander BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(deck_id, card_name)
);

-- 5. Tabela de Partidas (Cabeçalho)
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  win_condition TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  validated_by UUID REFERENCES public.users(id),
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela de Participantes da Partida (com Snapshots)
CREATE TABLE public.match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  pilot_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE RESTRICT,
  deck_owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  commander_snapshot TEXT NOT NULL,
  color_identity_snapshot TEXT[] DEFAULT '{}',
  is_winner BOOLEAN NOT NULL DEFAULT false,
  seat_order INT CHECK (seat_order BETWEEN 1 AND 8),
  elimination_reason TEXT,
  UNIQUE(match_id, pilot_id),
  UNIQUE(match_id, deck_id)
);

-- 7. Tabela de Insights de IA (Perfil do Jogador)
CREATE TABLE public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('player_profile', 'monthly_recap')),
  content TEXT NOT NULL,
  games_snapshot INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela de Arquivo do Jornal Semanal
CREATE TABLE public.weekly_newspapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_number SERIAL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  headline TEXT NOT NULL,
  content TEXT NOT NULL,
  matches_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

---
--- VIEWS SQL E ESTATÍSTICAS
---

-- View: Status de Coleção (Livres vs. Rotacionadas)
CREATE OR REPLACE VIEW public.user_collection_status AS
SELECT 
  uc.id,
  uc.user_id,
  u.name AS owner_name,
  uc.scryfall_id,
  uc.card_name,
  uc.image_url,
  uc.color_identity,
  uc.quantity AS owned_qty,
  uc.available_for_trade,
  COALESCE(COUNT(dc.deck_id), 0)::INT AS in_decks_count,
  COALESCE(ARRAY_AGG(d.name) FILTER (WHERE d.id IS NOT NULL AND d.is_active = true), ARRAY[]::TEXT[]) AS used_in_decks,
  (uc.quantity - COALESCE(COUNT(dc.deck_id), 0))::INT AS balance,
  CASE 
    WHEN COALESCE(COUNT(dc.deck_id), 0) = 0 THEN 'free'
    WHEN uc.quantity < COALESCE(COUNT(dc.deck_id), 0) THEN 'shared_rotation'
    WHEN uc.quantity > COALESCE(COUNT(dc.deck_id), 0) THEN 'partial_free'
    ELSE 'allocated'
  END AS usage_status
FROM public.user_cards uc
JOIN public.users u ON uc.user_id = u.id
LEFT JOIN public.decks d ON d.owner_id = uc.user_id AND d.is_active = true
LEFT JOIN public.deck_cards dc ON dc.deck_id = d.id AND LOWER(dc.card_name) = LOWER(uc.card_name)
GROUP BY uc.id, u.name;

-- View: Estatísticas dos Decks
CREATE OR REPLACE VIEW public.deck_stats AS
SELECT 
  d.id AS deck_id,
  d.name AS deck_name,
  d.commander_name,
  d.partner_name,
  d.commander_image_url,
  d.color_identity,
  d.is_active,
  u.id AS owner_id,
  u.name AS owner_name,
  COUNT(mp.id)::INT AS total_games,
  COUNT(mp.id) FILTER (WHERE mp.is_winner)::INT AS total_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.is_winner)::numeric / NULLIF(COUNT(mp.id), 0) * 100, 0), 1) AS overall_winrate,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id)::INT AS owner_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id AND mp.is_winner)::INT AS owner_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id AND mp.is_winner)::numeric / NULLIF(COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id), 0) * 100, 0), 1) AS owner_winrate,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id)::INT AS borrowed_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id AND mp.is_winner)::INT AS borrowed_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id AND mp.is_winner)::numeric / NULLIF(COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id), 0) * 100, 0), 1) AS borrowed_winrate
FROM public.decks d
JOIN public.users u ON d.owner_id = u.id
LEFT JOIN public.match_participants mp ON d.id = mp.deck_id
LEFT JOIN public.matches m ON mp.match_id = m.id AND m.status = 'approved'
GROUP BY d.id, u.id, u.name;

-- View: Estatísticas dos Jogadores
CREATE OR REPLACE VIEW public.player_stats AS
SELECT 
  u.id AS user_id,
  u.name AS player_name,
  u.avatar_url,
  COUNT(mp.id)::INT AS total_games,
  COUNT(mp.id) FILTER (WHERE mp.is_winner)::INT AS total_wins,
  ROUND(COALESCE(COUNT(mp.id) FILTER (WHERE mp.is_winner)::numeric / NULLIF(COUNT(mp.id), 0) * 100, 0), 1) AS overall_winrate,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id)::INT AS own_deck_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id = mp.deck_owner_id AND mp.is_winner)::INT AS own_deck_wins,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id)::INT AS borrowed_deck_games,
  COUNT(mp.id) FILTER (WHERE mp.pilot_id != mp.deck_owner_id AND mp.is_winner)::INT AS borrowed_deck_wins
FROM public.users u
LEFT JOIN public.match_participants mp ON u.id = mp.pilot_id
LEFT JOIN public.matches m ON mp.match_id = m.id AND m.status = 'approved'
GROUP BY u.id;

---
--- RLS POLICIES
---
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_newspapers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura autenticada users" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada decks" ON public.decks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada user_cards" ON public.user_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada deck_cards" ON public.deck_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada matches" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada match_participants" ON public.match_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada ai_insights" ON public.ai_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada weekly_newspapers" ON public.weekly_newspapers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inserir decks" ON public.decks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Editar decks" ON public.decks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Gerenciar propria colecao" ON public.user_cards FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Gerenciar cartas do deck" ON public.deck_cards FOR ALL TO authenticated USING (true);

CREATE POLICY "Criar partida" ON public.matches FOR INSERT TO authenticated 
  WITH CHECK (status = 'pending' OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Criar participantes" ON public.match_participants FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins modera partidas" ON public.matches FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins deletam partidas" ON public.matches FOR DELETE TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
```

---

## 6. Módulo da IA (`lib/ai.ts`) com Gemini Gratuito

```typescript
// lib/ai.ts
export async function generateAICompletion(prompt: string, systemPrompt: string): Promise<string> {
  const baseUrl = process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    console.warn('AI_API_KEY não encontrada. Usando gerador mock de fallback.');
    return generateFallbackResponse(prompt);
  }

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API de IA: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || generateFallbackResponse(prompt);
  } catch (error) {
    console.error('Falha ao comunicar com a IA:', error);
    return generateFallbackResponse(prompt);
  }
}

function generateFallbackResponse(prompt: string): string {
  return "### 📰 Gazeta do Mesão (Edição Automática)\n\nSemana movimentada nas mesas! Confira as estatísticas validadas diretamente no painel.";
}
```

---

## 7. Estrutura de Pastas e Componentes do Projeto

```text
/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── page.tsx                  // KPIs, Ranking, Card do Jornal + Botão WhatsApp
│   │   ├── decks/
│   │   │   ├── page.tsx
│   │   │   └── new/page.tsx          // Autocomplete Scryfall + Suporte a Parceiros
│   │   ├── matches/
│   │   │   ├── page.tsx              // Histórico + Fila Admin
│   │   │   └── new/page.tsx          // Form Mobile-First (Ordem, Vitória, Eliminações)
│   │   ├── collection/
│   │   │   └── page.tsx              // Importação em Lote + Alerta de Cartas Rotacionadas
│   │   ├── players/[id]/page.tsx     // Perfil + Insight Gemini
│   │   └── admin/page.tsx            // Gestão de Usuários (Service Role)
│   └── api/
│       ├── admin/create-user/route.ts
│       ├── ai/newspaper/route.ts      // Rota do Jornal com Gemini API
│       └── ai/player-insight/route.ts
├── components/
│   ├── ui/                           // shadcn/ui
│   ├── navbar.tsx
│   ├── scryfall-search.tsx           // Componente com Autocomplete
│   ├── match-card.tsx
│   └── whatsapp-share-button.tsx     // Formata texto com emojis para WhatsApp
├── lib/
│   ├── scryfall.ts                   // Helper de imagens e MDFCs
│   ├── ai.ts                         // Integração Gemini API + Fallback
│   └── supabase/
│       ├── client.ts
│       └── server.ts
├── supabase/
│   ├── schema.sql
│   └── seed.sql                      // Seed com Admin padrão e 3 jogos de teste
├── .env.example
├── package.json
└── README.md
```

---

## 8. Guia de Execução para o Claude Code

Passos para o Claude Code executar no terminal:

```bash
# 1. Inicializar projeto Next.js com Shadcn UI
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false
npx shadcn@latest init -y
npx shadcn@latest add button card dialog dropdown-menu input label select tabs badge avatar toast

# 2. Instalar dependências
npm install @supabase/supabase-js @supabase/ssr lucide-react

# 3. Inicializar Supabase Local
npx supabase init
```