// @vitest-environment node
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dex } from '@pkmn/dex'
import { parseTimeline, toID } from 'replay-parser'
import { rowsOf } from '../utils/timelineRows'
import type { RowNote, TimelineRow } from '../utils/timelineRows'
import { effectDisplayName, moveDisplayName } from '~/shared/utils/moveName'

/**
 * Whether the generated tables reach every identifier real logs actually put
 * on screen, and whether the name they reach it with came from the right
 * namespace.
 *
 * This exists because the move table has no authority to be verified against:
 * the official Taiwan Pokédex carries species and abilities and no moves, so
 * there is nothing to play the part `verify:species-names-zh-hant` plays for
 * ADR-0014. What can be checked without an oracle is coverage — that nothing
 * the screen shows is left in English by accident rather than on purpose — and
 * the replay fixtures are committed, so checking it stays hermetic
 * (docs/adr/0015-localised-move-names.md).
 *
 * Coverage alone reads a wrong name as a covered one, though: an effect string
 * that came back translated has passed, whatever it was translated as. So each
 * category is checked twice — every string has a name, and no string was given
 * a name from a namespace the log never established. `@pkmn/dex` is the judge
 * of the second one, and it is a devDependency, so that stays hermetic too.
 *
 * It is deliberately a table of categories rather than a run of assertions
 * about moves: #103 adds abilities, items, weather and the field to it by
 * adding rows here, and shrinks `EXPECTED_GAPS` as it goes.
 */

const FIXTURES = fileURLToPath(
  new URL('../../../../../../packages/replay-parser/test/fixtures/', import.meta.url),
)

/** Every row the timeline can draw for these logs, at both detail levels. */
function fixtureRows(): TimelineRow[] {
  return readdirSync(FIXTURES)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const { log } = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { log: string }

      return parseTimeline(log).turns.flatMap((turn) => [
        ...rowsOf(turn, { detailed: true }),
        ...rowsOf(turn, { detailed: false }),
      ])
    })
}

/** Every note on a row, wherever on it they hang. */
const notesOf = (row: TimelineRow): RowNote[] => [
  ...row.notes,
  ...row.targets.flatMap((target) => target.notes),
  ...row.bystanders.flatMap((bystander) => bystander.notes),
]

/** The `effect` parameter of one of these keys, from a row's own message. */
function messageEffects(row: TimelineRow, keys: string[]): string[] {
  const said = row.message
  if (!said || !keys.includes(said.key) || said.params?.effect === undefined) return []

  return [said.params.effect]
}

const rows = fixtureRows()

/**
 * What reaches the screen, per kind of identifier, and what names it.
 *
 * `named` is the seam the components call — not a table lookup written out
 * again here, so a lookup that regressed would show up as a gap rather than
 * be papered over.
 */
const CATEGORIES = [
  {
    what: "a move's own name",
    strings: rows.flatMap((row) => (row.move === null ? [] : [row.move])),
    named: moveDisplayName,
  },
  {
    what: 'a single-turn effect, and what a hit was blocked by',
    strings: rows.flatMap((row) => [
      ...notesOf(row)
        .filter((note) => note.key === 'effectStarted' || note.key === 'effectHeld')
        .flatMap((note) => (note.params?.effect === undefined ? [] : [note.params.effect])),
      ...messageEffects(row, ['effectStarted', 'effectHeld']),
    ]),
    named: effectDisplayName,
  },
  {
    what: 'a side condition going up or coming down',
    strings: rows.flatMap((row) => messageEffects(row, ['sideEffectStarted', 'sideEffectEnded'])),
    named: effectDisplayName,
  },
]

/**
 * The identifiers the fixtures show that no table in this ticket names, and
 * why. All three are #103's vocabulary rather than #102's:
 *
 * - `Supreme Overlord` and `Toxic Debris` are abilities, arriving on a
 *   `blocked by` row as `|-activate|…|ability: Supreme Overlord`.
 * - `confusion` is a condition, arriving bare as `|-activate|…|confusion`, and
 *   its id is also the move Confusion's. The move table would name it 念力,
 *   which is the wrong one of the two, so `effectDisplayName` declines it —
 *   the condition's own name is a table #103 owns.
 *
 * A whitelist rather than a tolerated count: one more of these appearing has
 * to be looked at, not absorbed.
 */
const EXPECTED_GAPS = new Set(['Supreme Overlord', 'Toxic Debris', 'confusion'])

/**
 * What the dex spells one identifier, over the namespaces #102 and #103 split
 * between them. More than one entry means the log's own line is the only thing
 * that could have said which was meant, and a bare line did not say.
 */
function dexKinds(name: string): string[] {
  const id = toID(name)
  const move = Dex.moves.get(id)

  return [
    ...(move.exists && move.num > 0 ? ['move'] : []),
    ...(Dex.abilities.get(id).exists ? ['ability'] : []),
    ...(Dex.items.get(id).exists ? ['item'] : []),
    ...(Object.hasOwn(Dex.data.Conditions, id) ? ['condition'] : []),
  ]
}

describe('the identifiers the fixtures put on screen', () => {
  it('draws rows at all, so an empty walk cannot pass as full coverage', () => {
    expect(rows.length).toBeGreaterThan(1000)
  })

  for (const { what, strings, named } of CATEGORIES) {
    const distinct = [...new Set(strings)].sort()

    it(`has ${what} to check`, () => {
      expect(distinct.length).toBeGreaterThan(0)
    })

    it(`names every one of ${what} in zh-TW`, () => {
      const unnamed = distinct.filter(
        (string) => !EXPECTED_GAPS.has(string) && named(string, 'zh-TW') === string,
      )

      expect(
        unnamed,
        'add these to the generated table, or to EXPECTED_GAPS with a reason',
      ).toEqual([])
    })

    it(`renames no one of ${what} out of a namespace the log did not state`, () => {
      // The half of this file coverage cannot see. A string the screen shows a
      // Chinese name for has to be one the dex knows as a move and as nothing
      // else -- `confusion` is a move id and a condition id, and the log line
      // it arrives on says which only sometimes.
      const wrong = distinct
        .filter((string) => named(string, 'zh-TW') !== string)
        .filter((string) => dexKinds(string).join('+') !== 'move')
        .map(
          (string) =>
            `${string} → ${named(string, 'zh-TW')} (dex: ${dexKinds(string).join('+') || 'nothing'})`,
        )

      expect(wrong, 'this is a name from the wrong namespace reaching the screen').toEqual([])
    })

    it(`leaves every one of ${what} untouched in en`, () => {
      for (const string of distinct) expect(named(string, 'en')).toBe(string)
    })
  }

  it('has no stale entry in EXPECTED_GAPS', () => {
    // A gap that has since been filled, or an identifier the fixtures stopped
    // emitting, would otherwise sit here forever hiding a real one.
    const seen = new Set(CATEGORIES.flatMap(({ strings }) => strings))
    const stale = [...EXPECTED_GAPS].filter(
      (string) => !seen.has(string) || effectDisplayName(string, 'zh-TW') !== string,
    )

    expect(stale).toEqual([])
  })
})
