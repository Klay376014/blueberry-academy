import { describe, expect, it } from 'vitest'
import { partyOf } from '../../app/shared/utils/party'

/**
 * The registered six with the ones that appeared marked — the reading behind
 * "which two did they leave at home", which is the question a six-into-four
 * format is played on.
 *
 * `appeared` rather than `picked` throughout, because that is what the data
 * knows: `bring_signature` holds the Pokémon that were actually seen, and a
 * game that ended early can leave a picked one out of it (CONTEXT.md, Bring).
 */

const TEAM = 'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu'
const BRING = 'calyrexshadow|incineroar|ironhands|urshifu'

describe('partyOf', () => {
  it('keeps the registered six in signature order, whatever the bring says', () => {
    // The order is the point of drawing all six: the same team is laid out the
    // same way in every battle, so "this one is missing today" is something a
    // reader can see without reading names.
    expect(partyOf(TEAM, BRING).map((member) => member.id)).toEqual(TEAM.split('|'))
  })

  it('marks the ones that appeared', () => {
    expect(partyOf(TEAM, BRING)).toEqual([
      { id: 'calyrexshadow', appeared: true },
      { id: 'incineroar', appeared: true },
      { id: 'ironhands', appeared: true },
      { id: 'ragingbolt', appeared: false },
      { id: 'rillaboom', appeared: false },
      { id: 'urshifu', appeared: true },
    ])
  })

  it('marks three as absent when only three of the four were seen', () => {
    // A forfeit or a fast game leaves a picked Pokémon unseen, and the row is
    // stored that way on purpose (`bring_complete`). Nothing here may claim
    // that fourth one was not picked.
    const short = partyOf(TEAM, 'calyrexshadow|incineroar|urshifu')

    expect(short.filter((member) => !member.appeared)).toHaveLength(3)
  })

  it('draws a Pokémon the bring has and the team does not, rather than losing it', () => {
    const drifted = partyOf(TEAM, `${BRING}|pikachu`)

    expect(drifted).toHaveLength(7)
    expect(drifted.at(-1)).toEqual({ id: 'pikachu', appeared: true })
  })

  it('falls back to the bring when no registered six was stored', () => {
    // Rows written before the parser kept both sides, and any row whose
    // `details` lost the team. The old drawing is the right one there.
    expect(partyOf(null, BRING).map((member) => member.id)).toEqual(BRING.split('|'))
    expect(partyOf('', BRING).every((member) => member.appeared)).toBe(true)
  })

  it('draws the six as all absent when nothing appeared', () => {
    // A battle whose bring is missing still has a team worth looking at.
    expect(partyOf(TEAM, null).every((member) => !member.appeared)).toBe(true)
    expect(partyOf(TEAM, null)).toHaveLength(6)
  })

  it('is empty when there is nothing to draw', () => {
    expect(partyOf(null, null)).toEqual([])
  })
})
