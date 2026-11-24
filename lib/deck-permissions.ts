/** Select do PostgREST para permissões de deck com o membro, o deck e o dono. */
export const PERMISSION_SELECT = `
  *,
  user:users!deck_permissions_user_id_fkey ( name ),
  deck:decks (
    id, name, owner_id, is_active, commander_name, partner_name, commander_image_url, partner_image_url, color_identity,
    owner:users!decks_owner_id_fkey ( name )
  )
`;
