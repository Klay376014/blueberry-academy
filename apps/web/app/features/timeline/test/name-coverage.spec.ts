// @vitest-environment node
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import { rowsOf } from '../utils/timelineRows'
import type { RowNote, TimelineRow } from '../utils/timelineRows'
import { effectDisplayName, moveDisplayName } from '~/shared/utils/moveName'

/**
 * Whether the generated tables reach every identifier real logs actually put
 * on screen.
 *
 * This exists because the move table has no authority to be verified against:
 * the official Taiwan Pokédex carries species and abilities and no moves, so
 * there is nothing to play the part `verify:species-names-zh-hant` plays for
 * ADR-0014. What can be checked without an oracle is coverage — that nothing
 * the screen shows is left in English by accident rather than on purpose — and
 * the replay fixtures are committed, so checking it stays hermetic
 * (docs/adr/0015-localised-move-names.md).
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
 * why. Both are abilities arriving on a `blocked by` row — `|-activate|…|
 * ability: Supreme Overlord` — which is #103's vocabulary, not #102's.
 *
 * A whitelist rather than a tolerated count: one more of these appearing has
 * to be looked at, not absorbed.
 */
const EXPECTED_GAPS = new Set(['Supreme Overlord', 'Toxic Debris'])

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
