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
import { fieldSnapshots } from '../utils/battleField'
import { moveDisplayName } from '~/shared/utils/moveName'
import {
  abilityDisplayName,
  effectDisplayName,
  fieldConditionDisplayName,
  itemDisplayName,
  sourceDisplayName,
  statDisplayName,
  teraTypeDisplayName,
} from '~/shared/utils/battleTerms'
import moveTable from '~/shared/lib/dex/move-names-zh-hant.json'
import abilityTable from '~/shared/lib/dex/ability-names-zh-hant.json'
import itemTable from '~/shared/lib/dex/item-names-zh-hant.json'
import weatherTable from '~/shared/lib/dex/weather-names-zh-hant.json'
import statTable from '~/shared/lib/dex/stat-names-zh-hant.json'
import typeTable from '~/shared/lib/dex/type-names-zh-hant.json'
import speciesTable from '~/shared/lib/dex/species-names-zh-hant.json'

/**
 * Whether the generated tables reach every identifier real logs actually put
 * on screen, and whether the name they reach it with came out of a table that
 * kind of identifier is allowed to be named from.
 *
 * This exists because most of these tables have no authority to be verified
 * against. The official Taiwan Pokédex carries species and abilities and
 * nothing else — no moves, no items — so `verify:species-names-zh-hant` and
 * `verify:ability-names-zh-hant` cover two of the six tables and the rest have
 * no oracle at all. What can be checked without one is coverage — that nothing
 * the screen shows is left in English by accident rather than on purpose — and
 * the replay fixtures are committed, so checking it stays hermetic
 * (docs/adr/0015-localised-move-names.md,
 * docs/adr/0016-localised-battle-vocabulary.md).
 *
 * Coverage alone reads a wrong name as a covered one, though: a string that
 * came back translated has passed, whatever it was translated as. So each
 * category is checked twice — every string has a name, and every name it got
 * came from a table that category may draw on. For the one category where the
 * log states no namespace at all, `@pkmn/dex` judges a third time.
 *
 * It is deliberately a table of categories: a new surface is a new row here.
 */

const FIXTURES = fileURLToPath(
  new URL('../../../../../../packages/replay-parser/test/fixtures/', import.meta.url),
)

const logs = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json'))
  .map(
    (file) => (JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { log: string }).log,
  )

/** Every row the timeline can draw for these logs, at both detail levels. */
function fixtureRows(): TimelineRow[] {
  return logs.flatMap((log) =>
    parseTimeline(log).turns.flatMap((turn) => [
      ...rowsOf(turn, { detailed: true }),
      ...rowsOf(turn, { detailed: false }),
    ]),
  )
}

/** Every note on a row, wherever on it they hang. */
const notesOf = (row: TimelineRow): RowNote[] => [
  ...row.notes,
  ...row.targets.flatMap((target) => target.notes),
  ...row.bystanders.flatMap((bystander) => bystander.notes),
]

/** Every HP change a row draws, its own and its targets'. */
const healthOf = (row: TimelineRow) => [
  ...(row.health === null ? [] : [row.health]),
  ...row.targets.flatMap((target) => target.health),
]

/** One named parameter of one of these message keys, from a row or a note. */
function params(row: TimelineRow, keys: string[], name: string): string[] {
  const said = [row.message, ...notesOf(row)].filter((message) => message !== null)

  return said.flatMap((message) => {
    const value = message.params?.[name]

    return keys.includes(message.key) && value !== undefined ? [value] : []
  })
}

const rows = fixtureRows()

/** What the FieldBar draws as chips, which is not on any row. */
const snapshots = logs.flatMap((log) => fieldSnapshots(parseTimeline(log)))

type Table = Record<string, string>

const MOVES = moveTable as Table
const ABILITIES = abilityTable as Table
const ITEMS = itemTable as Table
const WEATHER = weatherTable as Table
const STATS = statTable as Table
const TYPES = typeTable as Table
const SPECIES = speciesTable as Table

/**
 * What reaches the screen, per kind of identifier, and what names it.
 *
 * `named` is the seam the components call — not a table lookup written out
 * again here, so a lookup that regressed would show up as a gap rather than be
 * papered over. `from` is the tables that kind of identifier may be named out
 * of; a name from anywhere else is the failure this file's second half exists
 * to catch.
 */
const CATEGORIES = [
  {
    what: "a move's own name",
    strings: rows.flatMap((row) => (row.move === null ? [] : [row.move])),
    named: moveDisplayName,
    from: [MOVES],
    // The log line is `|move|`, which settles the namespace, but a move id
    // that is also something else would still be a coin flip if the table were
    // ever built off the wrong column.
    dex: ['move'],
  },
  {
    what: 'a single-turn effect, and what a hit was blocked by',
    strings: rows.flatMap((row) => params(row, ['effectStarted', 'effectHeld'], 'effect')),
    named: effectDisplayName,
    from: [MOVES, ABILITIES, ITEMS],
    // The one category where the log states nothing. `-singleturn`,
    // `-activate`, `-start` and `-end` carry a `move:`, `ability:` or `item:`
    // prefix sometimes and not others — measured over 1803 replays, 15 of the
    // 118 distinct strings arrive both ways — so the dex is what says which
    // namespace a name may come from, and a name it spells for two of them is
    // declined rather than guessed.
    dex: ['move', 'ability', 'item'],
  },
  {
    what: 'a side condition going up or coming down',
    strings: rows.flatMap((row) => params(row, ['sideEffectStarted', 'sideEffectEnded'], 'effect')),
    named: fieldConditionDisplayName,
    from: [MOVES, WEATHER],
    dex: ['move'],
  },
  {
    what: 'something on the whole field going up or coming down',
    strings: rows.flatMap((row) =>
      params(row, ['fieldEffectStarted', 'fieldEffectEnded'], 'effect'),
    ),
    named: fieldConditionDisplayName,
    from: [MOVES, WEATHER],
    dex: ['move'],
  },
  {
    what: 'the weather',
    strings: [
      ...rows.flatMap((row) => params(row, ['weather'], 'weather')),
      // The same identifier on the FieldBar's own chip, which no row draws.
      ...snapshots.flatMap((snapshot) => (snapshot.weather === null ? [] : [snapshot.weather])),
    ],
    named: fieldConditionDisplayName,
    from: [WEATHER, MOVES],
    // Every weather id is also a move id: `snowscape` is the state 下雪 and
    // the move 雪景. The `-weather` line settles which is meant, so this is
    // the category where the dex has no useful opinion.
    dex: null,
  },
  {
    what: 'an ability the log announced by name',
    strings: [
      ...rows.flatMap((row) => params(row, ['ability'], 'ability')),
      // The whole-field ones again, as the FieldBar's chips (#119). These
      // fixtures show no aura and no Ruin — the field row's own names are
      // checked in localised-names.spec.ts — so this adds coverage for
      // whatever a later fixture brings rather than anything today.
      ...snapshots.flatMap((snapshot) => snapshot.fieldAbilities),
    ],
    named: abilityDisplayName,
    from: [ABILITIES],
    dex: null,
  },
  {
    what: 'an item a Pokémon lost',
    strings: rows.flatMap((row) => params(row, ['lostItem'], 'item')),
    named: itemDisplayName,
    from: [ITEMS],
    dex: null,
  },
  {
    what: 'what a [from] blamed a change on',
    strings: rows.flatMap((row) =>
      healthOf(row).flatMap((change) => (change.from === null ? [] : [change.from])),
    ),
    named: sourceDisplayName,
    from: [MOVES, ABILITIES, ITEMS, WEATHER, SPECIES],
    // This is the one identifier the parser hands over with its namespace
    // still attached, so the log itself says which table to use.
    dex: null,
  },
  {
    what: 'the reason a Pokémon could not move',
    strings: rows.flatMap((row) => params(row, ['couldNotMove'], 'reason')),
    named: sourceDisplayName,
    from: [MOVES, ABILITIES, ITEMS, WEATHER, SPECIES],
    dex: null,
  },
  {
    what: 'a stat a boost line named',
    strings: [
      ...rows.flatMap((row) => params(row, ['statRose', 'statFell'], 'stat')),
      ...snapshots.flatMap((snapshot) => [
        ...snapshot.slots.flatMap((slot) => Object.keys(slot.boosts)),
        ...snapshot.offField.flatMap((pokemon) => Object.keys(pokemon.boosts)),
      ]),
    ],
    named: statDisplayName,
    from: [STATS],
    dex: null,
  },
  {
    what: 'a Tera type',
    strings: [
      ...rows.flatMap((row) => params(row, ['terastallized'], 'type')),
      ...snapshots.flatMap((snapshot) => [
        ...snapshot.slots.flatMap((slot) => (slot.teraType === null ? [] : [slot.teraType])),
        ...snapshot.offField.flatMap((pokemon) =>
          pokemon.teraType === null ? [] : [pokemon.teraType],
        ),
      ]),
    ],
    named: teraTypeDisplayName,
    from: [TYPES],
    dex: null,
  },
  {
    what: "a screen or a room on the FieldBar's chips",
    strings: snapshots.flatMap((snapshot) => [
      ...snapshot.screens.p1,
      ...snapshot.screens.p2,
      ...snapshot.fieldEffects,
    ]),
    named: fieldConditionDisplayName,
    from: [MOVES, WEATHER],
    dex: ['move'],
  },
  {
    what: 'a condition on a chip',
    strings: [
      ...rows.flatMap((row) => (row.status === null ? [] : [row.status])),
      ...rows.flatMap((row) => params(row, ['statusCured'], 'status')),
      ...snapshots.flatMap((snapshot) => [
        ...snapshot.slots.flatMap((slot) => (slot.status === null ? [] : [slot.status])),
        ...snapshot.offField.flatMap((pokemon) =>
          pokemon.status === null ? [] : [pokemon.status],
        ),
      ]),
    ],
    // There is no lookup, and that is the decision rather than an omission:
    // every one of these is in `EXPECTED_GAPS` below with its reason.
    named: (string: string) => string,
    from: [],
    dex: null,
  },
]

/**
 * The identifiers the fixtures show that no table names, and why.
 *
 * Every one of them is a value no source has an official noun for, which is a
 * fact about the sources and not a gap to be filled later:
 *
 * - `brn` / `par` / `psn` / `tox` / `slp` / `frz` and `confusion` are
 *   conditions. Showdown's own `StatusNames` are eight `null`s (read
 *   first-hand at the pinned ref), PokéAPI's `move_meta_ailment_names.csv`
 *   has zero zh-Hant rows, and the games say `{POKEMON}被灼傷了！` rather
 *   than naming the state. `confusion` additionally collides with the move
 *   Confusion, so the chain declines it outright rather than showing 念力.
 * - `Recoil` and `drain` are protocol mechanism values on a `[from]`. The
 *   games have no noun for either; they say what happened in a sentence.
 * - `flinch` is the same: a reason for a `cant` line, not a thing with a name.
 * - `Illusion`'s line is the ability wearing off and the ability table does
 *   name it, so it is *not* here — it is in the covered set. Nor are
 *   `Supreme Overlord` and `Toxic Debris`, which #102 had to whitelist and the
 *   ability table now reaches.
 *
 * A whitelist rather than a tolerated count: one more of these appearing has
 * to be looked at, not absorbed. The test below keeps it from going stale, and
 * measured it does — `fallen5`, `recharge` and `none` were on this list from a
 * wider corpus and it caught all three, because these logs do not show them.
 */
const EXPECTED_GAPS = new Set([
  'brn',
  'par',
  'psn',
  'tox',
  'slp',
  'frz',
  'confusion',
  'Recoil',
  'drain',
  'flinch',
])

/**
 * What the dex spells one identifier, over the namespaces these tables split
 * between them. More than one entry means the log's own line is the only thing
 * that could have said which was meant.
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

  it('reads the field at all, so the chips are really being checked', () => {
    expect(snapshots.length).toBeGreaterThan(50)
  })

  for (const { what, strings, named, from, dex } of CATEGORIES) {
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

    it(`names ${what} only out of a table it may be named from`, () => {
      // The half coverage cannot see: a string the screen shows a Chinese name
      // for has to have got that name from one of this category's own tables.
      // A lookup wired to the wrong table reads exactly like a covered one on
      // the report above.
      const allowed = new Set(from.flatMap((table) => Object.values(table)))
      const wrong = distinct
        .map((string) => [string, named(string, 'zh-TW')] as const)
        .filter(([string, said]) => said !== string && !allowed.has(said))
        .map(([string, said]) => `${string} → ${said}`)

      expect(wrong, 'this name did not come from a table this category may use').toEqual([])
    })

    if (dex !== null) {
      it(`renames no one of ${what} out of a namespace the log did not state`, () => {
        const wrong = distinct
          .filter((string) => named(string, 'zh-TW') !== string)
          .filter((string) => {
            const kinds = dexKinds(string)

            return kinds.length !== 1 || !dex.includes(kinds[0]!)
          })
          .map(
            (string) =>
              `${string} → ${named(string, 'zh-TW')} (dex: ${dexKinds(string).join('+') || 'nothing'})`,
          )

        expect(wrong, 'this is a name from the wrong namespace reaching the screen').toEqual([])
      })
    }

    it(`leaves every one of ${what} untouched in en`, () => {
      for (const string of distinct) expect(named(string, 'en')).toBe(string)
    })
  }

  it('has no stale entry in EXPECTED_GAPS', () => {
    // A gap that has since been filled, or an identifier the fixtures stopped
    // emitting, would otherwise sit here forever hiding a real one.
    const seen = new Set(
      CATEGORIES.flatMap(({ strings, named }) =>
        strings.filter((string) => named(string, 'zh-TW') === string),
      ),
    )
    const stale = [...EXPECTED_GAPS].filter((string) => !seen.has(string))

    expect(stale, 'these are named now, or the fixtures no longer show them').toEqual([])
  })

  it('leaves nothing on screen unaccounted for', () => {
    // The number the ticket asks for: how much of the vocabulary real logs put
    // on screen the reader of zh-TW actually gets in their own language.
    const distinct = new Set(CATEGORIES.flatMap(({ strings }) => strings))
    const named = new Set(
      CATEGORIES.flatMap(({ strings, named: name }) =>
        strings.filter((string) => name(string, 'zh-TW') !== string),
      ),
    )

    expect(
      [...distinct].filter((string) => !named.has(string) && !EXPECTED_GAPS.has(string)),
    ).toEqual([])
  })
})
