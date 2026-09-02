import { describe, expect, it } from 'vitest'
import { Dex } from '@pkmn/dex'
import { moveDisplayName } from '../../app/shared/utils/moveName'
import zhHant from '../../app/shared/lib/dex/move-names-zh-hant.json'

/**
 * The lookup seam every localised move name goes through, and the shape of the
 * table behind it. What the timeline does with it is
 * `app/features/timeline/test/localised-names.spec.ts`; whether the table
 * reaches the names real logs put on screen is
 * `app/features/timeline/test/name-coverage.spec.ts`.
 *
 * See docs/adr/0015-localised-move-names.md.
 */

/** Official zh-Hant move names, one per shape the two sources produce. */
const OFFICIAL = {
  // Ordinary PokéAPI rows, which are the bulk of the table.
  Protect: '守住',
  'Wide Guard': '廣域防守',
  'U-turn': '急速折返',
  // The strings that reach the screen as effects rather than as a move's own
  // name: a side condition's start and end say these (#102).
  'Stealth Rock': '隱形岩',
  'Toxic Spikes': '毒菱',
  Tailwind: '順風',
  // Showdown's `data/text/zh-tw/moves.ts` filling an id PokéAPI's join has no
  // English name column for -- its key is the quoted one.
  '10,000,000 Volt Thunderbolt': '千萬伏特',
}

/** The one move in the dex the table has no name for. */
const UNTRANSLATED = 'Nihil Light'

describe('moveDisplayName', () => {
  for (const [name, chinese] of Object.entries(OFFICIAL)) {
    it(`shows ${name} as ${chinese} in zh-TW`, () => {
      expect(moveDisplayName(name, 'zh-TW')).toBe(chinese)
    })
  }

  it('leaves en on the English name the log itself carries', () => {
    for (const name of Object.keys(OFFICIAL)) {
      expect(moveDisplayName(name, 'en')).toBe(name)
    }
  })

  it('reads English for a locale that has no name table', () => {
    expect(moveDisplayName('Protect', 'ja')).toBe('Protect')
  })

  it('falls back to the English name for a move the table has not reached', () => {
    expect(moveDisplayName(UNTRANSLATED, 'zh-TW')).toBe(UNTRANSLATED)
  })

  it('gives back anything it does not know, rather than nothing', () => {
    // An effect string that is not a move at all -- an ability's name, which
    // #103 owns -- has to survive the lookup untouched. A guess would be
    // silently wrong and a blank would lose the only name there is.
    expect(moveDisplayName('Supreme Overlord', 'zh-TW')).toBe('Supreme Overlord')
    expect(moveDisplayName('notamove', 'zh-TW')).toBe('notamove')
  })
})

describe('the generated zh-Hant move table', () => {
  const entries = Object.entries(zhHant as Record<string, string>)

  it('is a flat object keyed by Showdown id', () => {
    for (const [id, name] of entries) {
      expect(id).toMatch(/^[a-z0-9]+$/)
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })

  it('is sorted by id, so a source update reads as a diff', () => {
    const ids = entries.map(([id]) => id)
    expect(ids).toEqual([...ids].sort())
  })

  it('spells names composed, the form a keyboard produces', () => {
    for (const [id, name] of entries) expect(name, id).toBe(name.normalize('NFC'))
  })

  it('holds no English name', () => {
    // A row that came out as `Protect` would mean the generator matched the
    // English column, and the fallback would never fire for it.
    for (const [id, name] of entries) expect(name, id).not.toBe(Dex.moves.get(id).name)
  })

  it('names every move a gen 9 battle can contain', () => {
    // The whole of what the timeline can show is here. Counting entries
    // instead would let gen 9 coverage collapse while old-generation coverage
    // grew: `Dex.moves.all()` repeats an entry per alias, so its length is not
    // a count of moves either.
    const missing = [
      ...new Map(
        Dex.forGen(9)
          .moves.all()
          .filter((move) => move.exists && move.num > 0 && !move.isNonstandard)
          .map((move) => [move.id, move]),
      ).values(),
    ]
      .filter((move) => !(move.id in zhHant))
      .map((move) => move.name)

    expect(missing).toEqual([])
  })
})
