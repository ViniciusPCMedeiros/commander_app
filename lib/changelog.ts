/**
 * Notas de versão do Mesão. A primeira entrada é a versão atual (mostrada no
 * rodapé e no menu). Ao lançar uma versão: adicione a entrada no topo e
 * atualize "version" no package.json para o mesmo número.
 */

export type ChangeKind = "novo" | "melhoria" | "correcao";

export interface Release {
  version: string;
  /** Quando a versão foi ao ar (ISO com fuso): ordena o histórico do grupo. */
  date: string;
  title: string;
  changes: { kind: ChangeKind; text: string }[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.3.0",
    date: "2026-11-25T14:30:00-03:00",
    title: "Rivalidades e conquistas",
    changes: [
      {
        kind: "novo",
        text: "Conquistas: 60 selos liberados pelas partidas, pela coleção e pelos decks, com raridade comum, incomum, rara e mítica — valem para todo o histórico, então quem já jogou já tem as suas. Uma vez liberada, a conquista é sua: só sai se a partida que a deu for rejeitada ou excluída.",
      },
      {
        kind: "novo",
        text: "Página de Conquistas com quem já liberou cada uma, quanto do grupo tem e quem foi a primeira pessoa a conseguir. Algumas são secretas: a condição só aparece depois que alguém liberar.",
      },
      {
        kind: "novo",
        text: "Perfil com as conquistas liberadas e o progresso das próximas; o card da partida mostra o selo de quem liberou algo nela.",
      },
      {
        kind: "novo",
        text: "Conquistas raras, míticas e secretas entram no histórico do grupo e ganham destaque na Gazeta da semana.",
      },
      {
        kind: "novo",
        text: "Página de Rivalidades: as duplas que mais se enfrentam e um quadro com o placar de abates, vitórias e mesas de cada jogador contra cada um.",
      },
      {
        kind: "novo",
        text: "Confronto direto entre dois jogadores: placar, como um eliminou o outro e as partidas que jogaram juntos.",
      },
      {
        kind: "novo",
        text: "Perfil do jogador com o Rival (com quem mais troca abates), o Freguês (quem mais elimina) e todos os confrontos diretos.",
      },
      {
        kind: "correcao",
        text: "Ranking, Gazeta, perfil e análises não vão mais ignorar partidas quando o histórico passar de 1000 participações; coleções com mais de 1000 cartas aparecem inteiras, e importar cartas soma certo nas coleções grandes.",
      },
      {
        kind: "melhoria",
        text: "Pontuação dos abates: eliminar por mill do inimigo passa a valer +2 e por veneno +1 (trocaram de valor); eliminar por combo continua contando como abate, mas não dá mais pontos. Vale para todo o histórico do ranking.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-11-25T12:14:00-03:00",
    title: "IA ligada, mortes no ranking e no perfil",
    changes: [
      {
        kind: "novo",
        text: "IA de verdade (Gemini, plano gratuito) na Gazeta e no estilo de jogo; se a cota do dia acabar, o texto local continua funcionando.",
      },
      { kind: "novo", text: "Ranking mostra as mortes (☠) de cada jogador ao lado dos abates (⚔)." },
      {
        kind: "melhoria",
        text: "Estilo de jogo mais completo: números comparados com o grupo, desempenho por assento e por deck, confrontos diretos, rivalidades, dicas para a próxima mesa e um comandante sugerido.",
      },
      {
        kind: "novo",
        text: "A Gazeta sai sozinha toda segunda-feira à 00h, com as partidas de segunda a domingo — uma edição por semana. O botão de gerar edição saiu.",
      },
      {
        kind: "novo",
        text: "O estilo de jogo de cada jogador também é atualizado sozinho toda segunda-feira, só para quem jogou partidas novas. Gerar fora disso ficou restrito ao root.",
      },
      {
        kind: "novo",
        text: "Se a IA falhar na rotina semanal, o root recebe um aviso e pode refazer a Gazeta ou a análise de cada jogador no Admin.",
      },
      {
        kind: "melhoria",
        text: "Gazeta com mesa a mesa, placar de pontos da semana, quem subiu e caiu no ranking, primeiras vitórias, sequências e um gancho para a próxima rodada.",
      },
      { kind: "correcao", text: "A Gazeta mostrava o nome da conta de sistema quando ela gerava a edição." },
      { kind: "melhoria", text: "Eliminar por mill do inimigo passa a valer +1 ponto (antes +2), como combate, combo e drenagem." },
      {
        kind: "novo",
        text: "Perfil do jogador com as mortes por tipo e o “carrasco”, quem mais eliminou aquele jogador.",
      },
      {
        kind: "melhoria",
        text: "Placar do ranking maior e mais legível: vitórias, abates, mortes, partidas e Win% em colunas, com os pontos em destaque.",
      },
      {
        kind: "melhoria",
        text: "Filtro de cor da coleção: as cartas incolores só aparecem com o ◇ marcado, em vez de vir junto com qualquer cor.",
      },
    ],
  },
  {
    version: "1.1.1",
    date: "2026-11-25T11:00:00-03:00",
    title: "Versões no histórico e correções",
    changes: [
      { kind: "melhoria", text: "O histórico do grupo mostra cada versão do Mesão, com link para as novidades." },
      { kind: "melhoria", text: "Filtro de incolor na coleção: sozinho, mostra só as cartas incolores." },
      {
        kind: "correcao",
        text: "No histórico, quem jogou antes de criar a conta aparecia entrando no grupo depois da própria primeira partida.",
      },
      {
        kind: "correcao",
        text: "Ao corrigir uma partida trocando o deck de alguém, o deck novo ficava sem cores (incolor). As partidas afetadas foram consertadas.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-25T09:53:00-03:00",
    title: "Ranking por pontos, editor de decks e coleção em galeria",
    changes: [
      {
        kind: "novo",
        text: "Ranking por pontos: vitória vale +4; abate vale +2 (dano de comandante, veneno ou mill) ou +1 (combate, combo ou drenagem); morrer por conta própria vale −1. A tabela aparece na página do ranking.",
      },
      { kind: "novo", text: "Perfil do jogador com pontos, abates e quem ele eliminou, por tipo de morte." },
      {
        kind: "novo",
        text: "Editor de deck (botão “Editar deck”, no lugar de “Editar lista”): troque nome, comandante e parceiro; adicione cartas pela busca; ajuste quantidades, proxies e remova cartas, com contador de 100 cartas e aviso de carta fora da cor ou repetida. “Colar lista” continua lá.",
      },
      {
        kind: "novo",
        text: "Coleção em galeria, com as mesmas ações da lista (quantidade, troca, remover), e filtros por nome, tipo, cor e ordenação.",
      },
      {
        kind: "novo",
        text: "O root pode corrigir uma partida já registrada: jogadores, decks, assentos, vencedor, eliminações, data e notas.",
      },
      { kind: "novo", text: "Decks aposentados que nunca entraram em partida podem ser excluídos pelo dono." },
      { kind: "novo", text: "Esta página de novidades, com a versão no rodapé e um aviso no menu quando sai versão nova." },
      { kind: "melhoria", text: "A busca de comandante sugere só cartas que podem ser comandante." },
      { kind: "melhoria", text: "O campo do segundo comandante (Partner) aparece também ao apertar Enter ou sair do campo." },
      { kind: "melhoria", text: "Notas da partida limitadas a 500 caracteres, com contador e rolagem." },
      {
        kind: "melhoria",
        text: "Listas de cartas (novo deck, colar lista e importar coleção) com rolagem e contador de cartas.",
      },
      {
        kind: "correcao",
        text: "Criar um deck colando a lista deixava o deck sem comandante e sem cartas. Os decks afetados foram consertados.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-24T15:30:00-03:00",
    title: "Lançamento do Mesão",
    changes: [
      {
        kind: "novo",
        text: "Registro de partidas com ordem dos assentos, vencedor, e como e por quem cada jogador foi eliminado; moderação pelos admins.",
      },
      { kind: "novo", text: "Decks com Partner, Background e Doctor's Companion, empréstimos e permissões de uso." },
      { kind: "novo", text: "Coleção física com cartas rotacionadas entre decks e proxies (as cartas que faltam)." },
      { kind: "novo", text: "Ranking com quem sobe e quem desce, Gazeta semanal e histórico do grupo." },
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;

/* Versão já vista por esta pessoa (conveniência local: o pontinho de "novidade"). */
const SEEN_KEY = "mesao:seen-version";
const SEEN_EVENT = "mesao:seen-version";

export function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function subscribeSeenVersion(cb: () => void) {
  window.addEventListener(SEEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SEEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function markVersionSeen() {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
}
