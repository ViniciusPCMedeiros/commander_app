export type Role = "member" | "admin" | "root";
export type MatchStatus = "pending" | "approved" | "rejected";
export type UsageStatus = "free" | "allocated" | "partial_free" | "shared_rotation";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: Role;
  created_at: string;
}

export interface Deck {
  id: string;
  owner_id: string;
  name: string;
  commander_name: string;
  commander_image_url: string | null;
  partner_name: string | null;
  partner_image_url: string | null;
  color_identity: string[];
  moxfield_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DeckCard {
  id: string;
  deck_id: string;
  card_name: string;
  quantity: number;
  is_commander: boolean;
  is_proxy: boolean;
}

export interface Match {
  id: string;
  played_at: string;
  status: MatchStatus;
  win_condition: string | null;
  notes: string | null;
  created_by: string | null;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
}

export interface MatchParticipant {
  id: string;
  match_id: string;
  pilot_id: string;
  deck_id: string;
  deck_owner_id: string;
  commander_snapshot: string;
  color_identity_snapshot: string[];
  is_winner: boolean;
  seat_order: number | null;
  elimination_reason: string | null;
  /** Oponente (users.id) que causou a eliminação, quando aplicável. */
  eliminated_by: string | null;
}

export interface MatchWithParticipants extends Match {
  match_participants: (MatchParticipant & {
    pilot: { name: string } | null;
    owner: { name: string } | null;
    deck: { name: string; commander_image_url: string | null } | null;
  })[];
}

export interface DeckStats {
  deck_id: string;
  deck_name: string;
  commander_name: string;
  partner_name: string | null;
  commander_image_url: string | null;
  partner_image_url: string | null;
  color_identity: string[];
  is_active: boolean;
  owner_id: string;
  owner_name: string;
  total_games: number;
  total_wins: number;
  overall_winrate: number;
  owner_games: number;
  owner_wins: number;
  owner_winrate: number;
  borrowed_games: number;
  borrowed_wins: number;
  borrowed_winrate: number;
}

export interface PlayerStats {
  user_id: string;
  player_name: string;
  avatar_url: string | null;
  role: Role;
  total_games: number;
  total_wins: number;
  overall_winrate: number;
  own_deck_games: number;
  own_deck_wins: number;
  borrowed_deck_games: number;
  borrowed_deck_wins: number;
}

export interface CollectionStatus {
  id: string;
  user_id: string;
  owner_name: string;
  scryfall_id: string | null;
  card_name: string;
  mana_cost: string | null;
  type_line: string | null;
  image_url: string | null;
  color_identity: string[];
  owned_qty: number;
  available_for_trade: boolean;
  notes: string | null;
  in_decks_count: number;
  used_in_decks: string[];
  used_in_deck_ids: string[];
  balance: number;
  usage_status: UsageStatus;
  /** Decks ativos do dono que usam proxy desta carta (não consome cópia). */
  proxy_in_decks: string[];
}

export interface WeeklyNewspaper {
  id: string;
  edition_number: number;
  week_start: string;
  week_end: string;
  headline: string;
  content: string;
  matches_count: number;
  created_at: string;
  generated_by: string | null;
  source: "ai" | "fallback" | null;
}

export interface AIInsight {
  id: string;
  user_id: string;
  insight_type: "player_profile" | "monthly_recap";
  content: string;
  games_snapshot: number;
  created_at: string;
}

export interface DeckPermission {
  deck_id: string;
  user_id: string;
  granted_by: string;
  created_at: string;
}

export interface DeckPermissionWithRelations extends DeckPermission {
  user: { name: string } | null;
  deck:
    | (Pick<Deck, "id" | "name" | "owner_id" | "is_active" | "commander_name" | "partner_name" | "commander_image_url" | "partner_image_url" | "color_identity"> & {
        owner: { name: string } | null;
      })
    | null;
}

/** Carta usada como proxy nos decks ativos do jogador (view user_proxy_cards), enriquecida com a Scryfall. */
export interface ProxyCard {
  user_id: string;
  card_name: string;
  proxy_qty: number;
  proxy_in_decks: string[];
  proxy_in_deck_ids: string[];
  owned_originals: number;
  free_originals: number;
  needed_qty: number;
  image_url?: string | null;
  type_line?: string | null;
  color_identity?: string[];
  /** Outros membros com cópia livre marcada para troca. */
  trade_offers?: { user_id: string; name: string }[];
}

export interface PlayerMilestones {
  user_id: string;
  player_name: string;
  avatar_url: string | null;
  joined_at: string;
  first_match_id: string | null;
  first_match_at: string | null;
  first_match_commander: string | null;
  first_match_deck_id: string | null;
  first_match_borrowed: boolean | null;
  first_match_won: boolean | null;
  first_win_id: string | null;
  first_win_at: string | null;
  first_win_commander: string | null;
  first_win_deck_id: string | null;
}
