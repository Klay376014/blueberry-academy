import { isTeamPreviewHiddenForme } from 'replay-parser'

/** One Pokémon of a registered six, and whether it was seen in the battle. */
export interface PartyMember {
  id: string
  /**
   * Whether this one appeared. Not "was picked": the log only records who was
   * seen, and a game that ended early can leave a picked Pokémon out of it
   * (CONTEXT.md, Bring).
   */
  appeared: boolean
}

/**
 * A side's registered six with the Pokémon that appeared marked, ready to draw.
 *
 * The order is the team signature's, never the bring's, and that is the point:
 * the same team is laid out the same way in every battle, so "this one is
 * missing today" reads off the position rather than the names.
 *
 * A slot whose forme Team Preview hid is drawn as the forme that walked out:
 * the six says `urshifu` and the bring says `urshifurapidstrike` for one
 * Pokémon, and drawing both would put a seventh member on a team of six.
 *
 * A Pokémon the bring has and the team does not — a row whose signatures drifted
 * apart — is drawn at the end rather than dropped. Nothing that was on the field
 * should vanish from the picture of the battle.
 *
 * With no team signature this is the old drawing, the bring alone: rows written
 * before both sides were kept still have one.
 */
export function partyOf(team: string | null, bring: string | null): PartyMember[] {
  const seen = idsOf(bring)
  const six = idsOf(team)

  if (!six.length) return seen.map((id) => ({ id, appeared: true }))

  const unclaimed = seen.filter((id) => !six.includes(id))
  const members = six.map((id) => {
    if (seen.includes(id)) return { id, appeared: true }

    const at = unclaimed.findIndex((brought) => isTeamPreviewHiddenForme(id, brought))
    const forme = at === -1 ? undefined : unclaimed.splice(at, 1)[0]

    return forme === undefined ? { id, appeared: false } : { id: forme, appeared: true }
  })

  return [...members, ...unclaimed.map((id) => ({ id, appeared: true }))]
}

function idsOf(signature: string | null): string[] {
  return (signature ?? '').split('|').filter(Boolean)
}
